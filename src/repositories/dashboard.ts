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
