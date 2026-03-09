# Contents Ranking — Real-time Video Ranking System

A high-throughput, real-time content ranking engine that processes video watch heartbeats and maintains a live leaderboard. Built with Go, Kafka, Redis, and NestJS for simulation and observability.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Performance Optimizations](#performance-optimizations)
- [Load Test Results](#load-test-results)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)

---

## Project Overview

**Contents Ranking** is a real-time ranking system that:

1. **Ingests** video watch heartbeats via a REST API
2. **Streams** events to Apache Kafka for durable, scalable processing
3. **Processes** heartbeats with Redis Lua scripts to compute ranking scores
4. **Exposes** a live leaderboard via `GET /v1/ranking`
5. **Simulates** load via a NestJS-based simulation service
6. **Monitors** throughput, latency, and Kafka lag via Prometheus and Grafana

### Core Business Logic

- Each heartbeat carries `session_id`, `user_id`, `video_id`, and `playhead` (ms)
- Continuous watch time is accumulated per session; gaps > 35s (seek/pause) reset accumulation
- When accumulated watch time reaches 30s, one ranking point is awarded via Redis `ZINCRBY`
- Rankings are stored in a Redis sorted set (`ranking:global`)

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
        │ POST /v1/simulation/start            ┌──────────────┐
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
| Simulate | NestJS | Generates configurable load |
| Monitor | Prometheus + Grafana | Metrics and dashboards |

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| **API & Workers** | Go 1.23, net/http, segmentio/kafka-go, go-redis |
| **Simulation** | NestJS 11, TypeScript, Axios |
| **Message Queue** | Apache Kafka (KRaft mode) |
| **Storage** | Redis 7 (sorted sets, hashes, Lua) |
| **Observability** | Prometheus, Grafana, kafka-exporter, redis-exporter |
| **Orchestration** | Docker Compose |

### Key Libraries

- `github.com/segmentio/kafka-go` — Kafka consumer/producer
- `github.com/redis/go-redis/v9` — Redis client with Lua support
- `github.com/prometheus/client_golang` — Metrics
- `@willsoto/nestjs-prometheus` — NestJS metrics endpoint

---

## Performance Optimizations

### 1. Kafka Partition Scaling

- **Before**: 1 partition → single consumer bottleneck
- **After**: 6 partitions → up to 6 parallel consumers
- **Effect**: Linear throughput scaling with partition count

### 2. Worker Horizontal Scaling

- **Config**: `docker compose up -d --scale go-worker=3`
- **Mechanism**: Consumer group rebalancing; each worker owns 2 partitions
- **Effect**: ~3× throughput vs single worker

### 3. Buffer-Based Batch Processing

- **Config**: `BATCH_SIZE=50`, `BATCH_FLUSH_INTERVAL=100ms`
- **Mechanism**: Channel + ticker; flush when N messages or T elapsed
- **Effect**: Reduces Redis round-trips from N to 1 per batch

### 4. Redis Lua Batch Script

- **Before**: One Lua call per heartbeat (N round-trips)
- **After**: One Lua call per batch of N heartbeats
- **Script**: Loops over `KEYS[2..N+1]` (sessions) and `ARGV` (video_id, playhead pairs)
- **Effect**: Single network round-trip per batch; atomic per-batch execution

### 5. Graceful Shutdown

- On SIGTERM/SIGINT: stop fetch → drain channel → flush remaining buffer → exit
- Prevents message loss during deployment

---

## Load Test Results

### Test Scenario (Step-up Load)

| Phase | Users | Duration | Events/sec (est.) |
|-------|-------|----------|-------------------|
| 1 | 100 | 2 min | ~100 |
| 2 | 300 | 2 min | ~300 |
| 3 | 500 | 2 min | ~500 |
| 4 | 1,000 | 10 min | ~1,000 |

### Configuration at Test Time

- **Kafka**: 6 partitions
- **Workers**: 3 instances (Docker scaled)
- **Batch**: 50 events, 100ms flush interval
- **Redis**: Single instance

### Observed Capacity

| Metric | Value |
|--------|-------|
| **Sustained throughput** | 1,000+ users without Kafka lag buildup |
| **API RPS** | Matches simulation send rate |
| **Worker throughput** | ~3× single-worker baseline |
| **Redis command rate** | Reduced via batching (1 call per 50 events) |

### Run Load Test

```bash
cd simulation-service
npm run load-test
# or: npx ts-node scripts/step-up-load.ts
```

Monitor via Grafana: `http://localhost:3001` (admin/admin) → **Contents Ranking - Load Test**

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Go 1.23+ (for local API/Worker)
- Node.js 18+ (for Simulation Service)

### 1. Start Infrastructure

```bash
docker compose up -d kafka redis kafka-exporter redis-exporter prometheus grafana
```

### 2. Start Application (Host)

```bash
# Terminal 1: API
go run cmd/api/main.go

# Terminal 2: Worker (or use Docker)
go run cmd/worker/main.go

# Terminal 3: Simulation Service
cd simulation-service && npm run start:dev
```

### 3. Or Run Workers in Docker

```bash
docker compose up -d --scale go-worker=3
```

### 4. Environment Variables

Copy `.env.example` to `.env` and configure:

```env
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=video-heartbeats
SERVER_PORT=8080
REDIS_ADDR=localhost:6379
BATCH_SIZE=50
BATCH_FLUSH_INTERVAL=100ms
```

### 5. Endpoints

| Service | URL | Description |
|---------|-----|-------------|
| API | http://localhost:8080 | Heartbeat + Ranking |
| API Metrics | http://localhost:8080/metrics | Prometheus |
| Ranking | http://localhost:8080/v1/ranking | Leaderboard |
| Simulation | http://localhost:3000/v1/simulation/start | Load test |
| Grafana | http://localhost:3001 | Dashboards |
| Prometheus | http://localhost:9090 | Metrics |

---

## Project Structure

```
contents-ranking/
├── cmd/
│   ├── api/           # Go API server (heartbeat, ranking)
│   └── worker/        # Go Kafka consumer + batch processor
├── internal/
│   ├── config/        # Env-based configuration
│   ├── handler/       # HTTP handlers
│   ├── kafka/         # Producer, topic setup
│   ├── metrics/       # Prometheus metrics
│   ├── models/        # HeartbeatEvent
│   ├── redis/         # Redis client
│   ├── repository/    # Ranking repository
│   └── worker/        # Consumer, processor, batch Lua
├── monitoring/
│   └── prometheus.yml
├── simulation-service/
│   ├── src/
│   │   ├── simulation/  # Scenario, strategy, load
│   │   └── app.module.ts
│   ├── grafana/
│   │   ├── dashboards/  # Provisioned dashboards
│   │   └── provisioning/
│   └── scripts/
│       ├── step-up-load.ts   # Load test
│       └── monitor-lag-threshold.ts
├── docker-compose.yml
├── Dockerfile.worker
└── .env.example
```

---

## License

UNLICENSED
