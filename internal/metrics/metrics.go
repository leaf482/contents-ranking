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

	// API Kafka producer batching metrics
	APIKafkaBatchSize = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "api_kafka_batch_size",
			Help:    "Number of messages flushed in a single Kafka batch from the API.",
			Buckets: prometheus.ExponentialBuckets(1, 2, 10), // 1,2,4,...,512
		},
	)

	APIKafkaBatchFlushTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "api_kafka_batch_flush_total",
			Help: "Total number of Kafka batch flushes performed by the API.",
		},
	)

	APIKafkaQueueDroppedTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "api_kafka_queue_dropped_total",
			Help: "Total number of heartbeat events dropped because the API Kafka queue was full.",
		},
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

	WorkerRankingVelocityUpdatesTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "ranking_velocity_updates_total",
			Help: "Total number of trending velocity updates (per ranking point).",
		},
	)
)
