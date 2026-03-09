import { SimulationService } from './simulation.service';
import { SimulationScenario, SimulationStatus } from './interfaces/scenario.interface';
export declare class SimulationController {
    private readonly simulationService;
    constructor(simulationService: SimulationService);
    start(scenario: SimulationScenario): SimulationStatus;
    startByScenario(scenarioId: string): SimulationStatus;
    stop(): SimulationStatus;
    pause(): {
        paused: boolean;
    };
    resume(): {
        paused: boolean;
    };
    spike(): {
        message: string;
    };
    status(): SimulationStatus & {
        run_id?: string;
    };
    scenarios(): import("./engine/scenario-registry").RegisteredScenario[];
}
