'use client';

import { useCallback, useState } from 'react';
import { useInterval } from '@/hooks/useInterval';
import { useRun } from '@/context/RunContext';
import { LastSynced } from './LastSynced';
import { SIMULATION_BASE } from '@/lib/config';

interface PipelineStep {
  id: string;
  label: string;
  status: 'active' | 'idle' | 'unknown';
}

export function PipelineStatusPanel() {
  const { runState, refreshStatus, pauseSimulation, resumeSimulation, injectSpike } =
    useRun();
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<{
    rps: number;
    workerThroughput: number;
    lag: number;
  } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      await refreshStatus();
      const [statusRes, metricsRes] = await Promise.all([
        fetch(`${SIMULATION_BASE}/v1/simulation/status`),
        fetch(`${SIMULATION_BASE}/api/v1/metrics/summary`),
      ]);
      const statusData = await statusRes.json();
      const metricsData = await metricsRes.json().catch(() => ({}));

      setPipelineStatus({
        rps: metricsData.rps ?? 0,
        workerThroughput: metricsData.workerThroughput ?? 0,
        lag: metricsData.consumerLag ?? 0,
      });
      setLastSyncedAt(Date.now());
    } catch {
      // Keep previous
    }
  }, [refreshStatus]);

  useInterval(fetchStatus, 1000);

  const hasFlow =
    pipelineStatus &&
    (pipelineStatus.rps > 0 ||
      pipelineStatus.workerThroughput > 0 ||
      pipelineStatus.lag > 0);

  const steps: PipelineStep[] = [
    { id: 'api', label: 'API', status: hasFlow && pipelineStatus!.rps > 0 ? 'active' : runState.status === 'running' ? 'idle' : 'unknown' },
    { id: 'kafka', label: 'Kafka', status: hasFlow ? 'active' : runState.status === 'running' ? 'idle' : 'unknown' },
    { id: 'worker', label: 'Worker', status: hasFlow && pipelineStatus!.workerThroughput > 0 ? 'active' : runState.status === 'running' ? 'idle' : 'unknown' },
    { id: 'redis', label: 'Redis', status: hasFlow ? 'active' : runState.status === 'running' ? 'idle' : 'unknown' },
  ];

  return (
    <div className="relative flex flex-col rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Pipeline Status & Chaos Panel
      </h2>

      {/* Pipeline Visualizer */}
      <div className="mb-4 flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 ${
                step.status === 'active'
                  ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50'
                  : step.status === 'idle'
                    ? 'bg-gray-600/30 text-gray-400'
                    : 'bg-gray-700/30 text-gray-500'
              }`}
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  step.status === 'active'
                    ? 'bg-emerald-500 animate-pulse'
                    : step.status === 'idle'
                      ? 'bg-amber-500/70'
                      : 'bg-gray-500'
                }`}
              />
              <span className="text-sm font-medium">{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <span className="text-cyan-500/80">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Run info */}
      <div className="mb-4 rounded bg-gray-900/50 p-3 font-mono text-xs text-gray-500">
        Run: {runState.run_id || '—'} | Sent: {runState.sent} | Errors:{' '}
        {runState.errors}
        {runState.paused && (
          <span className="ml-2 text-amber-400">(Paused)</span>
        )}
      </div>

      {/* Chaos Panel */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium uppercase text-gray-500">
          Chaos Injection
        </span>
        <button
          onClick={runState.paused ? resumeSimulation : pauseSimulation}
          disabled={runState.status !== 'running'}
          className="rounded border border-amber-500/50 bg-amber-600/20 px-3 py-1.5 text-sm font-medium text-amber-400 hover:bg-amber-600/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {runState.paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={injectSpike}
          disabled={runState.status !== 'running'}
          className="rounded border border-red-500/50 bg-red-600/20 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-600/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Spike (3k users, 5s)
        </button>
      </div>

      <div className="mt-2 flex justify-end">
        <LastSynced lastSyncedAt={lastSyncedAt} />
      </div>
    </div>
  );
}
