import { SimulationScenario, SimulationStatus } from './interfaces/scenario.interface';
import { ScenarioStrategy } from './strategies/scenario.strategy';
export declare class SimulationService {
    private readonly strategy;
    private readonly logger;
    private status;
    private handle;
    constructor(strategy: ScenarioStrategy);
    start(scenario: SimulationScenario): SimulationStatus;
    stop(): SimulationStatus;
    getStatus(): SimulationStatus;
}
