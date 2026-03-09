'use client';

import { useCallback, useRef, useState } from 'react';
import { useInterval } from '@/hooks/useInterval';
import { LastSynced } from './LastSynced';
import { GO_API_BASE, SIMULATION_BASE } from '@/lib/config';
import { getVideoTitle } from '@/lib/videos';
import { motion, AnimatePresence } from 'framer-motion';

interface RankingItem {
  video_id: string;
  score: number;
}

interface AttributionDetail {
  scenarioId: string;
  scenarioName: string;
  emittedCount: number;
  activeViewers: number;
  hps: number;
}

type RankChange = 'up' | 'down' | 'same';

function RankIndicator({ change }: { change: RankChange }) {
  if (change === 'up') return <span className="text-red-400">▲</span>;
  if (change === 'down') return <span className="text-blue-400">▼</span>;
  return <span className="text-gray-500">−</span>;
}

function NumberTicker({
  value,
  animate,
}: {
  value: number;
  animate: boolean;
}) {
  return (
    <motion.span
      key={value}
      initial={animate ? { y: -8, opacity: 0.6 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="inline-block font-mono font-medium tabular-nums text-emerald-400"
    >
      {value}
    </motion.span>
  );
}

function AttributionTooltip({
  details,
  children,
}: {
  details: AttributionDetail[];
  children: React.ReactNode;
}) {
  const tooltipText = details
    .map((d) => `${d.scenarioName}: ${d.emittedCount} heartbeats`)
    .join('\n');
  return (
    <span className="group relative inline-block cursor-help">
      {children}
      <span
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden max-w-[220px] rounded bg-gray-900 px-2 py-1.5 text-xs text-gray-200 shadow-lg group-hover:block"
        style={{ whiteSpace: 'pre-line' }}
      >
        {tooltipText}
      </span>
    </span>
  );
}

export function RankingPanel() {
  const [data, setData] = useState<RankingItem[] | null>(null);
  const [attribution, setAttribution] = useState<Record<string, string[]>>({});
  const [attributionDetail, setAttributionDetail] = useState<
    Record<string, AttributionDetail[]>
  >({});
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const prevRankMap = useRef<Map<string, number>>(new Map());
  const prevScoreMap = useRef<Map<string, number>>(new Map());
  const seenVideoIds = useRef<Set<string>>(new Set());
  const [rankChanges, setRankChanges] = useState<Map<string, RankChange>>(new Map());
  const [scoreChanged, setScoreChanged] = useState<Set<string>>(new Set());
  const [firstEntryIds, setFirstEntryIds] = useState<Set<string>>(new Set());

  const fetchRanking = useCallback(async () => {
    try {
      const [rankRes, attrRes, detailRes] = await Promise.all([
        fetch(`${GO_API_BASE}/v1/ranking?limit=10`),
        fetch(`${SIMULATION_BASE}/v1/factory/scenarios/attribution`),
        fetch(`${SIMULATION_BASE}/v1/factory/scenarios/attribution/detail`),
      ]);
      const rankJson = await rankRes.json();
      const items: RankingItem[] = Array.isArray(rankJson) ? rankJson : [];
      const attr = await attrRes.json().catch(() => ({}));
      const detail = await detailRes.json().catch(() => ({}));
      setAttribution(typeof attr === 'object' ? attr : {});
      setAttributionDetail(typeof detail === 'object' ? detail : {});

      const changes = new Map<string, RankChange>();
      const newRankMap = new Map<string, number>();
      const newFirstEntry = new Set<string>();

      items.forEach((item, idx) => {
        const rank = idx + 1;
        newRankMap.set(item.video_id, rank);
        if (!seenVideoIds.current.has(item.video_id)) {
          newFirstEntry.add(item.video_id);
          seenVideoIds.current.add(item.video_id);
        }
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
      setFirstEntryIds(newFirstEntry);
      setData(items);
      setLastSyncedAt(Date.now());

      if (scoreDeltas.size > 0) {
        setTimeout(() => setScoreChanged(new Set()), 600);
      }
      if (newFirstEntry.size > 0) {
        setTimeout(() => setFirstEntryIds(new Set()), 1200);
      }
    } catch {
      setData([]);
    }
  }, []);

  useInterval(fetchRanking, 800);

  const DISPLAY_LIMIT = 10;
  const displayItems = data ? data.slice(0, DISPLAY_LIMIT) : [];

  const getVideoStats = (videoId: string) => {
    const details = attributionDetail[videoId] ?? [];
    const activeViewers = details.reduce((s, d) => s + d.activeViewers, 0);
    const hps = details.reduce((s, d) => s + d.hps, 0);
    return { activeViewers, hps };
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <h2 className="mb-4 shrink-0 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Attribution Ranking Board
      </h2>
      <div className="min-h-0 flex-1 overflow-hidden">
        {data === null ? (
          <div className="flex h-24 items-center justify-center text-gray-500">
            Loading...
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-600 bg-gray-900/30">
            <p className="text-sm text-gray-500">Waiting for Simulation Data...</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            <li className="grid grid-cols-[2rem_1.25rem_1fr_4rem_3.5rem_4rem] items-center gap-2 px-3 py-1 text-xs font-medium uppercase text-gray-500">
              <span>#</span>
              <span />
              <span>Video</span>
              <span className="text-right">Viewers</span>
              <span className="text-right">HPS</span>
              <span className="text-right">Score</span>
            </li>
            <AnimatePresence mode="popLayout">
              {displayItems.map((item, i) => {
                const { activeViewers, hps } = getVideoStats(item.video_id);
                const isFirstEntry = firstEntryIds.has(item.video_id);
                const details = attributionDetail[item.video_id] ?? [];
                return (
                  <motion.li
                    key={item.video_id}
                    layout
                    layoutId={item.video_id}
                    initial={isFirstEntry ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 30,
                      opacity: { duration: 0.4 },
                    }}
                    className={`grid grid-cols-[2rem_1.25rem_1fr_4rem_3.5rem_4rem] items-center gap-2 rounded-lg border px-3 py-1.5 ${
                      isFirstEntry
                        ? 'animate-first-entry border-cyan-500/60 bg-cyan-900/20'
                        : 'border-gray-600 bg-gray-700/30'
                    }`}
                  >
                    <span className="font-mono text-gray-400">#{i + 1}</span>
                    <span className="flex justify-center">
                      <RankIndicator change={rankChanges.get(item.video_id) ?? 'same'} />
                    </span>
                    <div className="min-w-0 overflow-hidden">
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate font-mono text-gray-300">{getVideoTitle(item.video_id)}</span>
                        {attribution[item.video_id]?.length ? (
                          <AttributionTooltip details={details}>
                            <span className="truncate text-xs text-cyan-400" title={`Likely driven by: ${attribution[item.video_id].join(', ')}`}>
                              By: {attribution[item.video_id].join(', ')}
                            </span>
                          </AttributionTooltip>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-right font-mono text-xs tabular-nums text-gray-400">
                      {activeViewers}
                    </span>
                    <span className="text-right font-mono text-xs tabular-nums text-gray-400">
                      {hps.toFixed(1)}
                    </span>
                    <span className="text-right">
                      <NumberTicker
                        value={item.score}
                        animate={scoreChanged.has(item.video_id)}
                      />
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
      <div className="mt-2 flex shrink-0 justify-end">
        <LastSynced lastSyncedAt={lastSyncedAt} />
      </div>
    </div>
  );
}
