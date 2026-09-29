'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { getDashboard, type DashboardResult } from './actions';
import type { DashboardPeriodKey } from '@/repositories/dashboard';

const PERIOD_OPTIONS: { key: DashboardPeriodKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: '7d', label: '直近7日間' },
  { key: '30d', label: '直近30日間' },
  { key: 'thisMonth', label: '今月' },
  { key: 'lastMonth', label: '先月' },
  { key: '90d', label: '直近90日間' },
];

function formatJpy(value: number): string {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

/**
 * §49(Phase6実装仕様, 2026-09-29): ダッシュボードのKPI/トレンド/要対応セクション。
 * 初期データはServer Component(page.tsx)から受け取り、期間セレクタ操作時のみ
 * Server Action(actions.ts)を呼んで再取得する(他の一覧画面と同じuseTransitionパターン)。
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
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className="btn"
            onClick={() => handlePeriodChange(opt.key)}
            style={{
              fontSize: '.8rem',
              padding: '4px 10px',
              fontWeight: period === opt.key ? 700 : 400,
              borderColor: period === opt.key ? 'var(--accent)' : undefined,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {canSeeFinancials && (
          <KpiCard label={`${kpis.period.label}の売上(概算)`} value={formatJpy(kpis.periodSalesJpy)} />
        )}
        {canSeeFinancials && (
          <KpiCard
            label={`${kpis.period.label}の粗利(概算)`}
            value={kpis.periodGrossProfitJpy !== null ? formatJpy(kpis.periodGrossProfitJpy) : '算出不可'}
            note={
              kpis.costUnknownCount > 0
                ? `原価未登録${kpis.costUnknownCount}件を除く`
                : undefined
            }
          />
        )}
        <KpiCard label={`${kpis.period.label}の販売件数`} value={`${kpis.periodSoldCount}件`} />
        <KpiCard label="出品中の件数" value={`${kpis.activeListingCount}件`} />
        <KpiCard
          label="平均販売日数"
          value={kpis.averageDaysToSellInPeriod !== null ? `${kpis.averageDaysToSellInPeriod.toFixed(1)}日` : '-'}
        />
        <KpiCard label="30日以上未販売" value={`${kpis.unsoldOver30Days}件`} />
      </div>

      {canSeeFinancials && (
        <p className="subnote" style={{ marginTop: -14, marginBottom: 20 }}>
          ※売上・粗利は概算為替レート(¥{kpis.jpyPerUsd}/USD)で換算した概算値です。実際の入金額とは差異が生じます。
        </p>
      )}

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 10 }}>販売推移</h2>
        <TrendChart trend={trend} showAmount={canSeeFinancials} />
      </section>

      <section>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 10 }}>要対応(60日以上未販売)</h2>
        {attention.length === 0 ? (
          <p className="subnote">現在、60日以上未販売のまま出品中の商品はありません。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--line-strong)' }}>
                  <th style={{ padding: '6px 10px' }}>タイトル</th>
                  <th style={{ padding: '6px 10px' }}>SKU</th>
                  <th style={{ padding: '6px 10px' }}>経過日数</th>
                  <th style={{ padding: '6px 10px' }}>価格</th>
                  <th style={{ padding: '6px 10px' }} />
                </tr>
              </thead>
              <tbody>
                {attention.map((item) => (
                  <tr key={item.listingId} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '6px 10px', maxWidth: 320 }}>{item.title ?? '(タイトル未取得)'}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{item.sku}</td>
                    <td style={{ padding: '6px 10px' }}>{item.daysSincePublished ?? '-'}日</td>
                    <td style={{ padding: '6px 10px' }}>
                      {item.price !== null ? `${item.currency ?? ''} ${item.price}` : '-'}
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <Link href="/listings" className="btn" style={{ fontSize: '.75rem', padding: '2px 8px' }}>
                        一覧で見る
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--line-strong)',
        borderRadius: 8,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontSize: '.74rem', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{value}</div>
      {note && <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>{note}</div>}
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
