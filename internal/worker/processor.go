package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"

	"contents-ranking/internal/metrics"
	"contents-ranking/internal/models"
)

const (
	maxHeartbeatGap = 35_000 // ms — gaps larger than this are seeks/pauses
	rankThreshold   = 30_000 // ms — accumulated watch time needed for one ranking point
	sessionTTL      = 6 * time.Hour
	rankingKey      = "ranking:global"
)

// rankScript runs an atomic read-modify-write on the session hash.
//
// Logic:
//   - 0 < delta <= maxHeartbeatGap: continuous watch, add to accumulated
//   - delta > maxHeartbeatGap: seek or resume, reset accumulated
//   - delta <= 0: backward seek or duplicate, update last_playhead only
//   - accumulated >= rankThreshold: ZINCRBY ranking:global, subtract threshold
//
// Lua keeps this atomic so concurrent workers on the same session don't race.
//
// KEYS[1] session key, KEYS[2] ranking key
// ARGV[1] video_id, ARGV[2] playhead (ms), ARGV[3] maxHeartbeatGap,
// ARGV[4] rankThreshold, ARGV[5] TTL (seconds)
// Returns 1 if a ranking point was awarded, 0 otherwise.
var rankScript = redis.NewScript(`
local last   = tonumber(redis.call('HGET', KEYS[1], 'last_playhead')) or 0
local accum  = tonumber(redis.call('HGET', KEYS[1], 'accumulated'))   or 0
local cur    = tonumber(ARGV[2])
local gap    = tonumber(ARGV[3])
local thresh = tonumber(ARGV[4])
local ttl    = tonumber(ARGV[5])

local delta = cur - last
local ranked = 0

if delta > 0 and delta <= gap then
    accum = accum + delta
elseif delta > gap then
    accum = 0
end

if accum >= thresh then
    redis.call('ZINCRBY', KEYS[2], 1, ARGV[1])
    accum = accum - thresh
    ranked = 1
end

redis.call('HSET',   KEYS[1], 'last_playhead', cur, 'accumulated', accum)
redis.call('EXPIRE', KEYS[1], ttl)

return ranked
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

	log.Printf("worker: received event session=%s user=%s video=%s playhead=%dms",
		event.SessionID, event.UserID, event.VideoID, event.Playhead)

	sessionKey := fmt.Sprintf("session:%s:%s", event.SessionID, event.VideoID)

	result, err := rankScript.Run(ctx, p.rdb,
		[]string{sessionKey, rankingKey},
		event.VideoID,
		event.Playhead,
		maxHeartbeatGap,
		rankThreshold,
		int(sessionTTL.Seconds()),
	).Int()
	if err != nil {
		metrics.WorkerEventsProcessedTotal.WithLabelValues("error").Inc()
		return fmt.Errorf("lua rankScript (session=%s video=%s): %w",
			event.SessionID, event.VideoID, err)
	}

	metrics.WorkerEventsProcessedTotal.WithLabelValues("success").Inc()
	metrics.WorkerProcessingDuration.Observe(time.Since(start).Seconds())

	if result == 1 {
		metrics.WorkerRankingUpdatesTotal.Inc()
		log.Printf("[RANKING UPDATED] VideoID: %s, UserID: %s",
			event.VideoID, event.UserID)
	}

	return nil
}
