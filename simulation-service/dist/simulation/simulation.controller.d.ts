import { SimulationService } from './simulation.service';
import { SimulationScenario, SimulationStatus } from './interfaces/scenario.interface';
export declare class SimulationController {
    private readonly simulationService;
    constructor(simulationService: SimulationService);
    start(scenario: SimulationScenario): SimulationStatus;
    stop(): SimulationStatus;
    status(): SimulationStatus;
}
