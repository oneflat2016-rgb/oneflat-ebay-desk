import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * §33(Phase6実装仕様, 2026-10-08): 値下げ履歴。
 *
 * 価格改定機能(§110 step12, src/app/(app)/listings/priceActions.ts)が
 * 価格を変更するたびに1行追加する、追記専用の履歴テーブル
 * (listing_price_history, supabase/price_history_setup.sql)。
 *
 * 改善提案(§35)の拡張ポイントで想定されていた「直近30日値下げなし」
 * ルールの判定にも、この履歴を使う(getLastPriceDropMap)。
 */

export interface PriceHistoryEntry {
  id: string;
  oldPrice: number;
  newPrice: number;
  currency: string;
  createdAt: string;
}

export async function recordPriceChange(
  listingId: string,
  oldPrice: number,
  newPrice: number,
  currency: string,
  changedBy: string | null,
): Promise<void> {
  // 値自体が変わっていない更新(同じ価格で「更新」を押した場合)は履歴に残さない。
  if (oldPrice === newPrice) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('listing_price_history').insert({
    listing_id: listingId,
    old_price: oldPrice,
    new_price: newPrice,
    currency,
    changed_by: changedBy,
  });
  // 履歴記録の失敗で価格改定自体(eBayへの反映)を失敗扱いにはしない。
  // best-effortとしてログだけ残す。
  if (error) {
    console.error('[recordPriceChange] failed to record price history', error.message);
  }
}

export async function getPriceHistoryForListing(listingId: string): Promise<PriceHistoryEntry[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listing_price_history')
    .select('id, old_price, new_price, currency, created_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    oldPrice: Number(row.old_price),
    newPrice: Number(row.new_price),
    currency: row.currency as string,
    createdAt: row.created_at as string,
  }));
}

export interface LastPriceDrop {
  createdAt: string;
  oldPrice: number;
  newPrice: number;
}

/**
 * 複数Listingについて、直近の「値下げ」(new_price < old_price)の発生日時を
 * まとめて取得する(値上げは対象外。§35の「値下げなし」判定のため)。
 * 1回のクエリで全件取得し、JS側でlisting_idごとに最新1件だけ残す
 * (listing数が多くなった場合は要見直し)。
 */
export async function getLastPriceDropMap(listingIds: string[]): Promise<Map<string, LastPriceDrop>> {
  const result = new Map<string, LastPriceDrop>();
  if (listingIds.length === 0) return result;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listing_price_history')
    .select('listing_id, old_price, new_price, created_at')
    .in('listing_id', listingIds)
    .order('created_at', { ascending: false });
  if (error) throw error;

  for (const row of data ?? []) {
    const listingId = row.listing_id as string;
    if (result.has(listingId)) continue; // 既に新しい方を採用済み(created_at降順のため)
    const oldPrice = Number(row.old_price);
    const newPrice = Number(row.new_price);
    if (newPrice >= oldPrice) continue; // 値上げは対象外
    result.set(listingId, { createdAt: row.created_at as string, oldPrice, newPrice });
  }

  return result;
}
