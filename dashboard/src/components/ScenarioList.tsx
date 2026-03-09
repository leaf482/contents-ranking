'use client';

import { useCallback, useState } from 'react';
import { useInterval } from '@/hooks/useInterval';
import { SIMULATION_BASE } from '@/lib/config';
import { getVideoTitle } from '@/lib/videos';

interface ActiveScenario {
  id: string;
  name: string;
  status: string;
  config: { users: number; targetVideoId: string };
  stats: { emittedEvents: number; activeUsers: number };
}

export function ScenarioList() {
  const [scenarios, setScenarios] = useState<ActiveScenario[]>([]);
  const [optimistic, setOptimistic] = useState<Record<string, { status?: string }>>({});
  const [loading, setLoading] = useState<Record<string, string | null>>({});

  const fetchScenarios = useCallback(async () => {
    try {
      const res = await fetch(`${SIMULATION_BASE}/v1/factory/scenarios`);
      const json = await res.json();
      setScenarios(Array.isArray(json) ? json : []);
    } catch {
      setScenarios([]);
    }
  }, []);

  useInterval(fetchScenarios, 1000);

  const patch = async (id: string, action: 'pause' | 'resume' | 'spike') => {
    setLoading((p) => ({ ...p, [id]: action }));
    setOptimistic((o) => ({
      ...o,
      [id]: {
        status: action === 'pause' ? 'paused' : action === 'resume' ? 'running' : o[id]?.status,
      },
    }));
    setScenarios((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status:
                action === 'pause'
                  ? 'paused'
                  : action === 'resume'
                    ? 'running'
                    : s.status,
            }
          : s
      )
    );
    try {
      const res = await fetch(`${SIMULATION_BASE}/v1/factory/scenarios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, status: s.status } : s)));
    } finally {
      setLoading((p) => ({ ...p, [id]: null }));
      setOptimistic((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
    }
  };

  const stop = async (id: string) => {
    setOptimistic((o) => ({ ...o, [id]: { status: 'stopped' } }));
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    try {
      await fetch(`${SIMULATION_BASE}/v1/factory/scenarios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
    } catch {
      fetchScenarios();
    }
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Active Scenarios
      </h2>
      {scenarios.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          No active scenarios. Deploy one from the builder above.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-gray-600 bg-gray-700/30 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-gray-200">{s.name}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    (optimistic[s.id]?.status ?? s.status) === 'running'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : (optimistic[s.id]?.status ?? s.status) === 'paused'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {optimistic[s.id]?.status ?? s.status}
                </span>
              </div>
              <div className="mb-3 text-xs text-gray-500">
                {s.config.users} users → {getVideoTitle(s.config.targetVideoId)} | {s.stats.emittedEvents} events
              </div>
              <div className="flex gap-2">
                {(optimistic[s.id]?.status ?? s.status) === 'running' ? (
                  <button
                    onClick={() => patch(s.id, 'pause')}
                    disabled={!!loading[s.id]}
                    className="rounded bg-amber-600/80 px-2 py-1 text-xs text-white hover:bg-amber-500 disabled:opacity-50"
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={() => patch(s.id, 'resume')}
                    disabled={!!loading[s.id]}
                    className="rounded bg-emerald-600/80 px-2 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={() => patch(s.id, 'spike')}
                  disabled={!!loading[s.id] || (optimistic[s.id]?.status ?? s.status) !== 'running'}
                  className="rounded bg-red-600/80 px-2 py-1 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                >
                  Spike
                </button>
                <button
                  onClick={() => stop(s.id)}
                  className="ml-auto rounded bg-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-500"
                >
                  Stop
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
