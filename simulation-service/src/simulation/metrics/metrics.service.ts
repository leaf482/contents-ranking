/**
 * BFF Metrics Service: Queries Prometheus for summarized metrics.
 * 2-second cache for frontend optimization.
 */

import { Injectable, Logger } from '@nestjs/common';

const PROM_URL = process.env.PROMETHEUS_URL ?? 'http://localhost:9090';
const CACHE_TTL_MS = 2000;

export interface MetricsSummary {
  rps: number;
  workerThroughput: number;
  consumerLag: number;
  /** Unix timestamp when data was fetched */
  fetchedAt: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private cache: MetricsSummary | null = null;
  private cacheExpiry = 0;

  async getSummary(): Promise<MetricsSummary> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) {
      return this.cache;
    }

    try {
      const [rps, workerThroughput, consumerLag] = await Promise.all([
        this.queryPrometheus('sum(rate(api_requests_total{path="/v1/heartbeat"}[1m]))'),
        this.queryPrometheus('sum(rate(worker_events_processed_total[1m]))'),
        this.queryPrometheus('sum(kafka_consumergroup_lag_sum)').catch(() =>
          this.queryPrometheus('sum(kafka_consumergroup_lag)'),
        ),
      ]);

      const summary: MetricsSummary = {
        rps: Math.round(rps * 100) / 100,
        workerThroughput: Math.round(workerThroughput * 100) / 100,
        consumerLag: Math.round(consumerLag),
        fetchedAt: now,
      };

      this.cache = summary;
      this.cacheExpiry = now + CACHE_TTL_MS;
      return summary;
    } catch (err) {
      this.logger.warn(`Prometheus query failed: ${err instanceof Error ? err.message : String(err)}`);
      return {
        rps: 0,
        workerThroughput: 0,
        consumerLag: 0,
        fetchedAt: now,
      };
    }
  }

  private async queryPrometheus(expr: string): Promise<number> {
    const url = `${PROM_URL}/api/v1/query?query=${encodeURIComponent(expr)}`;
    const res = await fetch(url);
    const json = (await res.json()) as {
      data?: { result?: { value?: [number, string] }[] };
    };
    const val = json?.data?.result?.[0]?.value?.[1];
    return val ? parseFloat(val) : 0;
  }
}
