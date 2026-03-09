package repository

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"contents-ranking/internal/models"
)

const globalRankingKey = "ranking:global"

type RankingRepo struct {
	rdb *redis.Client
}

func NewRankingRepo(rdb *redis.Client) *RankingRepo {
	return &RankingRepo{rdb: rdb}
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
