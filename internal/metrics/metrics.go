package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// API metrics
	APIRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "api_requests_total",
			Help: "Total number of HTTP requests handled by the API server.",
		},
		[]string{"method", "path", "status"},
	)

	APIRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "api_request_duration_seconds",
			Help:    "HTTP request latency in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)

	// Worker metrics
	WorkerEventsProcessedTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "worker_events_processed_total",
			Help: "Total number of Kafka messages processed by the worker.",
		},
		[]string{"status"}, // "success" | "error"
	)

	WorkerProcessingDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "worker_processing_duration_seconds",
			Help:    "Time spent processing a single Kafka message (Redis Lua included).",
			Buckets: prometheus.DefBuckets,
		},
	)

	WorkerRankingUpdatesTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "worker_ranking_updates_total",
			Help: "Total number of ranking points awarded (ZINCRBY fired).",
		},
	)
)
