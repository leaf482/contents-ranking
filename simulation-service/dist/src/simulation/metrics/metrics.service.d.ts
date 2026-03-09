import { EventLogService } from '../events/event-log.service';
export interface MetricsSummary {
    rps: number;
    workerThroughput: number;
    consumerLag: number;
    fetchedAt: number;
    events: Array<{
        type: string;
        scenarioId?: string;
        timestamp: number;
    }>;
}
export declare class MetricsService {
    private readonly eventLog;
    private readonly logger;
    private cache;
    private cacheExpiry;
    constructor(eventLog: EventLogService);
    getSummary(): Promise<MetricsSummary>;
    private queryPrometheus;
}
