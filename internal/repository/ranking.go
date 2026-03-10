package repository

import (
	"context"
	"fmt"
	"log"

	"github.com/redis/go-redis/v9"

	"contents-ranking/internal/models"
)

const (
	globalRankingKey   = "ranking:global"
	trendingRankingKey = "ranking:trending"
)

var defaultVideoIDs = []string{
	"video1", "video2", "video3", "video4", "video5",
	"video6", "video7", "video8", "video9", "video10",
}

type RankingRepo struct {
	rdb *redis.Client
}

func NewRankingRepo(rdb *redis.Client) *RankingRepo {
	return &RankingRepo{rdb: rdb}
}

// SeedRankingIfEmpty seeds ranking:global with video1~video10 at score 0 when empty.
func (r *RankingRepo) SeedRankingIfEmpty(ctx context.Context) error {
	n, err := r.rdb.ZCard(ctx, globalRankingKey).Result()
	if err != nil {
		return fmt.Errorf("repository: ZCARD %s: %w", globalRankingKey, err)
	}
	if n > 0 {
		return nil
	}
	args := make([]redis.Z, len(defaultVideoIDs))
	for i, id := range defaultVideoIDs {
		args[i] = redis.Z{Score: 0, Member: id}
	}
	if err := r.rdb.ZAdd(ctx, globalRankingKey, args...).Err(); err != nil {
		return fmt.Errorf("repository: ZADD seed %s: %w", globalRankingKey, err)
	}
	log.Printf("repository: seeded ranking:global with %d videos (score 0)", len(defaultVideoIDs))
	return nil
}

// GetTopRankings returns the top `limit` videos by score, highest first.
// Returns an empty slice (not nil) when no data exists.
func (r *RankingRepo) GetTopRankings(ctx context.Context, limit int64) ([]models.RankingItem, error) {
	results, err := r.rdb.ZRevRangeWithScores(ctx, globalRankingKey, 0, limit-1).Result()
	if err != nil {
		return nil, fmt.Errorf("repository: ZREVRANGE %s: %w", globalRankingKey, err)
	}

	items := make([]models.RankingItem, len(results))
	for i, z := range results {
		items[i] = models.RankingItem{
			VideoID: z.Member.(string),
			Score:   z.Score,
		}
	}
	return items, nil
}

// GetTopTrending returns the top `limit` videos by velocity score (last 60s),
// highest first. Returns an empty slice (not nil) when no data exists.
func (r *RankingRepo) GetTopTrending(ctx context.Context, limit int64) ([]models.RankingItem, error) {
	results, err := r.rdb.ZRevRangeWithScores(ctx, trendingRankingKey, 0, limit-1).Result()
	if err != nil {
		return nil, fmt.Errorf("repository: ZREVRANGE %s: %w", trendingRankingKey, err)
	}

	items := make([]models.RankingItem, len(results))
	for i, z := range results {
		items[i] = models.RankingItem{
			VideoID: z.Member.(string),
			Score:   z.Score,
		}
	}
	return items, nil
}
