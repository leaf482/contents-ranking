import { SimulationScenario, SimulationType } from '../interfaces/scenario.interface';
export interface RegisteredScenario {
    id: string;
    name: string;
    type: SimulationType;
    users: number;
    duration_seconds: number;
    loadMultiplier: number;
    rampProfile?: {
        rampUpSeconds: number;
        holdSeconds?: number;
    };
}
export declare function getScenario(id: string): RegisteredScenario | undefined;
export declare function listScenarios(): RegisteredScenario[];
export declare function toSimulationScenario(registered: RegisteredScenario): SimulationScenario;
