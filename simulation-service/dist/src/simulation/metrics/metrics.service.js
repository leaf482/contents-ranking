"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MetricsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsService = void 0;
const common_1 = require("@nestjs/common");
const PROM_URL = process.env.PROMETHEUS_URL ?? 'http://localhost:9090';
const CACHE_TTL_MS = 2000;
let MetricsService = MetricsService_1 = class MetricsService {
    logger = new common_1.Logger(MetricsService_1.name);
    cache = null;
    cacheExpiry = 0;
    async getSummary() {
        const now = Date.now();
        if (this.cache && now < this.cacheExpiry) {
            return this.cache;
        }
        try {
            const [rps, workerThroughput, consumerLag] = await Promise.all([
                this.queryPrometheus('sum(rate(api_requests_total{path="/v1/heartbeat"}[1m]))'),
                this.queryPrometheus('sum(rate(worker_events_processed_total[1m]))'),
                this.queryPrometheus('sum(kafka_consumergroup_lag_sum)').catch(() => this.queryPrometheus('sum(kafka_consumergroup_lag)')),
            ]);
            const summary = {
                rps: Math.round(rps * 100) / 100,
                workerThroughput: Math.round(workerThroughput * 100) / 100,
                consumerLag: Math.round(consumerLag),
                fetchedAt: now,
            };
            this.cache = summary;
            this.cacheExpiry = now + CACHE_TTL_MS;
            return summary;
        }
        catch (err) {
            this.logger.warn(`Prometheus query failed: ${err instanceof Error ? err.message : String(err)}`);
            return {
                rps: 0,
                workerThroughput: 0,
                consumerLag: 0,
                fetchedAt: now,
            };
        }
    }
    async queryPrometheus(expr) {
        const url = `${PROM_URL}/api/v1/query?query=${encodeURIComponent(expr)}`;
        const res = await fetch(url);
        const json = (await res.json());
        const val = json?.data?.result?.[0]?.value?.[1];
        return val ? parseFloat(val) : 0;
    }
};
exports.MetricsService = MetricsService;
exports.MetricsService = MetricsService = MetricsService_1 = __decorate([
    (0, common_1.Injectable)()
], MetricsService);
//# sourceMappingURL=metrics.service.js.map