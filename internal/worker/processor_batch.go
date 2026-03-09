package worker

import (
	"context"
	"encoding/json"
	"fmt"
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
// Returns total ranking points awarded (sum of 0|1 per event).
var rankBatchScript = redis.NewScript(`
local ranking_key = KEYS[1]
local total_ranked = 0
local n = #KEYS - 1

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

    if delta > 0 and delta <= gap then
        accum = accum + delta
    elseif delta > gap then
        accum = 0
    end

    if accum >= thresh then
        redis.call('ZINCRBY', ranking_key, 1, video_id)
        accum = accum - thresh
        ranked = 1
    end

    redis.call('HSET', session_key, 'last_playhead', cur, 'accumulated', accum)
    redis.call('EXPIRE', session_key, ttl)
    total_ranked = total_ranked + ranked
end

return total_ranked
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

	for _, msg := range msgs {
		var event models.HeartbeatEvent
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			metrics.WorkerEventsProcessedTotal.WithLabelValues("error").Inc()
			return 0, fmt.Errorf("unmarshal: %w", err)
		}

		sessionKey := fmt.Sprintf("session:%s:%s", event.SessionID, event.VideoID)
		keys = append(keys, sessionKey)
		args = append(args, event.VideoID, event.Playhead)
	}

	result, err := rankBatchScript.Run(ctx, p.rdb, keys, args...).Int()
	if err != nil {
		for range msgs {
			metrics.WorkerEventsProcessedTotal.WithLabelValues("error").Inc()
		}
		return 0, fmt.Errorf("lua rankBatchScript: %w", err)
	}

	for range msgs {
		metrics.WorkerEventsProcessedTotal.WithLabelValues("success").Inc()
	}
	metrics.WorkerProcessingDuration.Observe(time.Since(start).Seconds())

	for i := 0; i < result; i++ {
		metrics.WorkerRankingUpdatesTotal.Inc()
	}

	return result, nil
}
