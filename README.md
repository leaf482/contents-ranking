# Contents Ranking

Real-time video ranking system based on watch heartbeats. Built with Go, Kafka, Redis, NestJS simulation, and Next.js dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CONTENTS RANKING SYSTEM                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     POST /v1/heartbeat      ┌──────────────┐
  │   Clients    │ ─────────────────────────► │   Go API     │
  │  (or Sim)    │                             │   :8080      │
  └──────────────┘                             └──────┬───────┘
        │                                             │ produce
        │                                             ▼
        │ POST /v1/factory/scenarios           ┌──────────────┐
        └─────────────────────────────────────►│    Kafka     │
                                               │  :9092       │
  ┌──────────────┐                             │ video-heart- │
  │  Simulation  │                             │   beats      │
  │   Service    │                             │ (6 partitions)│
  │   :3000      │                             └──────┬───────┘
  └──────────────┘                                    │ consume
        │                                             │
        │                                             ▼
        │                                      ┌──────────────┐
        │                                      │ Go Workers   │
        │                                      │ (×3 scaled)  │
        │                                      │ :8081/metrics│
        │                                      └──────┬───────┘
        │                                             │ Lua batch
        │                                             ▼
        │                                      ┌──────────────┐
        │                                      │    Redis     │
        │ GET /v1/ranking                      │   :6379      │
        └─────────────────────────────────────┤ ranking:     │
                                               │ global       │
                                               └──────────────┘

  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  OBSERVABILITY                                                                │
  │  Prometheus :9090  │  Grafana :3001  │  kafka-exporter :9308  │  redis-exporter :9121  │
  └──────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

| Stage | Component | Role |
|-------|-----------|------|
| Ingest | Go API | Receives heartbeats, produces to Kafka |
| Buffer | Kafka | Durable event log, 6 partitions |
| Process | Go Workers | Consume in batches, run Lua scripts |
| Store | Redis | Session state + sorted-set ranking |
| Query | Go API | Serves `GET /v1/ranking` from Redis |
| Simulate | NestJS | Scenario factory (create, pause, resume, spike, stop) |
| Monitor | Prometheus + Grafana | Metrics and dashboards |

### Core Business Logic

- Each heartbeat carries `session_id`, `user_id`, `video_id`, `playhead` (ms)
- Continuous watch time is accumulated per session; gaps > 35s (seek/pause) reset accumulation
- When accumulated watch time reaches 30s, one ranking point is awarded via Redis `ZINCRBY`
- Rankings are stored in Redis sorted set (`ranking:global`)

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

- Docker & Docker Compose
- Go 1.23+
- Node.js 18+

### Start All Services

```bash
make up      # Docker + go-api + simulation + dashboard
make down    # Stop containers
make restart # Restart
```

Dashboard: **http://localhost:3002**

### Manual Start (Alternative)

```bash
# 1. Infrastructure
docker compose up -d kafka redis kafka-exporter redis-exporter prometheus grafana

# 2. Application
go run cmd/api/main.go                    # Terminal 1
go run cmd/worker/main.go                 # Terminal 2 (or use Docker workers)
cd simulation-service && npm run start:dev # Terminal 3
cd dashboard && npm run dev                # Terminal 4
```

### Environment

Copy `.env.example` to `.env`:

```env
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=video-heartbeats
SERVER_PORT=8080
REDIS_ADDR=localhost:6379
BATCH_SIZE=50
BATCH_FLUSH_INTERVAL=100ms
```

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
├── Dockerfile.worker
└── Makefile
```
