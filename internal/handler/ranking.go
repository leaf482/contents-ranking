package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"contents-ranking/internal/models"
	"contents-ranking/internal/repository"
)

const (
	defaultLimit = 10
	maxLimit     = 100
	cacheTTL     = 2 * time.Second
)

type rankingCache struct {
	mu        sync.RWMutex
	data      []models.RankingItem
	expiresAt time.Time
}

func (c *rankingCache) get() ([]models.RankingItem, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if time.Now().Before(c.expiresAt) {
		return c.data, true
	}
	return nil, false
}

func (c *rankingCache) set(data []models.RankingItem) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.data = data
	c.expiresAt = time.Now().Add(cacheTTL)
}

type RankingHandler struct {
	repo          *repository.RankingRepo
	cache         rankingCache
	trendingCache rankingCache
}

func NewRankingHandler(repo *repository.RankingRepo) *RankingHandler {
	return &RankingHandler{repo: repo}
}

func (h *RankingHandler) HandleGetRanking(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit := int64(defaultLimit)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n <= 0 {
			http.Error(w, "invalid limit", http.StatusBadRequest)
			return
		}
		if n > maxLimit {
			n = maxLimit
		}
		limit = n
	}

	// Serve from cache when fresh. Cache stores up to maxLimit items,
	// so any valid limit can be satisfied without a Redis call.
	if full, ok := h.cache.get(); ok {
		h.writeJSON(w, slice(full, limit))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	items, err := h.repo.GetTopRankings(ctx, maxLimit)
	if err != nil {
		log.Printf("handler: GetTopRankings error: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	h.cache.set(items)
	h.writeJSON(w, slice(items, limit))
}

// HandleGetTrending returns the top videos by velocity score over the last
// sliding window (60s), highest first. Separate cache from main ranking.
func (h *RankingHandler) HandleGetTrending(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit := int64(defaultLimit)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n <= 0 {
			http.Error(w, "invalid limit", http.StatusBadRequest)
			return
		}
		if n > maxLimit {
			n = maxLimit
		}
		limit = n
	}

	if full, ok := h.trendingCache.get(); ok {
		h.writeJSON(w, slice(full, limit))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	items, err := h.repo.GetTopTrending(ctx, maxLimit)
	if err != nil {
		log.Printf("handler: GetTopTrending error: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	h.trendingCache.set(items)
	h.writeJSON(w, slice(items, limit))
}

func (h *RankingHandler) writeJSON(w http.ResponseWriter, items []models.RankingItem) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(items); err != nil {
		log.Printf("handler: ranking encode error: %v", err)
	}
}

// slice returns at most n items without allocating a new backing array.
func slice(items []models.RankingItem, n int64) []models.RankingItem {
	if int64(len(items)) <= n {
		return items
	}
	return items[:n]
}
