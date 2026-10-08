'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { getDashboard, type DashboardResult } from './actions';
import type { DashboardPeriodKey } from '@/repositories/dashboard';

const PERIOD_OPTIONS: { key: DashboardPeriodKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: '7d', label: '7日' },
  { key: '30d', label: '30日' },
  { key: 'thisMonth', label: '今月' },
  { key: 'lastMonth', label: '先月' },
  { key: '90d', label: '90日' },
];

function formatJpy(value: number): string {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

/**
 * §49(Phase6実装仕様, 2026-09-29): ダッシュボードのKPI/トレンド/要対応セクション。
 * 初期データはServer Component(page.tsx)から受け取り、期間セレクタ操作時のみ
 * Server Action(actions.ts)を呼んで再取得する(他の一覧画面と同じuseTransitionパターン)。
 *
 * 2026-10-08: 「文字が多くてわかりにくい」という要望に対応し、KPIカードを
 * デザインシステムの.cardに揃え、為替レートの注記は<details>に畳んで
 * 初期表示の文字量を減らした。
 */
export function DashboardClient({ initial, initialPeriod }: { initial: DashboardResult; initialPeriod: DashboardPeriodKey }) {
  const [period, setPeriod] = useState<DashboardPeriodKey>(initialPeriod);
  const [result, setResult] = useState<DashboardResult>(initial);
  const [isPending, startTransition] = useTransition();

  function handlePeriodChange(next: DashboardPeriodKey) {
    setPeriod(next);
    startTransition(async () => {
      const fresh = await getDashboard(next);
      if (fresh) setResult(fresh);
    });
  }

  const { data, canSeeFinancials } = result;
  const { kpis, trend, attention } = data;

  return (
    <div style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity .15s' }}>
      <div className="dashboard-period-row" role="tablist" aria-label="集計期間">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={period === opt.key}
            className="btn dashboard-period-btn"
            onClick={() => handlePeriodChange(opt.key)}
            data-active={period === opt.key}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="dashboard-kpi-grid">
        {canSeeFinancials && (
          <KpiCard label={`${kpis.period.label}の売上`} value={formatJpy(kpis.periodSalesJpy)} />
        )}
        {canSeeFinancials && (
          <KpiCard
            label={`${kpis.period.label}の粗利`}
            value={kpis.periodGrossProfitJpy !== null ? formatJpy(kpis.periodGrossProfitJpy) : '算出不可'}
            note={kpis.costUnknownCount > 0 ? `原価未登録${kpis.costUnknownCount}件を除く` : undefined}
          />
        )}
        <KpiCard label={`${kpis.period.label}の販売件数`} value={`${kpis.periodSoldCount}件`} />
        <KpiCard label="出品中" value={`${kpis.activeListingCount}件`} />
        <KpiCard
          label="平均販売日数"
          value={kpis.averageDaysToSellInPeriod !== null ? `${kpis.averageDaysToSellInPeriod.toFixed(1)}日` : '-'}
        />
        <KpiCard label="30日以上未販売" value={`${kpis.unsoldOver30Days}件`} highlight={kpis.unsoldOver30Days > 0} />
      </div>

      {canSeeFinancials && (
        <details className="dashboard-disclaimer">
          <summary>売上・粗利の算出について</summary>
          <p className="subnote">
            概算為替レート(¥{kpis.jpyPerUsd}/USD)で換算した概算値です。実際の入金額とは差異が生じます。
          </p>
        </details>
      )}

      <section className="card dashboard-section">
        <h2>販売推移</h2>
        <TrendChart trend={trend} showAmount={canSeeFinancials} />
      </section>

      <section className="card dashboard-section">
        <h2>要対応(60日以上未販売)</h2>
        {attention.length === 0 ? (
          <p className="subnote">現在、対象の商品はありません。</p>
        ) : (
          <div className="dashboard-attention-list">
            {attention.map((item) => (
              <Link href="/listings" key={item.listingId} className="dashboard-attention-row">
                <span className="dashboard-attention-title">{item.title ?? '(タイトル未取得)'}</span>
                <span className="dashboard-attention-meta">
                  <span className="dashboard-attention-days">{item.daysSincePublished ?? '-'}日経過</span>
                  {item.price !== null && (
                    <span className="dashboard-attention-price">
                      {item.currency ?? ''} {item.price}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  note,
  highlight,
}: {
  label: string;
  value: string;
  note?: string;
  highlight?: boolean;
}) {
  return (
    <div className="card dashboard-kpi-card" data-highlight={highlight ? 'true' : undefined}>
      <div className="dashboard-kpi-label">{label}</div>
      <div className="dashboard-kpi-value">{value}</div>
      {note && <div className="dashboard-kpi-note">{note}</div>}
    </div>
  );
}

function TrendChart({
  trend,
  showAmount,
}: {
  trend: { date: string; salesJpy: number; count: number }[];
  showAmount: boolean;
}) {
  if (trend.length === 0) {
    return <p className="subnote">この期間の販売データはまだありません。</p>;
  }

  const values = trend.map((t) => (showAmount ? t.salesJpy : t.count));
  const max = Math.max(...values, 1);
  const width = 640;
  const height = 160;
  const padding = 24;
  const stepX = trend.length > 1 ? (width - padding * 2) / (trend.length - 1) : 0;

  const points = trend.map((t, i) => {
    const x = padding + stepX * i;
    const v = showAmount ? t.salesJpy : t.count;
    const y = height - padding - (v / max) * (height - padding * 2);
    return { x, y, t };
  });

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: width, height }}>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--line-strong)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--accent)" />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: 'var(--muted)', maxWidth: width }}>
        <span>{trend[0]!.date}</span>
        <span>{trend[trend.length - 1]!.date}</span>
      </div>
      <p className="subnote" style={{ fontSize: '.72rem' }}>
        {showAmount ? '縦軸: 売上(概算円)' : '縦軸: 販売件数'} / 横軸: 日付
      </p>
    </div>
  );
}
