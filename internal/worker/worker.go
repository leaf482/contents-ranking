package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"

	"contents-ranking/internal/models"
)

const (
	maxHeartbeatGap = 35_000 // ms — gaps larger than this are treated as seeks/pauses
	rankThreshold   = 30_000 // ms — accumulated watch time needed for one ranking point
	sessionTTL      = 24 * time.Hour
	rankingKey      = "ranking:global"
)

// rankScript runs an atomic read-modify-write on the session hash.
//
// Logic:
//   - continuous forward progress (0 < delta <= maxHeartbeatGap): add to accumulated
//   - large jump (delta > maxHeartbeatGap): reset accumulated (seek or resume)
//   - backward / duplicate: update last_playhead only
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

type Worker struct {
	reader *kafka.Reader
	rdb    *redis.Client
}

func New(brokers []string, topic, groupID string, rdb *redis.Client) *Worker {
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        brokers,
		Topic:          topic,
		GroupID:        groupID,
		MinBytes:       1,
		MaxBytes:       10e6,
		CommitInterval: time.Second,
	})
	return &Worker{reader: r, rdb: rdb}
}

// Run consumes messages until ctx is cancelled.
// Offsets are committed only after successful processing.
func (w *Worker) Run(ctx context.Context) {
	log.Println("worker: starting consumer loop")
	for {
		msg, err := w.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				log.Println("worker: context cancelled, stopping")
				return
			}
			log.Printf("worker: fetch error: %v", err)
			continue
		}

		if err := w.processEvent(ctx, msg); err != nil {
			log.Printf("worker: process error (offset=%d): %v", msg.Offset, err)
			// skip commit so the message is re-delivered on restart
			continue
		}

		if err := w.reader.CommitMessages(ctx, msg); err != nil {
			log.Printf("worker: commit error (offset=%d): %v", msg.Offset, err)
		}
	}
}

func (w *Worker) Close() error {
	return w.reader.Close()
}

func (w *Worker) processEvent(ctx context.Context, msg kafka.Message) error {
	var event models.HeartbeatEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		return fmt.Errorf("unmarshal: %w", err)
	}

	log.Printf("worker: received event session=%s user=%s video=%s playhead=%dms",
		event.SessionID, event.UserID, event.VideoID, event.Playhead)

	sessionKey := fmt.Sprintf("session:%s:%s", event.SessionID, event.VideoID)

	result, err := rankScript.Run(ctx, w.rdb,
		[]string{sessionKey, rankingKey},
		event.VideoID,
		event.Playhead,
		maxHeartbeatGap,
		rankThreshold,
		int(sessionTTL.Seconds()),
	).Int()
	if err != nil {
		return fmt.Errorf("lua rankScript: %w", err)
	}

	if result == 1 {
		log.Printf("worker: ranking point awarded video=%s user=%s session=%s",
			event.VideoID, event.UserID, event.SessionID)
	}

	return nil
}
