/**
 * Master Tick Scheduler: 100ms period.
 * - Processes CommandQueue at tick start (coalesce → Registry)
 * - Iterates all 'running' scenarios, aggregates heartbeats
 * - Sends aggregated batch to Go API in one call
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Scenario, ScenarioConfig } from './scenario-registry';
import { ScenarioRegistry } from './scenario-registry';
import { CommandQueue, QueuedCommand } from './command-queue';
import { AttributionIndex } from './attribution-index';
import { BatchSender, HeartbeatPayload } from './batch-sender';
import { EventLogService } from '../events/event-log.service';
import { EventStreamService } from '../events/event-stream.service';

const TICK_MS = 100;
const DEFAULT_API_URL = process.env.RANKING_API_URL ?? 'http://localhost:8080/v1/heartbeat';

@Injectable()
export class MasterTickScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(MasterTickScheduler.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly registry: ScenarioRegistry,
    private readonly commandQueue: CommandQueue,
    private readonly attributionIndex: AttributionIndex,
    private readonly batchSender: BatchSender,
    private readonly eventLog: EventLogService,
    private readonly eventStream: EventStreamService,
  ) {}

  onModuleDestroy(): void {
    this.stop();
  }

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), TICK_MS);
    this.logger.log('Master tick scheduler started (100ms period)');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.logger.log('Master tick scheduler stopped');
  }

  enqueueStart(scenarioId: string, name: string, config: ScenarioConfig): void {
    this.commandQueue.enqueue({
      scenarioId,
      command: 'start',
      name,
      config,
    });
  }

  enqueuePause(scenarioId: string): void {
    this.commandQueue.enqueue({ scenarioId, command: 'pause' });
  }

  enqueueResume(scenarioId: string): void {
    this.commandQueue.enqueue({ scenarioId, command: 'resume' });
  }

  enqueueStop(scenarioId: string): void {
    this.commandQueue.enqueue({ scenarioId, command: 'stop' });
  }

  enqueueSwitchPhase(scenarioId: string, config: ScenarioConfig): void {
    this.commandQueue.enqueue({
      scenarioId,
      command: 'switch_phase',
      config,
    });
  }

  /** Apply spike to a specific scenario (multiplier x for durationMs) */
  enqueueSpike(scenarioId: string, multiplier: number, durationMs: number): void {
    const s = this.registry.get(scenarioId);
    if (s) this.registry.setSpike(scenarioId, multiplier, durationMs);
  }

  /** Apply spike to all running scenarios */
  enqueueLoadSpike(multiplier: number, durationMs: number): void {
    this.registry.setSpikeAll(multiplier, durationMs);
  }

  private applyCommands(commands: QueuedCommand[]): void {
    for (const cmd of commands) {
      switch (cmd.command) {
        case 'start':
          if (cmd.config && cmd.name) {
            const existing = this.registry.get(cmd.scenarioId);
            if (existing) {
              this.attributionIndex.clearScenario(cmd.scenarioId, existing.config.targetVideoId);
            }
            const scenario = this.registry.create(cmd.scenarioId, cmd.name, cmd.config);
            if (cmd.initialStatus === 'paused') {
              this.registry.setStatus(cmd.scenarioId, 'paused');
            }
            this.attributionIndex.setScenarioVideo(cmd.scenarioId, cmd.config.targetVideoId);
            this.eventLog.record('start', cmd.scenarioId);
            const durationSeconds = cmd.config.durationTicks
              ? (cmd.config.durationTicks * TICK_MS) / 1000
              : undefined;
            this.logger.log(
              `scenario started id=${cmd.scenarioId} name="${cmd.name}" users=${cmd.config.users} intervalMs=${cmd.config.intervalMs}` +
                ` durationSec=${durationSeconds ?? '∞'}${cmd.initialStatus === 'paused' ? ' [paused]' : ''}`,
            );
          }
          break;
        case 'pause':
          this.registry.setStatus(cmd.scenarioId, 'paused');
          this.eventLog.record('pause', cmd.scenarioId);
          this.logger.debug(`paused ${cmd.scenarioId}`);
          break;
        case 'resume':
          this.registry.setStatus(cmd.scenarioId, 'running');
          this.eventLog.record('resume', cmd.scenarioId);
          this.logger.debug(`resumed ${cmd.scenarioId}`);
          break;
        case 'stop':
          const s = this.registry.get(cmd.scenarioId);
          if (s) {
            this.attributionIndex.clearScenario(cmd.scenarioId, s.config.targetVideoId);
            this.registry.setStatus(cmd.scenarioId, 'stopped');
            this.registry.remove(cmd.scenarioId);
            this.eventLog.record('stop', cmd.scenarioId);
            this.logger.log(`stopped ${cmd.scenarioId}`);
          }
          break;
        case 'switch_phase':
          if (cmd.config) {
            const existing = this.registry.get(cmd.scenarioId);
            if (existing) {
              this.attributionIndex.clearScenario(cmd.scenarioId, existing.config.targetVideoId);
            }
            this.registry.updateConfig(cmd.scenarioId, cmd.config);
            if (cmd.config.targetVideoId) {
              this.attributionIndex.setScenarioVideo(cmd.scenarioId, cmd.config.targetVideoId);
            }
            this.logger.log(`switch_phase ${cmd.scenarioId} (${cmd.config.users} users)`);
          }
          break;
      }
    }
  }

  private computeEventsPerTick(scenario: Scenario): number {
    const { intervalMs } = scenario.config;
    const activeUsers = scenario.activeUsers;
    if (activeUsers <= 0) return 0;
    let events = Math.round((activeUsers * TICK_MS) / intervalMs);
    if (scenario.loadMultiplier && scenario.spikeEndMs && Date.now() < scenario.spikeEndMs) {
      events = Math.round(events * scenario.loadMultiplier);
    } else if (scenario.spikeEndMs && Date.now() >= scenario.spikeEndMs) {
      scenario.loadMultiplier = undefined;
      scenario.spikeEndMs = undefined;
    }
    return events;
  }

  private buildPayloads(scenario: Scenario, count: number): HeartbeatPayload[] {
    const { targetVideoId, watchSeconds, intervalMs } = scenario.config;
    const maxPlayheadMs = watchSeconds * 1000;
    const prefix = `${scenario.id}-`;
    const payloads: HeartbeatPayload[] = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
      const userIdx = i % scenario.activeUsers;
      const userId = `${prefix}user-${userIdx + 1}`;
      const prev = scenario.playheads.get(userId) ?? 0;

      // User has reached total watch time - stop sending events (1x real-time sync)
      if (prev >= maxPlayheadMs) continue;

      // 1x speed: playhead advances by actual elapsed time (intervalMs between heartbeats)
      const next = Math.min(prev + intervalMs, maxPlayheadMs);
      scenario.playheads.set(userId, next);

      payloads.push({
        session_id: `sim-${userId}`,
        user_id: userId,
        video_id: targetVideoId,
        playhead: next,
        timestamp: now,
      });
    }
    return payloads;
  }

  private async tick(): Promise<void> {
    const commands = this.commandQueue.drain();
    if (commands.length > 0) {
      this.applyCommands(commands);
    }

    const running = this.registry.getRunning();
    if (running.length === 0) return;

    const allPayloads: HeartbeatPayload[] = [];
    const countsPerScenario: Map<string, number> = new Map();

    for (const scenario of running) {
      scenario.elapsedTicks++;

      if (scenario.config.durationTicks && scenario.elapsedTicks >= scenario.config.durationTicks) {
        this.attributionIndex.clearScenario(scenario.id, scenario.config.targetVideoId);
        this.registry.remove(scenario.id);
        this.logger.log(`scenario ${scenario.id} duration reached, stopped`);
        continue;
      }

      if (scenario.elapsedTicks < scenario.rampUpTicks) {
        scenario.activeUsers = Math.min(
          scenario.activeUsers + Math.max(1, Math.floor(scenario.config.users / scenario.rampUpTicks)),
          scenario.config.users,
        );
      } else {
        scenario.activeUsers = scenario.config.users;
      }

      const eventsCount = this.computeEventsPerTick(scenario);
      if (eventsCount > 0) {
        const payloads = this.buildPayloads(scenario, eventsCount);
        allPayloads.push(...payloads);
        countsPerScenario.set(scenario.id, payloads.length);
      }
    }

    if (allPayloads.length > 0) {
      this.eventStream.pushBatch(
        allPayloads.map((p) => ({ user_id: p.user_id, video_id: p.video_id })),
      );
      const { sent } = await this.batchSender.sendBatch(allPayloads, DEFAULT_API_URL);
      const ratio = sent / allPayloads.length;
      for (const [id, count] of countsPerScenario) {
        const s = this.registry.get(id);
        if (s) s.stats.emittedEvents += Math.round(count * ratio);
      }
    }
  }

  getRegistry(): ScenarioRegistry {
    return this.registry;
  }
}
