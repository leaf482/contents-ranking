import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SimulationScenario, SimulationStatus } from './interfaces/scenario.interface';
import {
  getScenario,
  toSimulationScenario,
} from './engine/scenario-registry';
import {
  LOAD_TEST_PHASES,
  phaseToScenario,
  getPhaseDurationMs,
  COOLDOWN_MS,
} from './engine/load-test-phases';
import { MasterTickScheduler } from './engine/master-tick-scheduler';
import { RunManager } from './engine/run-manager';

@Injectable()
export class SimulationService implements OnModuleInit {
  private readonly logger = new Logger(SimulationService.name);
  private loadTestPhaseIndex = 0;

  constructor(
    private readonly scheduler: MasterTickScheduler,
    private readonly runManager: RunManager,
  ) {}

  onModuleInit(): void {
    this.scheduler.start();
  }

  /** Start simulation with full scenario (legacy / script compatibility) */
  start(scenario: SimulationScenario): SimulationStatus {
    if (this.runManager.getState().running) {
      throw new ConflictException('A simulation is already running');
    }

    this.scheduler.beginRun(scenario);
    const state = this.runManager.getState();

    this.logger.log(
      `run_id=${state.run_id} starting type=${scenario.type} users=${scenario.users} eps=${scenario.events_per_second}`,
    );

    return {
      running: state.running,
      scenario: state.scenario,
      sent: state.sent,
      errors: state.errors,
      started_at: state.started_at,
    };
  }

  /** Start simulation by registered scenario id */
  startByScenarioId(scenarioId: string): SimulationStatus {
    if (scenarioId === 'load_test') {
      return this.runLoadTest();
    }
    const registered = getScenario(scenarioId);
    if (!registered) {
      throw new ConflictException(`Unknown scenario: ${scenarioId}`);
    }
    const scenario = toSimulationScenario(registered);
    return this.start(scenario);
  }

  /** Run Load Test preset: 4-phase step-up sequence */
  private runLoadTest(): SimulationStatus {
    if (this.runManager.getState().running) {
      throw new ConflictException('A simulation is already running');
    }
    this.loadTestPhaseIndex = 0;
    const phase = LOAD_TEST_PHASES[0];
    const scenario = phaseToScenario(phase);
    this.scheduler.beginRun(scenario);
    const state = this.runManager.getState();
    this.logger.log(
      `load_test run_id=${state.run_id} starting ${phase.name} (${phase.users} users, ${phase.duration_seconds}s)`,
    );
    this.scheduleNextPhase();
    return {
      running: state.running,
      scenario: state.scenario,
      sent: state.sent,
      errors: state.errors,
      started_at: state.started_at,
    };
  }

  private scheduleNextPhase(): void {
    const phase = LOAD_TEST_PHASES[this.loadTestPhaseIndex];
    const durationMs = getPhaseDurationMs(phase);
    setTimeout(() => {
      const state = this.runManager.getState();
      if (!state.running) return;
      this.scheduler.endRun();
      this.loadTestPhaseIndex++;
      if (this.loadTestPhaseIndex >= LOAD_TEST_PHASES.length) {
        this.logger.log(`load_test complete — sent=${state.sent} errors=${state.errors}`);
        return;
      }
      setTimeout(() => {
        const nextPhase = LOAD_TEST_PHASES[this.loadTestPhaseIndex];
        const scenario = phaseToScenario(nextPhase);
        this.scheduler.switchPhase(scenario);
        this.logger.log(
          `load_test ${nextPhase.name} (${nextPhase.users} users, ${nextPhase.duration_seconds}s)`,
        );
        this.scheduleNextPhase();
      }, COOLDOWN_MS);
    }, durationMs);
  }

  stop(): SimulationStatus {
    this.scheduler.endRun();
    const state = this.runManager.getState();
    this.logger.log(
      `run_id=${state.run_id} stopped — sent=${state.sent} errors=${state.errors}`,
    );
    return {
      running: false,
      scenario: state.scenario,
      sent: state.sent,
      errors: state.errors,
      started_at: state.started_at,
    };
  }

  getStatus(): SimulationStatus & { run_id?: string; paused?: boolean } {
    const state = this.runManager.getState();
    return {
      ...state,
      run_id: state.run_id,
      paused: this.scheduler.isPaused(),
    };
  }

  pause(): void {
    this.scheduler.setPaused(true);
    this.logger.log('simulation paused');
  }

  resume(): void {
    this.scheduler.setPaused(false);
    this.logger.log('simulation resumed');
  }

  injectSpike(users = 3000, durationSec = 5): void {
    this.scheduler.injectSpikeOverlay(users, durationSec);
  }
}
