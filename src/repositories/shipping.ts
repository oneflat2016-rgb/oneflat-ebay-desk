import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * §21(最新実装指示書, Phase5): 配送提案(Shipping Recommendation Engine)のデータアクセス層。
 * §21-5の方針どおり、Claudeに送料そのものを推測させず、ここで取得する実データ
 * (管理者登録の料金表 + 自社の過去発送実績)を根拠に候補を計算する。
 * §29: 閲覧専用の社内データのため、salesHistory.ts / listSalesHistory と同様に
 * service_role(admin client)を使用する。
 */

export interface ShippingRateRule {
  id: string;
  carrier: string;
  serviceName: string;
  destinationCountry: string;
  minWeightG: number;
  maxWeightG: number;
  baseCostJpy: number;
  costPerKgJpy: number;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  trackingAvailable: boolean;
  insuranceAvailable: boolean;
}

/**
 * §21-3優先順位2番目「管理者が登録した最新料金表」を取得する。
 * destinationCountryに一致する行を優先し、'ALL'(全配送先共通の目安)も候補に含める。
 */
export async function getShippingRateRules(
  organizationId: string,
  destinationCountry: string,
): Promise<ShippingRateRule[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('shipping_rate_rules')
    .select('*')
    .eq('organization_id', organizationId)
    .in('destination_country', [destinationCountry, 'ALL']);
  if (error) throw error;

  return (data ?? []).map((row): ShippingRateRule => ({
    id: row.id as string,
    carrier: row.carrier as string,
    serviceName: row.service_name as string,
    destinationCountry: row.destination_country as string,
    minWeightG: Number(row.min_weight_g),
    maxWeightG: Number(row.max_weight_g),
    baseCostJpy: Number(row.base_cost_jpy),
    costPerKgJpy: Number(row.cost_per_kg_jpy),
    deliveryMinDays: Number(row.delivery_min_days),
    deliveryMaxDays: Number(row.delivery_max_days),
    trackingAvailable: Boolean(row.tracking_available),
    insuranceAvailable: Boolean(row.insurance_available),
  }));
}

export interface ShippingHistoryStat {
  carrier: string;
  serviceName: string;
  usageCount: number;
  averageActualCostJpy: number | null;
}

/**
 * §21-4/§21-23: 過去のONEFLAT発送実績(shipping_actuals)から、似たカテゴリーの商品で
 * どの配送方法がどれくらい使われたかを集計する。既存のshipping_actualsはorder_id単位でしか
 * carrier/serviceを記録していないため、order_items→products/listing_draftsのcategory_nameで
 * 絞り込む(§21-15と同じ既知の制限: 梱包後実測値ではなく商品情報からの近似)。
 * eBay Sandboxではshipping_actualsへの入力実績が無いため、現状は常に空配列を返す想定。
 */
export async function findShippingHistoryStats(categoryName: string | null): Promise<ShippingHistoryStat[]> {
  if (!categoryName) return [];
  const supabase = getSupabaseAdminClient();

  const { data: draftRows, error: draftError } = await supabase
    .from('listing_drafts')
    .select('product_id')
    .ilike('category_name', `%${categoryName}%`)
    .limit(200);
  if (draftError) throw draftError;
  const productIds = Array.from(new Set((draftRows ?? []).map((d) => d.product_id as string).filter(Boolean)));
  if (productIds.length === 0) return [];

  const { data: itemRows, error: itemError } = await supabase
    .from('order_items')
    .select('order_id')
    .in('product_id', productIds)
    .limit(500);
  if (itemError) throw itemError;
  const orderIds = Array.from(new Set((itemRows ?? []).map((i) => i.order_id as string).filter(Boolean)));
  if (orderIds.length === 0) return [];

  const { data: actualRows, error: actualError } = await supabase
    .from('shipping_actuals')
    .select('carrier, service, actual_shipping_cost')
    .in('order_id', orderIds);
  if (actualError) throw actualError;

  const statsByKey = new Map<string, { carrier: string; serviceName: string; count: number; costSum: number; costCount: number }>();
  for (const row of actualRows ?? []) {
    const carrier = (row.carrier as string | null) ?? '(不明)';
    const serviceName = (row.service as string | null) ?? '(不明)';
    const key = `${carrier}__${serviceName}`;
    const entry = statsByKey.get(key) ?? { carrier, serviceName, count: 0, costSum: 0, costCount: 0 };
    entry.count += 1;
    const cost = row.actual_shipping_cost === null || row.actual_shipping_cost === undefined ? null : Number(row.actual_shipping_cost);
    if (cost !== null) {
      entry.costSum += cost;
      entry.costCount += 1;
    }
    statsByKey.set(key, entry);
  }

  return Array.from(statsByKey.values()).map((e) => ({
    carrier: e.carrier,
    serviceName: e.serviceName,
    usageCount: e.count,
    averageActualCostJpy: e.costCount > 0 ? e.costSum / e.costCount : null,
  }));
}
