# Contents Ranking

Real-time video ranking system based on watch heartbeats. Built with Go, Kafka, Redis, NestJS simulation, and Next.js dashboard.

---

## Architecture Overview

The pipeline is: **API → Kafka → Worker → Redis → Ranking API → Dashboard**.

1. **API** — Clients (or the simulation service) send heartbeats to the Go API (`POST /v1/heartbeat`). The API validates the payload and publishes events to Kafka.
2. **Kafka** — Durable event log; decouples ingest from processing and allows multiple workers to consume in parallel.
3. **Worker** — Go consumers read batches from Kafka, run Redis Lua scripts to update session state and rankings.
4. **Redis** — Stores session hashes (playhead, accumulated watch time) and sorted sets (global ranking, per-video velocity, trending).
5. **Ranking API** — The same Go API serves `GET /v1/ranking` by reading from Redis.
6. **Dashboard** — Next.js app and simulation service drive scenarios and display rankings.

---

## System Architecture (ASCII)

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                    CONTENTS RANKING PIPELINE                  │
                    └─────────────────────────────────────────────────────────────┘

  Clients / Sim          API                Kafka              Worker              Redis
  ┌──────────┐    POST /v1/heartbeat   ┌─────────┐      consume batch      ┌─────────────┐
  │ Dashboard │ ───────────────────►  │   Go    │ ──►  topic               │   Go        │
  │ or Sim   │                        │   API   │      video-heartbeats    │   Workers   │
  └──────────┘                        │  :8080  │  ◄── (batch size /       │  (scalable) │
        │                             └────┬────┘      flush interval)     └──────┬──────┘
        │                                  │ produce                               │
        │                                  ▼                                        │ Lua
        │                             ┌─────────┐                                   │ batch
        │                             │  Kafka  │                                   ▼
        │  GET /v1/ranking            │  :9092  │                            ┌─────────────┐
        └────────────────────────────│ 6 part.│                            │   Redis     │
                                     └─────────┘                            │   :6379     │
                                                                            │ ranking:    │
                                                                            │ global,     │
                                                                            │ velocity,   │
                                                                            │ trending    │
                                                                            └─────────────┘

  Observability:  Prometheus :9090  │  Grafana :3001  │  kafka-exporter :9308  │  redis-exporter :9121
```

### Data Flow

| Stage | Component | Role |
|-------|-----------|------|
| Ingest | Go API | Validates heartbeats, produces to Kafka (key: `session_id:video_id`) |
| Buffer | Kafka | Durable event log, 6 partitions; hash key spreads load, preserves per-session ordering |
| Process | Go Workers | Consume in batches, run Lua scripts (session + ranking + velocity) |
| Store | Redis | Session hashes, `ranking:global`, per-video velocity keys, `ranking:trending` |
| Query | Go API | Serves `GET /v1/ranking` from Redis |
| Simulate | NestJS | Scenario factory (create, pause, resume, spike, stop) |
| Monitor | Prometheus + Grafana | Metrics and dashboards |

### Core Business Logic

- Each heartbeat carries `session_id`, `user_id`, `video_id`, `playhead` (ms), optional `timestamp`.
- Continuous watch time is accumulated per session; gaps > 35s (seek/pause) reset accumulation.
- When accumulated watch time reaches 30s, one ranking point is awarded via Redis `ZINCRBY` on `ranking:global`.
- **Trending velocity**: Per-video sorted set (`ranking:velocity:<video_id>`) counts ranking points in a 60s sliding window; `ranking:trending` is a sorted set of video_id by velocity for “what’s hot now.”

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Kafka** | Decouples API from workers; durable replay; multiple partitions allow horizontal scaling of consumers. If workers are slow or down, events are buffered instead of dropped. |
| **Redis Lua scripts** | Session state and ranking updates (accumulated watch time, ZINCRBY, velocity ZADD/ZREMRANGEBYSCORE) must be atomic per session. Lua runs inside Redis so one script sees a consistent view and avoids race conditions when multiple workers handle the same session. |
| **Batch processing** | Workers consume up to N messages or flush on an interval, then run one Lua script per batch. Fewer Redis round-trips and better throughput; offsets are committed only after the batch succeeds so at-least-once semantics are preserved. |
| **Trending velocity** | A 60s sliding window of "ranking points per video" is implemented with a sorted set keyed by timestamp: add event with score=now_ms, remove entries with score < now_ms − 60s, then ZCARD = velocity. A separate sorted set `ranking:trending` stores (velocity, video_id) so "hot" videos can be queried by score. Unique members per event (e.g. timestamp + sequence) avoid undercounting when many events share the same millisecond. |

---

## Reliability Improvements

| Area | Implementation |
|------|----------------|
| **Worker failure handling** | If ProcessBatch or CommitMessages fails, the worker does not clear the in-memory batch or commit offsets. The worker exits so orchestration (e.g. Kubernetes) can restart it; the same batch is reprocessed. No silent message loss; no unbounded retry mixing new messages with the failed batch. |
| **Redis TTL cleanup** | Velocity keys (`ranking:velocity:<video_id>` and `ranking:velocity:<video_id>:seq`) get EXPIRE key window_sec*2 on every write. Inactive videos' keys expire and no longer leak memory. |
| **Kafka partition strategy** | Message key is session_id:video_id. Ordering is preserved per session per video; traffic for a viral video is spread across partitions (different sessions → different keys) so no single partition becomes a hotspot. |
| **Input validation** | Heartbeat handler validates required fields before producing to Kafka: session_id and video_id non-empty (after trim), playhead ≥ 0, timestamp non-negative if present. Invalid requests receive HTTP 400 with a clear message and are never published. |
| **Observability** | Separate metrics for batch vs event: worker_batch_duration_seconds, worker_batch_size, worker_events_processed_total, worker_processing_duration_seconds (per-event, non-batch path). This avoids misreading batch latency as per-event latency in dashboards. |

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| **API & Workers** | Go, net/http, segmentio/kafka-go, go-redis |
| **Simulation** | NestJS, TypeScript |
| **Dashboard** | Next.js, React |
| **Message Queue** | Apache Kafka (KRaft mode) |
| **Storage** | Redis (sorted sets, hashes, Lua) |
| **Observability** | Prometheus, Grafana, kafka-exporter, redis-exporter |

---

## Quick Start

### Prerequisites

- **Docker Desktop** (Docker Compose included)

### Run

```bash
git clone <repo-url>
cd contents-ranking
make up
```

Wait ~30 seconds for Kafka and Redis to be ready, then open **http://localhost:3002**

```bash
make down     # Stop
make restart # Restart
```

All services (API, workers, simulation, dashboard, Kafka, Redis, Prometheus, Grafana) run in Docker. No `.env` required for the default setup.

### Environment (Optional)

For host-mode development, copy `.env.example` to `.env`. See `.env.example` for all variables.

---

## Endpoints

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:3002 |
| Go API | http://localhost:8080 |
| Ranking | http://localhost:8080/v1/ranking |
| Simulation | http://localhost:3000/v1/factory/scenarios |
| Grafana | http://localhost:3001 |
| Prometheus | http://localhost:9090 |

---

## Performance

- **Kafka**: 6 partitions → parallel consumers
- **Workers**: `--scale go-worker=3` for ~3× throughput
- **Batch**: 50 events, 100ms flush → 1 Redis call per batch
- **Lua script**: Atomic batch processing in Redis

---

## Project Structure

```
contents-ranking/
├── cmd/
│   ├── api/           # Go API (heartbeat, ranking)
│   └── worker/        # Go Kafka consumer + batch processor
├── internal/
│   ├── config/        # Env-based configuration
│   ├── handler/       # HTTP handlers
│   ├── kafka/         # Producer, topic setup
│   ├── metrics/       # Prometheus metrics
│   ├── models/        # HeartbeatEvent
│   ├── redis/         # Redis client
│   ├── repository/    # Ranking repository (Redis seed)
│   └── worker/        # Consumer, processor, batch Lua
├── simulation-service/
│   ├── src/simulation/  # Factory, scenarios, events
│   ├── grafana/         # Dashboards
│   └── scripts/        # Load test
├── dashboard/
│   └── src/             # Next.js (ScenarioBuilder, RankingPanel, etc.)
├── monitoring/
│   └── prometheus.yml
├── docker-compose.yml
├── Dockerfile.api
├── Dockerfile.worker
├── Makefile
└── .env.example
```
