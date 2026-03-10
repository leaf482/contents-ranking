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

// rankBatchScript processes N events in one Redis call.
//
// KEYS[1] = ranking key
// KEYS[2] .. KEYS[1+N] = session keys (one per event)
// ARGV[1] = maxHeartbeatGap
// ARGV[2] = rankThreshold
// ARGV[3] = TTL (seconds)
// ARGV[4], ARGV[5] = video_id_1, playhead_1
// ARGV[6], ARGV[7] = video_id_2, playhead_2
// ...
// Returns total ranking points awarded (sum of >=0 per event).
var rankBatchScript = redis.NewScript(`
local ranking_key = KEYS[1]
local total_ranked = 0
local n = #KEYS - 1
local now_parts = redis.call('TIME')
local now_ms = now_parts[1] * 1000 + math.floor(now_parts[2] / 1000)
local window_ms = ` + fmt.Sprint(velocityWindowSec*1000) + `

-- Debug copies for the last processed event
local debug_delta = 0
local debug_accum = 0
local debug_cur = 0
local debug_last = 0

for i = 1, n do
    local session_key = KEYS[1 + i]
    local video_id   = ARGV[3 + (i-1)*2 + 1]
    local cur       = tonumber(ARGV[3 + (i-1)*2 + 2])
    local gap       = tonumber(ARGV[1])
    local thresh    = tonumber(ARGV[2])
    local ttl       = tonumber(ARGV[3])

    local last   = tonumber(redis.call('HGET', session_key, 'last_playhead')) or 0
    local accum  = tonumber(redis.call('HGET', session_key, 'accumulated'))   or 0
    local delta  = cur - last
    local ranked = 0

    debug_delta = delta
    debug_accum = accum
    debug_cur = cur
    debug_last = last

    if delta > 0 then
        if delta <= gap then
            accum = accum + delta
        elseif delta > gap then
            accum = 0
        end

        while accum >= thresh do
            redis.call('ZINCRBY', ranking_key, 1, video_id)
            accum = accum - thresh
            ranked = ranked + 1

            -- Trending velocity tracking (same semantics as single-event script)
            local velocity_key = 'ranking:velocity:' .. video_id
            local trending_key = 'ranking:trending'
            local seq = redis.call('INCR', velocity_key .. ':seq')
            local member = tostring(now_ms) .. '-' .. tostring(seq)

            redis.call('ZADD', velocity_key, now_ms, member)
            -- Trim the sliding window periodically to reduce write amplification.
            if (seq % 10) == 0 then
                redis.call('ZREMRANGEBYSCORE', velocity_key, 0, now_ms - window_ms)
            end
            local velocity = redis.call('ZCARD', velocity_key)
            redis.call('ZADD', trending_key, velocity, video_id)
            local window_sec = math.floor(window_ms / 1000)
            redis.call('EXPIRE', velocity_key, window_sec * 2)
            redis.call('EXPIRE', velocity_key .. ':seq', window_sec * 2)
        end

        redis.call('HSET', session_key, 'last_playhead', cur, 'accumulated', accum)
    end

    redis.call('EXPIRE', session_key, ttl)
    total_ranked = total_ranked + ranked
end

return {total_ranked, debug_delta, debug_accum, debug_cur, debug_last}
`)

// ProcessBatch runs the batch Lua script for multiple events in one Redis call.
func (p *Processor) ProcessBatch(ctx context.Context, msgs []kafka.Message) (ranked int, err error) {
	if len(msgs) == 0 {
		return 0, nil
	}

	start := time.Now()

	keys := make([]string, 0, 1+len(msgs))
	keys = append(keys, rankingKey)

	args := []interface{}{maxHeartbeatGap, rankThreshold, int(sessionTTL.Seconds())}

	var firstEvent *models.HeartbeatEvent
	for _, msg := range msgs {
		var event models.HeartbeatEvent
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			metrics.WorkerEventsProcessedTotal.WithLabelValues("error").Inc()
			return 0, fmt.Errorf("unmarshal: %w", err)
		}
		if firstEvent == nil {
			firstEvent = &event
		}

		sessionKey := fmt.Sprintf("session:%s:%s", event.SessionID, event.VideoID)
		keys = append(keys, sessionKey)
		args = append(args, event.VideoID, event.Playhead)
	}

	raw, err := rankBatchScript.Run(ctx, p.rdb, keys, args...).Result()
	if err != nil {
		for range msgs {
			metrics.WorkerEventsProcessedTotal.WithLabelValues("error").Inc()
		}
		return 0, fmt.Errorf("lua rankBatchScript: %w", err)
	}

	results, ok := raw.([]interface{})
	if !ok || len(results) < 5 {
		for range msgs {
			metrics.WorkerEventsProcessedTotal.WithLabelValues("error").Inc()
		}
		return 0, fmt.Errorf("lua rankBatchScript: unexpected return type %T", raw)
	}

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

	if os.Getenv("DEBUG") != "" {
		if firstEvent != nil {
			log.Printf("[worker:batch] first event session=%s video=%s playhead=%d",
				firstEvent.SessionID, firstEvent.VideoID, firstEvent.Playhead)
		}
		log.Printf("[worker:batch] batch_size=%d ranked=%d (last event: playhead=%d last_playhead=%d delta=%d accumulated=%d)",
			len(msgs), increments, debugCur, debugLast, debugDelta, debugAccum)
	}

	for range msgs {
		metrics.WorkerEventsProcessedTotal.WithLabelValues("success").Inc()
	}
	// Record batch-level metrics separately from per-event metrics to avoid
	// confusing per-event latency dashboards with whole-batch timings.
	duration := time.Since(start).Seconds()
	metrics.WorkerBatchDuration.Observe(duration)
	metrics.WorkerBatchSize.Observe(float64(len(msgs)))

	if increments > 0 {
		metrics.WorkerRankingUpdatesTotal.Add(float64(increments))
		metrics.WorkerRankingVelocityUpdatesTotal.Add(float64(increments))
	}

	return int(increments), nil
}
