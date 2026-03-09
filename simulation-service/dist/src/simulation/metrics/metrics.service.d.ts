export interface MetricsSummary {
    rps: number;
    workerThroughput: number;
    consumerLag: number;
    fetchedAt: number;
}
export declare class MetricsService {
    private readonly logger;
    private cache;
    private cacheExpiry;
    getSummary(): Promise<MetricsSummary>;
    private queryPrometheus;
}
