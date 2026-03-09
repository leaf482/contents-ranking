'use client';

import { useState } from 'react';
import { SIMULATION_BASE } from '@/lib/config';
import { VIDEO_IDS, getVideoTitle } from '@/lib/videos';

interface CreateScenarioDto {
  name: string;
  users: number;
  targetVideoId?: string;
  watchSeconds?: number;
  intervalMs?: number;
  durationSeconds?: number;
}

export function ScenarioBuilder() {
  const [name, setName] = useState('');
  const [users, setUsers] = useState(100);
  const [targetVideoId, setTargetVideoId] = useState('video1');
  const [watchSeconds, setWatchSeconds] = useState(30);
  const [intervalMs, setIntervalMs] = useState(500);
  const [durationSeconds, setDurationSeconds] = useState(120);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const dto: CreateScenarioDto = {
        name: name || `Scenario ${Date.now().toString(36)}`,
        users,
        targetVideoId: targetVideoId || undefined,
        watchSeconds,
        intervalMs,
        durationSeconds: durationSeconds || undefined,
      };
      const res = await fetch(`${SIMULATION_BASE}/v1/factory/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      setName('');
      setUsers(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-700 bg-gray-800/50 p-4"
    >
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Scenario Builder
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <label className="mb-1 block text-xs text-gray-500">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Custom scenario"
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Users</label>
          <input
            type="number"
            min={1}
            max={10000}
            value={users}
            onChange={(e) => setUsers(Number(e.target.value) || 1)}
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Video</label>
          <select
            value={targetVideoId}
            onChange={(e) => setTargetVideoId(e.target.value)}
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {VIDEO_IDS.map((id) => (
              <option key={id} value={id}>
                {getVideoTitle(id)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Watch (s)</label>
          <input
            type="number"
            min={1}
            value={watchSeconds}
            onChange={(e) => setWatchSeconds(Number(e.target.value) || 30)}
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Interval (ms)</label>
          <input
            type="number"
            min={100}
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value) || 500)}
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Duration (s)</label>
          <input
            type="number"
            min={0}
            placeholder="0 = until stop"
            value={durationSeconds || ''}
            onChange={(e) => setDurationSeconds(Number(e.target.value) || 0)}
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? 'Deploying...' : 'Deploy Scenario'}
        </button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </form>
  );
}
