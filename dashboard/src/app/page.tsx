'use client';

import { Header } from '@/components/Header';
import { ControlPanel } from '@/components/ControlPanel';
import { MetricsPanel } from '@/components/MetricsPanel';
import { RankingPanel } from '@/components/RankingPanel';
import { PipelineStatusPanel } from '@/components/PipelineStatusPanel';

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      <Header />
      <main className="flex-1 p-6">
        <div className="mx-auto grid max-w-7xl gap-6">
          {/* Top Row: Control Panel */}
          <section>
            <ControlPanel />
          </section>

          {/* Middle Row: Metrics (70%) + Ranking (30%) */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_350px]">
            <div className="min-h-[240px]">
              <MetricsPanel />
            </div>
            <div className="min-h-[240px]">
              <RankingPanel />
            </div>
          </section>

          {/* Bottom Row: Pipeline Status */}
          <section>
            <PipelineStatusPanel />
          </section>
        </div>
      </main>
    </div>
  );
}
