package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"

	"contents-ranking/internal/metrics"
	"contents-ranking/internal/models"
)

const (
	maxHeartbeatGap   = 35_000 // ms — gaps larger than this are seeks/pauses
	rankThreshold     = 30_000 // ms — accumulated watch time needed for one ranking point
	sessionTTL        = 6 * time.Hour
	rankingKey        = "ranking:global"
	velocityWindowSec = 60
)

// rankScript runs an atomic read-modify-write on the session hash.
//
// Logic:
//   - 0 < delta <= maxHeartbeatGap: continuous watch, add to accumulated
//   - delta > maxHeartbeatGap: seek or resume, reset accumulated
//   - delta <= 0: backward seek or duplicate, ignore event (no state change)
//   - accumulated >= rankThreshold: ZINCRBY ranking:global, subtract threshold
//
// Lua keeps this atomic so concurrent workers on the same session don't race.
//
// KEYS[1] session key, KEYS[2] ranking key
// ARGV[1] video_id, ARGV[2] playhead (ms), ARGV[3] maxHeartbeatGap,
// ARGV[4] rankThreshold, ARGV[5] TTL (seconds)
// Returns the number of ranking points awarded for this event.
var rankScript = redis.NewScript(`
local last   = tonumber(redis.call('HGET', KEYS[1], 'last_playhead')) or 0
local accum  = tonumber(redis.call('HGET', KEYS[1], 'accumulated'))   or 0
local cur    = tonumber(ARGV[2])
local gap    = tonumber(ARGV[3])
local thresh = tonumber(ARGV[4])
local ttl    = tonumber(ARGV[5])
local now_parts = redis.call('TIME')
local now_ms = now_parts[1] * 1000 + math.floor(now_parts[2] / 1000)
local window_ms = ` + fmt.Sprint(velocityWindowSec*1000) + `

local delta = cur - last
local ranked = 0

-- Debug copies for inspection
local debug_delta = delta
local debug_accum = accum
local debug_cur = cur
local debug_last = last

if delta > 0 then
    if delta <= gap then
        accum = accum + delta
    elseif delta > gap then
        accum = 0
    end

    while accum >= thresh do
        redis.call('ZINCRBY', KEYS[2], 1, ARGV[1])
        accum = accum - thresh
        ranked = ranked + 1

        -- Trending velocity tracking
        local velocity_key = 'ranking:velocity:' .. ARGV[1]
        local trending_key = 'ranking:trending'
        -- Use a per-video monotonic counter to ensure each velocity
        -- event has a unique member, even when multiple events share
        -- the same millisecond timestamp.
        local seq = redis.call('INCR', velocity_key .. ':seq')
        local member = tostring(now_ms) .. '-' .. tostring(seq)

        redis.call('ZADD', velocity_key, now_ms, member)
        redis.call('ZREMRANGEBYSCORE', velocity_key, 0, now_ms - window_ms)
        local velocity = redis.call('ZCARD', velocity_key)
        redis.call('ZADD', trending_key, velocity, ARGV[1])
        -- TTL so inactive velocity keys are removed and do not leak memory
        local window_sec = math.floor(window_ms / 1000)
        redis.call('EXPIRE', velocity_key, window_sec * 2)
        redis.call('EXPIRE', velocity_key .. ':seq', window_sec * 2)
    end

    redis.call('HSET', KEYS[1], 'last_playhead', cur, 'accumulated', accum)
end

redis.call('EXPIRE', KEYS[1], ttl)

return {ranked, debug_delta, debug_accum, debug_cur, debug_last}
`)

// Processor handles the business logic for a single heartbeat event.
type Processor struct {
	rdb *redis.Client
}

func NewProcessor(rdb *redis.Client) *Processor {
	return &Processor{rdb: rdb}
}

func (p *Processor) Process(ctx context.Context, msg kafka.Message) error {
	start := time.Now()

	var event models.HeartbeatEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		metrics.WorkerEventsProcessedTotal.WithLabelValues("error").Inc()
		return fmt.Errorf("unmarshal: %w", err)
	}

	if os.Getenv("DEBUG") != "" {
		log.Printf("worker: received event session=%s user=%s video=%s playhead=%dms",
			event.SessionID, event.UserID, event.VideoID, event.Playhead)
	}

	sessionKey := fmt.Sprintf("session:%s:%s", event.SessionID, event.VideoID)

	raw, err := rankScript.Run(ctx, p.rdb,
		[]string{sessionKey, rankingKey},
		event.VideoID,
		event.Playhead,
		maxHeartbeatGap,
		rankThreshold,
		int(sessionTTL.Seconds()),
	).Result()
	if err != nil {
		metrics.WorkerEventsProcessedTotal.WithLabelValues("error").Inc()
		return fmt.Errorf("lua rankScript (session=%s video=%s): %w",
			event.SessionID, event.VideoID, err)
	}

	results, ok := raw.([]interface{})
	if !ok || len(results) < 5 {
		metrics.WorkerEventsProcessedTotal.WithLabelValues("error").Inc()
		return fmt.Errorf("lua rankScript (session=%s video=%s): unexpected return type %T",
			event.SessionID, event.VideoID, raw)
	}

	// Lua returns: {increments, debug_delta, debug_accum, debug_cur, debug_last}
	toInt := func(v interface{}) int64 {
		switch t := v.(type) {
		case int64:
			return t
		case int:
			return int64(t)
		case float64:
			return int64(t)
		case string:
			val, _ := strconv.ParseInt(t, 10, 64)
			return val
		default:
			return 0
		}
	}

	increments := toInt(results[0])
	debugDelta := toInt(results[1])
	debugAccum := toInt(results[2])
	debugCur := toInt(results[3])
	debugLast := toInt(results[4])

	metrics.WorkerEventsProcessedTotal.WithLabelValues("success").Inc()
	metrics.WorkerProcessingDuration.Observe(time.Since(start).Seconds())

	if os.Getenv("DEBUG") != "" {
		log.Printf("lua debug video=%s delta=%d accum=%d cur=%d last=%d increments=%d",
			event.VideoID, debugDelta, debugAccum, debugCur, debugLast, increments)
	}

	if increments > 0 {
		metrics.WorkerRankingUpdatesTotal.Add(float64(increments))
		metrics.WorkerRankingVelocityUpdatesTotal.Add(float64(increments))
		if os.Getenv("DEBUG") != "" {
			log.Printf("[RANKING UPDATED] VideoID: %s, UserID: %s, points=%d",
				event.VideoID, event.UserID, increments)
		}
	}

	return nil
}
