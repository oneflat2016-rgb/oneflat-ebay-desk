#!/bin/bash
set -euo pipefail
cd "$HOME/oneflat-ebay-desk"

mkdir -p "src/repositories" "src/app/(app)/dashboard"

cat > "src/repositories/dashboard.ts" << 'ONEFLAT_EOF_75822'
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSellThroughOverview } from '@/repositories/analytics';

/**
 * §49(Phase6実装仕様, 2026-09-29): ダッシュボードのKPI集計。
 *
 * 為替について: order_items.sale_price/currencyは基本USD、products.cost_priceは
 * 基本JPYで、販売時点の実レートを保存する仕組みが無い(§16-17の利益シミュレーションも
 * 画面入力の概算レートを使う設計)。そのため本ダッシュボードも「概算レート」を使った
 * 概算粗利として扱い、画面側に「概算」であることを明示する。将来的に実レートを
 * finance_transactionsやordersに保存するようになれば、この関数を差し替える。
 *
 * Role別の出し分け(ADMINのみ原価/粗利を見せる)は、この関数では行わず、
 * 呼び出し元のServer Action/ページ側でRoleに応じてフィールドを間引く
 * (getCurrentProfileと同じ使い方をする既存パターンに合わせる)。
 */

export const DEFAULT_JPY_PER_USD = 150;

export type DashboardPeriodKey = 'today' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | '90d' | 'custom';

export interface DashboardPeriod {
  key: DashboardPeriodKey;
  /** inclusive */
  fromIso: string;
  /** exclusive */
  toIso: string;
  label: string;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function resolveDashboardPeriod(
  key: DashboardPeriodKey,
  custom?: { fromIso: string; toIso: string },
): DashboardPeriod {
  const now = new Date();

  if (key === 'custom' && custom) {
    return { key, fromIso: custom.fromIso, toIso: custom.toIso, label: 'カスタム期間' };
  }

  switch (key) {
    case 'today': {
      const from = startOfDay(now);
      const to = addDays(from, 1);
      return { key, fromIso: from.toISOString(), toIso: to.toISOString(), label: '今日' };
    }
    case '7d': {
      const to = addDays(startOfDay(now), 1);
      const from = addDays(to, -7);
      return { key, fromIso: from.toISOString(), toIso: to.toISOString(), label: '直近7日間' };
    }
    case '30d': {
      const to = addDays(startOfDay(now), 1);
      const from = addDays(to, -30);
      return { key, fromIso: from.toISOString(), toIso: to.toISOString(), label: '直近30日間' };
    }
    case '90d': {
      const to = addDays(startOfDay(now), 1);
      const from = addDays(to, -90);
      return { key, fromIso: from.toISOString(), toIso: to.toISOString(), label: '直近90日間' };
    }
    case 'lastMonth': {
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        key,
        fromIso: firstOfLastMonth.toISOString(),
        toIso: firstOfThisMonth.toISOString(),
        label: '先月',
      };
    }
    case 'thisMonth':
    default: {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { key: 'thisMonth', fromIso: from.toISOString(), toIso: to.toISOString(), label: '今月' };
    }
  }
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(0, Math.round((to - from) / (1000 * 60 * 60 * 24)));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** USD以外はいったんJPYとして扱う(現状USD/JPY以外の通貨の実績が無いため)。 */
function toJpy(amount: number, currency: string | null, jpyPerUsd: number): number {
  if (currency && currency.toUpperCase() === 'JPY') return amount;
  return amount * jpyPerUsd;
}

export interface DashboardKpis {
  period: DashboardPeriod;
  jpyPerUsd: number;
  /** 期間内の売上合計(概算円換算) */
  periodSalesJpy: number;
  /** 期間内の売上のうち、原価データが無い(=粗利計算から除外された)件数 */
  costUnknownCount: number;
  /** 期間内の粗利概算(円)。原価データが1件も無ければnull */
  periodGrossProfitJpy: number | null;
  /** 期間内の販売件数(order_items単位) */
  periodSoldCount: number;
  /** 現在出品中(ACTIVE)の件数 */
  activeListingCount: number;
  /** 期間内に売れた商品の平均販売日数(出品〜販売) */
  averageDaysToSellInPeriod: number | null;
  /** 30/60/90日以上未販売のまま出品中の件数(期間に関係ない現在値) */
  unsoldOver30Days: number;
  unsoldOver60Days: number;
  unsoldOver90Days: number;
}

export interface DashboardTrendPoint {
  date: string; // YYYY-MM-DD
  salesJpy: number;
  count: number;
}

export interface DashboardAttentionItem {
  listingId: string;
  sku: string;
  title: string | null;
  daysSincePublished: number | null;
  price: number | null;
  currency: string | null;
}

export interface DashboardData {
  kpis: DashboardKpis;
  trend: DashboardTrendPoint[];
  attention: DashboardAttentionItem[];
}

export async function getDashboardData(
  period: DashboardPeriod,
  jpyPerUsd = DEFAULT_JPY_PER_USD,
): Promise<DashboardData> {
  const supabase = getSupabaseAdminClient();

  // 1) 期間内の注文(ordersはfinance_transactionsとebay_order_idで突き合わせるため必要)
  const { data: orderRows, error: orderError } = await supabase
    .from('orders')
    .select('id, ebay_order_id, creation_date')
    .gte('creation_date', period.fromIso)
    .lt('creation_date', period.toIso);
  if (orderError) throw orderError;

  const orders = orderRows ?? [];
  const orderIdToDate = new Map<string, string>();
  const ebayOrderIds: string[] = [];
  for (const o of orders) {
    if (o.creation_date) orderIdToDate.set(o.id as string, o.creation_date as string);
    if (o.ebay_order_id) ebayOrderIds.push(o.ebay_order_id as string);
  }

  // 2) 期間内注文の明細(売上・原価計算のベース)
  let itemRows: Array<{
    order_id: string;
    product_id: string | null;
    quantity: number | null;
    sale_price: number | null;
    currency: string | null;
  }> = [];
  if (orders.length > 0) {
    const orderIds = orders.map((o) => o.id as string);
    const { data, error } = await supabase
      .from('order_items')
      .select('order_id, product_id, quantity, sale_price, currency')
      .in('order_id', orderIds);
    if (error) throw error;
    itemRows = data ?? [];
  }

  // 3) 関連商品の原価(cost_price/cost_currency)
  const productIds = Array.from(
    new Set(itemRows.map((r) => r.product_id).filter((id): id is string => Boolean(id))),
  );
  const costByProductId = new Map<string, { cost: number; currency: string | null }>();
  if (productIds.length > 0) {
    const { data: productRows, error: productError } = await supabase
      .from('products')
      .select('id, cost_price, cost_currency')
      .in('id', productIds);
    if (productError) throw productError;
    for (const p of productRows ?? []) {
      if (p.cost_price !== null && p.cost_price !== undefined) {
        costByProductId.set(p.id as string, {
          cost: Number(p.cost_price),
          currency: (p.cost_currency as string | null) ?? 'JPY',
        });
      }
    }
  }

  // 4) 期間内の手数料(finance_transactions)
  const feesByOrderEbayId = new Map<string, number>();
  if (ebayOrderIds.length > 0) {
    const { data: feeRows, error: feeError } = await supabase
      .from('finance_transactions')
      .select('ebay_order_id, amount, currency')
      .eq('transaction_type', 'MARKETPLACE_FEE')
      .in('ebay_order_id', ebayOrderIds);
    if (feeError) throw feeError;
    for (const fee of feeRows ?? []) {
      const orderId = fee.ebay_order_id as string | null;
      if (!orderId) continue;
      const amountJpy = toJpy(fee.amount === null ? 0 : Number(fee.amount), (fee.currency as string | null) ?? 'USD', jpyPerUsd);
      feesByOrderEbayId.set(orderId, (feesByOrderEbayId.get(orderId) ?? 0) + amountJpy);
    }
  }

  // 5) 売上/粗利/トレンドの集計
  let periodSalesJpy = 0;
  let periodSoldCount = 0;
  let costUnknownCount = 0;
  let totalCostJpy = 0;
  let hasAnyCost = false;
  const trendByDate = new Map<string, { salesJpy: number; count: number }>();

  const orderIdByOrder = new Map(orders.map((o) => [o.id as string, o]));

  for (const item of itemRows) {
    const quantity = item.quantity ?? 1;
    const saleAmountJpy = toJpy(
      item.sale_price === null ? 0 : Number(item.sale_price),
      item.currency,
      jpyPerUsd,
    );
    periodSalesJpy += saleAmountJpy;
    periodSoldCount += 1;

    const cost = item.product_id ? costByProductId.get(item.product_id) : undefined;
    if (cost) {
      hasAnyCost = true;
      totalCostJpy += toJpy(cost.cost * quantity, cost.currency, jpyPerUsd);
    } else {
      costUnknownCount += 1;
    }

    const order = orderIdByOrder.get(item.order_id);
    const creationDate = order?.creation_date as string | undefined;
    if (creationDate) {
      const dateKey = creationDate.slice(0, 10);
      const bucket = trendByDate.get(dateKey) ?? { salesJpy: 0, count: 0 };
      bucket.salesJpy += saleAmountJpy;
      bucket.count += 1;
      trendByDate.set(dateKey, bucket);
    }
  }

  let totalFeesJpy = 0;
  for (const o of orders) {
    const ebayId = o.ebay_order_id as string | null;
    if (ebayId && feesByOrderEbayId.has(ebayId)) {
      totalFeesJpy += feesByOrderEbayId.get(ebayId)!;
    }
  }

  const periodGrossProfitJpy = hasAnyCost ? periodSalesJpy - totalCostJpy - totalFeesJpy : null;

  const trend: DashboardTrendPoint[] = Array.from(trendByDate.entries())
    .map(([date, v]) => ({ date, salesJpy: v.salesJpy, count: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 6) 期間内に売れたlistingsの平均販売日数(listings.published_at/sold_at基準)
  const { data: soldListingRows, error: soldListingError } = await supabase
    .from('listings')
    .select('published_at, sold_at')
    .not('published_at', 'is', null)
    .gte('sold_at', period.fromIso)
    .lt('sold_at', period.toIso);
  if (soldListingError) throw soldListingError;
  const daysToSellInPeriod = (soldListingRows ?? [])
    .filter((r) => r.published_at && r.sold_at)
    .map((r) => daysBetween(r.published_at as string, r.sold_at as string));

  // 7) 現在出品中(ACTIVE)の件数、および未販売バケット(§32のロジックを再利用)
  const { count: activeListingCount, error: activeCountError } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ACTIVE');
  if (activeCountError) throw activeCountError;

  const sellThrough = await getSellThroughOverview();

  // 8) 「要対応」: 60日以上未販売のまま出品中の商品(上位10件)
  const attention = await getAttentionList(supabase);

  const kpis: DashboardKpis = {
    period,
    jpyPerUsd,
    periodSalesJpy,
    costUnknownCount,
    periodGrossProfitJpy,
    periodSoldCount,
    activeListingCount: activeListingCount ?? 0,
    averageDaysToSellInPeriod: average(daysToSellInPeriod),
    unsoldOver30Days: sellThrough.activeOver30Days,
    unsoldOver60Days: sellThrough.activeOver60Days,
    unsoldOver90Days: sellThrough.activeOver90Days,
  };

  return { kpis, trend, attention };
}

async function getAttentionList(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
): Promise<DashboardAttentionItem[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('id, sku, published_at, listing_draft:listing_drafts(title, price, currency)')
    .eq('status', 'ACTIVE')
    .not('published_at', 'is', null);
  if (error) throw error;

  const now = new Date().toISOString();
  const withDays = (data ?? []).map((row) => {
    const draft = firstOf(row.listing_draft) as
      | { title?: string | null; price?: number | null; currency?: string | null }
      | undefined;
    const publishedAt = row.published_at as string | null;
    return {
      listingId: row.id as string,
      sku: row.sku as string,
      title: draft?.title ?? null,
      daysSincePublished: publishedAt ? daysBetween(publishedAt, now) : null,
      price: draft?.price ?? null,
      currency: draft?.currency ?? null,
    };
  });

  return withDays
    .filter((r) => (r.daysSincePublished ?? 0) >= 60)
    .sort((a, b) => (b.daysSincePublished ?? 0) - (a.daysSincePublished ?? 0))
    .slice(0, 10);
}

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}
ONEFLAT_EOF_75822
echo "[OK] wrote src/repositories/dashboard.ts"

cat > "src/app/(app)/dashboard/actions.ts" << 'ONEFLAT_EOF_7490'
'use server';

import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import {
  DEFAULT_JPY_PER_USD,
  getDashboardData,
  resolveDashboardPeriod,
  type DashboardData,
  type DashboardPeriodKey,
} from '@/repositories/dashboard';

/**
 * §49(Phase6実装仕様, 2026-09-29): ダッシュボードの期間切り替え用Server Action。
 * ページ初回表示は「今月」をServer Componentで直接取得し、期間セレクタ操作時は
 * この関数をクライアントから呼び出してデータを取り直す。
 *
 * Role別出し分け(ADMINのみ原価・粗利を見る)はここで行う。cost_price/粗利は
 * 「開発に関わるデータ」ではなく業務データだが、経営情報のため役割の低いユーザーには
 * 見せない、という既存方針(§8 hasRole)に合わせている。
 */
export interface DashboardResult {
  data: DashboardData;
  canSeeFinancials: boolean;
}

export async function getDashboard(
  periodKey: DashboardPeriodKey,
  custom?: { fromIso: string; toIso: string },
): Promise<DashboardResult | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const period = resolveDashboardPeriod(periodKey, custom);
  const data = await getDashboardData(period, DEFAULT_JPY_PER_USD);
  const canSeeFinancials = profile.role === 'ADMIN';

  if (!canSeeFinancials) {
    data.kpis = {
      ...data.kpis,
      periodSalesJpy: 0,
      periodGrossProfitJpy: null,
      costUnknownCount: 0,
    };
    data.trend = data.trend.map((t) => ({ ...t, salesJpy: 0 }));
  }

  return { data, canSeeFinancials };
}
ONEFLAT_EOF_7490
echo "[OK] wrote src/app/(app)/dashboard/actions.ts"

cat > "src/app/(app)/dashboard/DashboardClient.tsx" << 'ONEFLAT_EOF_56142'
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
ONEFLAT_EOF_56142
echo "[OK] wrote src/app/(app)/dashboard/DashboardClient.tsx"

cat > "src/app/(app)/dashboard/page.tsx" << 'ONEFLAT_EOF_78786'
import Link from 'next/link';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { DEFAULT_JPY_PER_USD, getDashboardData, resolveDashboardPeriod } from '@/repositories/dashboard';
import { DashboardClient } from './DashboardClient';

/**
 * §49(Phase6実装仕様, 2026-09-29): ダッシュボードの本実装(第一段階)。
 * 優先度Aの主要KPI(今月の売上・粗利・販売件数・出品中件数・平均販売日数・
 * 30日以上未販売件数)、期間切り替え(デフォルト=今月)、販売推移グラフ、
 * 「要対応」セクション、Role別出し分け(ADMINのみ原価・粗利を表示)を実装する。
 *
 * §30(ホーム画面の導線: 撮影して出品/型番登録/バーコード登録/複製)は別セクションのため、
 * このKPIセクションの下に簡易な導線を残す形にする。
 */
export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const period = resolveDashboardPeriod('thisMonth');
  const data = await getDashboardData(period, DEFAULT_JPY_PER_USD);
  const canSeeFinancials = profile?.role === 'ADMIN';

  if (!canSeeFinancials) {
    data.kpis = { ...data.kpis, periodSalesJpy: 0, periodGrossProfitJpy: null, costUnknownCount: 0 };
    data.trend = data.trend.map((t) => ({ ...t, salesJpy: 0 }));
  }

  return (
    <main>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>
          ONEFLAT EBAY LISTING DESK
        </div>
        <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2.1rem)' }}>ダッシュボード</h1>
      </header>

      <DashboardClient initial={{ data, canSeeFinancials }} initialPeriod="thisMonth" />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 32, paddingTop: 18, borderTop: '2px solid var(--line-strong)' }}>
        <Link href="/listings/new" className="btn primary">
          📷 商品を撮影して出品(暫定: 従来フォームへ)
        </Link>
        <Link href="/listings" className="btn">
          出品済みListing一覧を見る
        </Link>
        <Link href="/sales" className="btn">
          販売履歴を見る
        </Link>
      </div>
    </main>
  );
}
ONEFLAT_EOF_78786
echo "[OK] wrote src/app/(app)/dashboard/page.tsx"

echo "Done. Now run: npx tsc --noEmit -p . && npm run build"
