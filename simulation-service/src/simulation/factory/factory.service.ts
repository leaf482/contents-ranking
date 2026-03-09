import { Injectable, NotFoundException } from '@nestjs/common';
import { ScenarioConfig } from '../engine/scenario-registry';
import { MasterTickScheduler } from '../engine/master-tick-scheduler';
import { ScenarioRegistry } from '../engine/scenario-registry';
import { AttributionIndex } from '../engine/attribution-index';
import { EventLogService } from '../events/event-log.service';
import type { CreateScenarioDto } from './factory.controller';

const DEFAULT_VIDEO_IDS = Array.from({ length: 10 }, (_, i) => `video${i + 1}`);

@Injectable()
export class FactoryService {
  constructor(
    private readonly scheduler: MasterTickScheduler,
    private readonly registry: ScenarioRegistry,
    private readonly attributionIndex: AttributionIndex,
    private readonly eventLog: EventLogService,
  ) {}

  createAndStart(dto: CreateScenarioDto) {
    const scenarioId = `scenario-${Date.now().toString(36)}`;
    const videoId = dto.targetVideoId ?? DEFAULT_VIDEO_IDS[0];

    const config: ScenarioConfig = {
      users: dto.users,
      targetVideoId: videoId,
      watchSeconds: dto.watchSeconds ?? 30,
      intervalMs: dto.intervalMs ?? 500,
      durationTicks: dto.durationSeconds ? dto.durationSeconds * 10 : undefined,
    };

    this.scheduler.enqueueStart(scenarioId, dto.name, config);

    return {
      id: scenarioId,
      name: dto.name,
      config,
      message: 'Scenario created and started',
    };
  }

  listActive() {
    const scenarios = this.registry.getAll().filter((s) => s.status !== 'stopped');
    return scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      config: s.config,
      stats: {
        emittedEvents: s.stats.emittedEvents,
        activeUsers: s.activeUsers,
        elapsedTicks: s.elapsedTicks,
      },
    }));
  }

  patchScenario(id: string, action: 'pause' | 'resume' | 'spike' | 'stop') {
    const scenario = this.registry.get(id);
    if (!scenario) {
      throw new NotFoundException(`Scenario ${id} not found`);
    }

    switch (action) {
      case 'pause':
        this.scheduler.enqueuePause(id);
        return { id, action: 'paused' };
      case 'resume':
        this.scheduler.enqueueResume(id);
        return { id, action: 'resumed' };
      case 'spike':
        if (scenario.status !== 'running') {
          throw new NotFoundException(`Spike only applies to running scenarios (${id} is ${scenario.status})`);
        }
        this.scheduler.enqueueSpike(id, 5, 5000);
        this.eventLog.record('spike', id);
        return { id, action: 'spike_injected' };
      case 'stop':
        this.scheduler.enqueueStop(id);
        this.eventLog.record('stop', id);
        return { id, action: 'stopped' };
      default:
        throw new NotFoundException(`Unknown action: ${action}`);
    }
  }

  getAttribution(): Record<string, string[]> {
    const all = this.attributionIndex.getAll();
    const out: Record<string, string[]> = {};
    for (const [videoId, scenarioIds] of all) {
      const names = scenarioIds
        .map((id) => this.registry.get(id)?.name ?? id)
        .filter(Boolean);
      if (names.length > 0) out[videoId] = names;
    }
    return out;
  }

  /** Attribution with emitted counts per scenario (for tooltips) */
  getAttributionDetail(): Record<
    string,
    Array<{
      scenarioId: string;
      scenarioName: string;
      emittedCount: number;
      activeViewers: number;
      hps: number;
    }>
  > {
    const all = this.attributionIndex.getAll();
    const out: Record<
      string,
      Array<{
        scenarioId: string;
        scenarioName: string;
        emittedCount: number;
        activeViewers: number;
        hps: number;
      }>
    > = {};
    for (const [videoId, scenarioIds] of all) {
      const details = scenarioIds
        .map((id) => {
          const s = this.registry.get(id);
          if (!s) return null;
          const elapsedSec = (s.elapsedTicks * 0.1) || 1;
          return {
            scenarioId: id,
            scenarioName: s.name,
            emittedCount: s.stats.emittedEvents,
            activeViewers: s.activeUsers,
            hps: s.stats.emittedEvents / elapsedSec,
          };
        })
        .filter(Boolean) as Array<{
        scenarioId: string;
        scenarioName: string;
        emittedCount: number;
        activeViewers: number;
        hps: number;
      }>;
      if (details.length > 0) out[videoId] = details;
    }
    return out;
  }
}
