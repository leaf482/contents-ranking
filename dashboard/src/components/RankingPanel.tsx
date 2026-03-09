'use client';

import { useCallback, useRef, useState } from 'react';
import { useInterval } from '@/hooks/useInterval';
import { LastSynced } from './LastSynced';
import { GO_API_BASE } from '@/lib/config';

interface RankingItem {
  video_id: string;
  score: number;
}

type RankChange = 'up' | 'down' | 'same';

function RankIndicator({ change }: { change: RankChange }) {
  if (change === 'up') return <span className="text-red-400">▲</span>;
  if (change === 'down') return <span className="text-blue-400">▼</span>;
  return <span className="text-gray-500">−</span>;
}

export function RankingPanel() {
  const [data, setData] = useState<RankingItem[] | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const prevRankMap = useRef<Map<string, number>>(new Map());
  const prevScoreMap = useRef<Map<string, number>>(new Map());
  const [rankChanges, setRankChanges] = useState<Map<string, RankChange>>(new Map());
  const [scoreChanged, setScoreChanged] = useState<Set<string>>(new Set());

  const fetchRanking = useCallback(async () => {
    try {
      const res = await fetch(`${GO_API_BASE}/v1/ranking?limit=10`);
      const json = await res.json();
      const items: RankingItem[] = Array.isArray(json) ? json : [];

      const changes = new Map<string, RankChange>();
      const newRankMap = new Map<string, number>();

      items.forEach((item, idx) => {
        const rank = idx + 1;
        newRankMap.set(item.video_id, rank);
        const prevRank = prevRankMap.current.get(item.video_id);
        if (prevRank !== undefined) {
          if (rank < prevRank) changes.set(item.video_id, 'up');
          else if (rank > prevRank) changes.set(item.video_id, 'down');
          else changes.set(item.video_id, 'same');
        } else {
          changes.set(item.video_id, 'same');
        }
      });

      const scoreDeltas = new Set<string>();
      items.forEach((item) => {
        const prev = prevScoreMap.current.get(item.video_id);
        if (prev !== undefined && prev !== item.score) {
          scoreDeltas.add(item.video_id);
        }
      });
      prevScoreMap.current = new Map(items.map((i) => [i.video_id, i.score]));

      prevRankMap.current = newRankMap;
      setRankChanges(changes);
      setScoreChanged(scoreDeltas);
      setData(items);
      setLastSyncedAt(Date.now());

      // Clear score animation after a short delay
      if (scoreDeltas.size > 0) {
        setTimeout(() => setScoreChanged(new Set()), 600);
      }
    } catch {
      setData([]);
    }
  }, []);

  useInterval(fetchRanking, 800);

  return (
    <div className="relative flex h-full min-h-[200px] flex-col rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Live Ranking
      </h2>
      <div className="flex-1 overflow-auto">
        {data === null ? (
          <div className="flex h-24 items-center justify-center text-gray-500">
            Loading...
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-600 bg-gray-900/30">
            <p className="text-sm text-gray-500">Waiting for Simulation Data...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-600 text-left text-gray-400">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Δ</th>
                  <th className="py-2">Video</th>
                  <th className="py-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, i) => (
                  <tr
                    key={item.video_id}
                    className="border-b border-gray-700/50 hover:bg-gray-700/20"
                  >
                    <td className="py-2 pr-2 font-mono text-gray-400">
                      {i + 1}
                    </td>
                    <td className="py-2 pr-2 w-6">
                      <RankIndicator change={rankChanges.get(item.video_id) ?? 'same'} />
                    </td>
                    <td className="py-2 font-mono text-gray-300">
                      {item.video_id}
                    </td>
                    <td className="py-2 text-right">
                      <ScoreCell
                        score={item.score}
                        changed={scoreChanged.has(item.video_id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <LastSynced lastSyncedAt={lastSyncedAt} />
      </div>
    </div>
  );
}

function ScoreCell({ score, changed }: { score: number; changed: boolean }) {
  return (
    <span
      className={`font-mono font-medium tabular-nums transition-all duration-300 ${
        changed ? 'animate-pulse text-emerald-400' : 'text-emerald-400'
      }`}
    >
      {score}
    </span>
  );
}
