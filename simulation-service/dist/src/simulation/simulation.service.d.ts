import { OnModuleInit } from '@nestjs/common';
import { SimulationScenario, SimulationStatus } from './interfaces/scenario.interface';
import { MasterTickScheduler } from './engine/master-tick-scheduler';
import { RunManager } from './engine/run-manager';
export declare class SimulationService implements OnModuleInit {
    private readonly scheduler;
    private readonly runManager;
    private readonly logger;
    private loadTestPhaseIndex;
    constructor(scheduler: MasterTickScheduler, runManager: RunManager);
    onModuleInit(): void;
    start(scenario: SimulationScenario): SimulationStatus;
    startByScenarioId(scenarioId: string): SimulationStatus;
    private runLoadTest;
    private scheduleNextPhase;
    stop(): SimulationStatus;
    getStatus(): SimulationStatus & {
        run_id?: string;
        paused?: boolean;
    };
    pause(): void;
    resume(): void;
    injectSpike(users?: number, durationSec?: number): void;
}
