import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { SimulationScenario, SimulationStatus } from './interfaces/scenario.interface';
import { ScenarioStrategy, StrategyHandle } from './strategies/scenario.strategy';

// Default target — override via env or request body extension if needed
const DEFAULT_API_URL = process.env.RANKING_API_URL ?? 'http://localhost:8080/v1/heartbeat';

@Injectable()
export class SimulationService {
  private readonly logger = new Logger(SimulationService.name);

  private status: SimulationStatus = {
    running: false,
    scenario: null,
    sent: 0,
    errors: 0,
    started_at: null,
  };

  private handle: StrategyHandle | null = null;

  constructor(private readonly strategy: ScenarioStrategy) {}

  start(scenario: SimulationScenario): SimulationStatus {
    if (this.status.running) {
      throw new ConflictException('A simulation is already running');
    }

    this.status = {
      running: true,
      scenario,
      sent: 0,
      errors: 0,
      started_at: new Date(),
    };

    this.logger.log(
      `starting simulation type=${scenario.type} users=${scenario.users} eps=${scenario.events_per_second}`,
    );

    this.handle = this.strategy.run(DEFAULT_API_URL, scenario);

    this.handle.onTick((sent, errors) => {
      this.status.sent += sent;
      this.status.errors += errors;
    });

    return { ...this.status };
  }

  stop(): SimulationStatus {
    this.handle?.stop();
    this.handle = null;
    this.status.running = false;
    this.logger.log(`simulation stopped — total sent=${this.status.sent} errors=${this.status.errors}`);
    return { ...this.status };
  }

  getStatus(): SimulationStatus {
    return { ...this.status };
  }
}
