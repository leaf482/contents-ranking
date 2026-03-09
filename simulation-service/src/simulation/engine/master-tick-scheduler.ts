/**
 * Master Tick Scheduler: Single 100ms setInterval loop.
 * Drives TaskManager each tick when a run is active.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SimulationScenario } from '../interfaces/scenario.interface';
import { RunManager } from './run-manager';
import { TaskManager } from './task-manager';

const TICK_MS = 100;
const DEFAULT_API_URL = process.env.RANKING_API_URL ?? 'http://localhost:8080/v1/heartbeat';

@Injectable()
export class MasterTickScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(MasterTickScheduler.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private playheads = new Map<string, number>();
  private elapsedTicks = 0;
  private activeUsers = 0;
  private usersPerRampTick: number = 0;
  private stopped = false;
  private paused = false;
  /** Spike overlay: extra users for a limited time */
  private spikeOverlayUsers = 0;
  private spikeOverlayEndMs = 0;

  constructor(
    private readonly taskManager: TaskManager,
    private readonly runManager: RunManager,
  ) {}

  onModuleDestroy(): void {
    this.stop();
  }

  /** Start the master tick loop (idle until a run is started) */
  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), TICK_MS);
    this.logger.log('Master tick scheduler started (100ms period)');
  }

  /** Stop the master tick loop */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.stopped = true;
    this.logger.log('Master tick scheduler stopped');
  }

  /** Begin a simulation run (called by SimulationService) */
  beginRun(scenario: SimulationScenario): void {
    this.runManager.startRun(scenario);
    this.playheads.clear();
    this.elapsedTicks = 0;
    this.activeUsers = 0;
    this.usersPerRampTick = Math.max(
      1,
      Math.floor(scenario.users / Math.max(scenario.ramp_up_seconds * (1000 / TICK_MS), 1)),
    );
    this.stopped = false;
  }

  /** End the current run */
  endRun(): void {
    this.stopped = true;
    this.paused = false;
    this.spikeOverlayUsers = 0;
    this.runManager.stopRun();
  }

  /** Switch to next phase (keep run_id, sent, errors; reset tick state) */
  switchPhase(scenario: SimulationScenario): void {
    this.runManager.switchPhase(scenario);
    this.playheads.clear();
    this.elapsedTicks = 0;
    this.activeUsers = 0;
    this.usersPerRampTick = Math.max(
      1,
      Math.floor(scenario.users / Math.max(scenario.ramp_up_seconds * (1000 / TICK_MS), 1)),
    );
    this.stopped = false;
  }

  /** Pause heartbeat sending (run state preserved) */
  setPaused(p: boolean): void {
    this.paused = p;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Inject 5s spike overlay: 3000 extra users */
  injectSpikeOverlay(users = 3000, durationSec = 5): void {
    this.spikeOverlayUsers = users;
    this.spikeOverlayEndMs = Date.now() + durationSec * 1000;
    this.logger.log(`spike overlay: +${users} users for ${durationSec}s`);
  }

  private getActiveUsers(): number {
    return this.activeUsers;
  }

  private getElapsedTicks(): number {
    return this.elapsedTicks;
  }

  private async tick(): Promise<void> {
    const state = this.runManager.getState();
    if (!state.running || this.stopped || !state.scenario) {
      return;
    }

    // Expire spike overlay
    if (this.spikeOverlayUsers > 0 && Date.now() >= this.spikeOverlayEndMs) {
      this.spikeOverlayUsers = 0;
    }

    const scenario = state.scenario;
    const rampTicks = Math.ceil((scenario.ramp_up_seconds * 1000) / TICK_MS);

    // Ramp-up
    if (this.elapsedTicks < rampTicks) {
      this.activeUsers = Math.min(
        this.activeUsers + this.usersPerRampTick,
        scenario.users,
      );
    } else {
      this.activeUsers = scenario.users;
    }

    // Skip sending when paused
    if (this.paused) {
      this.elapsedTicks++;
      return;
    }

    // Add spike overlay users to effective load
    const effectiveUsers = this.activeUsers + this.spikeOverlayUsers;

    const config = {
      targetUrl: DEFAULT_API_URL,
      scenario,
      getActiveUsers: () => effectiveUsers,
      getElapsedTicks: () => this.elapsedTicks,
    };

    const { sent, errors } = await this.taskManager.executeTick(config, this.playheads);
    this.runManager.recordTick(sent, errors);

    this.elapsedTicks++;

    // Duration check
    const elapsedSeconds = (this.elapsedTicks * TICK_MS) / 1000;
    if (scenario.duration_seconds && elapsedSeconds >= scenario.duration_seconds) {
      this.logger.log(`simulation duration reached (${scenario.duration_seconds}s), stopping`);
      this.endRun();
    }
  }
}
