package worker

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	defaultTrendingRecomputeIntervalSeconds = 10
	trendingTmpKey                          = "ranking:trending_tmp"
	velocityCountKeyPrefix                  = "ranking:velocity_count:"
)

// StartTrendingRecompute runs a background task that periodically recomputes the trending
// sorted set from velocity counters.
//
// Algorithm:
// 1. Every N seconds:
// 2. Create a temporary ZSET: ranking:trending_tmp
// 3. SCAN ranking:velocity_count:* and build the trending ZSET
// 4. RENAME ranking:trending_tmp -> ranking:trending (atomic swap)
//
// This decouples trending computation from the heartbeat hot path and reduces Redis contention.
//
// Env:
// - TRENDING_RECOMPUTE_INTERVAL_SECONDS (default 10)
func StartTrendingRecompute(ctx context.Context, rdb *redis.Client) {
	intervalSec := defaultTrendingRecomputeIntervalSeconds
	if raw := os.Getenv("TRENDING_RECOMPUTE_INTERVAL_SECONDS"); raw != "" {
		if v, err := strconv.Atoi(raw); v > 0 && err == nil {
			intervalSec = v
		}
	}

	ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
	log.Printf("worker: trending recompute enabled interval=%ds", intervalSec)

	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				log.Println("worker: trending recompute loop stopped")
				return
			case <-ticker.C:
				if err := recomputeTrending(ctx, rdb); err != nil {
					if ctx.Err() != nil {
						return
					}
					log.Printf("worker: trending recompute error: %v", err)
				}
			}
		}
	}()
}

// recomputeTrending rebuilds the trending ZSET from velocity counters.
func recomputeTrending(ctx context.Context, rdb *redis.Client) error {
	start := time.Now()

	// Delete any stale tmp key from previous failed runs
	if err := rdb.Del(ctx, trendingTmpKey).Err(); err != nil {
		return err
	}

	// Scan all velocity_count keys
	var cursor uint64
	keysProcessed := 0
	entriesAdded := 0

	for {
		// SCAN ranking:velocity_count:*
		keys, newCursor, err := rdb.Scan(ctx, cursor, velocityCountKeyPrefix+"*", 100).Result()
		if err != nil {
			return err
		}

		// Process batch of keys
		for _, key := range keys {
			keysProcessed++

			// Extract video_id from "ranking:velocity_count:<video_id>"
			videoID := key[len(velocityCountKeyPrefix):]

			// GET velocity_count:<video_id>
			velocity, err := rdb.Get(ctx, key).Float64()
			if err != nil && err != redis.Nil {
				return err
			}

			// Only add to trending if velocity > 0
			if velocity > 0 {
				// ZADD ranking:trending_tmp velocity video_id
				if err := rdb.ZAdd(ctx, trendingTmpKey, redis.Z{
					Score:  velocity,
					Member: videoID,
				}).Err(); err != nil {
					return err
				}
				entriesAdded++
			}
		}

		cursor = newCursor
		if cursor == 0 {
			break
		}
	}

	// Atomic swap: RENAME ranking:trending_tmp ranking:trending
	if err := rdb.Rename(ctx, trendingTmpKey, trendingKey).Err(); err != nil {
		// If the rename fails, clean up the tmp key
		_ = rdb.Del(ctx, trendingTmpKey).Err()
		return err
	}

	duration := time.Since(start)
	if os.Getenv("DEBUG") != "" {
		log.Printf("worker: trending recomputed keys_processed=%d entries_added=%d duration=%v",
			keysProcessed, entriesAdded, duration)
	}

	return nil
}
