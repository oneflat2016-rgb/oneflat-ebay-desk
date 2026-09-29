#!/bin/bash
set -euo pipefail
cd "$HOME/oneflat-ebay-desk"

mkdir -p "src/repositories"

cat > "src/repositories/analytics.ts" << 'ONEFLAT_EOF_ANALYTICS'
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * §32(Phase6実装仕様, 2026-09-29): 販売速度分析。
 *
 * 仕様書の方針どおり、「販売速度」は最も基本的な指標である
 * 「出品してから売れるまでの日数」(sold_at - published_at)を基準にする。
 * 必要なデータ(published_at / sold_at / category_id)はいずれも既存の
 * listingsテーブルに既に揃っているため、Phase6-2の時点では新規テーブルを
 * 作らず、このリポジトリの集計関数だけを追加する。
 *
 * 「売れなかった商品」も分析から抜けないよう、販売済み(sold_at有り)の
 * 集計だけでなく、未販売(ACTIVEのまま)の経過日数バケット集計も用意する
 * (仕様書「非販売商品も重要」の節)。
 *
 * 統計は平均値だけだと極端な商品に引っ張られるため、中央値も併せて返す。
 */

interface SoldRow {
  category_id: string | null;
  published_at: string | null;
  sold_at: string | null;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(0, Math.round((to - from) / (1000 * 60 * 60 * 24)));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface SellThroughOverview {
  soldCount: number;
  averageDaysToSell: number | null;
  medianDaysToSell: number | null;
  soldWithin7Days: number;
  soldWithin30Days: number;
  soldWithin60Days: number;
  /** 出品中(ACTIVE)のまま、経過日数がそのバケット以上の商品数(仕様書の「非販売商品も重要」) */
  activeOver30Days: number;
  activeOver60Days: number;
  activeOver90Days: number;
}

export async function getSellThroughOverview(): Promise<SellThroughOverview> {
  const supabase = getSupabaseServerClient();

  const soldPromise = supabase
    .from('listings')
    .select('category_id, published_at, sold_at')
    .not('sold_at', 'is', null)
    .not('published_at', 'is', null);

  const activePromise = supabase
    .from('listings')
    .select('published_at')
    .eq('status', 'ACTIVE')
    .not('published_at', 'is', null);

  const [{ data: soldRows, error: soldError }, { data: activeRows, error: activeError }] = await Promise.all([
    soldPromise,
    activePromise,
  ]);
  if (soldError) throw soldError;
  if (activeError) throw activeError;

  const daysToSell = ((soldRows ?? []) as SoldRow[])
    .filter((r) => r.published_at && r.sold_at)
    .map((r) => daysBetween(r.published_at as string, r.sold_at as string));

  const now = new Date().toISOString();
  const activeDays = (activeRows ?? [])
    .map((r) => (r.published_at ? daysBetween(r.published_at as string, now) : null))
    .filter((d): d is number => d !== null);

  return {
    soldCount: daysToSell.length,
    averageDaysToSell: average(daysToSell),
    medianDaysToSell: median(daysToSell),
    soldWithin7Days: daysToSell.filter((d) => d <= 7).length,
    soldWithin30Days: daysToSell.filter((d) => d <= 30).length,
    soldWithin60Days: daysToSell.filter((d) => d <= 60).length,
    activeOver30Days: activeDays.filter((d) => d >= 30).length,
    activeOver60Days: activeDays.filter((d) => d >= 60).length,
    activeOver90Days: activeDays.filter((d) => d >= 90).length,
  };
}

export interface CategorySellThrough {
  categoryId: string;
  categoryName: string | null;
  soldCount: number;
  averageDaysToSell: number | null;
  medianDaysToSell: number | null;
}

/**
 * カテゴリー名は参照専用キャッシュ(ebay_category_cache)から best-effort で解決する。
 * このキャッシュの主キーはmarketplace_id/category_tree_id/category_idの組だが、
 * listings側はcategory_idしか保持していないため、category_id一致の最初の1件を
 * 採用する(§32はあくまで分析用の参考表示のため、これで十分と判断)。
 */
export async function getSellThroughByCategory(): Promise<CategorySellThrough[]> {
  const supabase = getSupabaseServerClient();
  const { data: soldRows, error } = await supabase
    .from('listings')
    .select('category_id, published_at, sold_at')
    .not('sold_at', 'is', null)
    .not('published_at', 'is', null)
    .not('category_id', 'is', null);
  if (error) throw error;

  const byCategory = new Map<string, number[]>();
  for (const row of (soldRows ?? []) as SoldRow[]) {
    if (!row.category_id || !row.published_at || !row.sold_at) continue;
    const days = daysBetween(row.published_at, row.sold_at);
    const list = byCategory.get(row.category_id) ?? [];
    list.push(days);
    byCategory.set(row.category_id, list);
  }

  const categoryIds = [...byCategory.keys()];
  const nameByCategoryId = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: cacheRows } = await supabase
      .from('ebay_category_cache')
      .select('category_id, category_name')
      .in('category_id', categoryIds);
    for (const row of cacheRows ?? []) {
      if (!nameByCategoryId.has(row.category_id as string)) {
        nameByCategoryId.set(row.category_id as string, row.category_name as string);
      }
    }
  }

  return categoryIds
    .map((categoryId) => {
      const days = byCategory.get(categoryId)!;
      return {
        categoryId,
        categoryName: nameByCategoryId.get(categoryId) ?? null,
        soldCount: days.length,
        averageDaysToSell: average(days),
        medianDaysToSell: median(days),
      };
    })
    .sort((a, b) => b.soldCount - a.soldCount);
}

/** 出品中(ACTIVE)の1件について、出品からの経過日数を計算する(Listing一覧の表示用)。 */
export function daysSincePublished(publishedAt: string | null): number | null {
  if (!publishedAt) return null;
  return daysBetween(publishedAt, new Date().toISOString());
}
ONEFLAT_EOF_ANALYTICS
echo "[OK] wrote src/repositories/analytics.ts"

echo "Done. Now run: npx tsc --noEmit -p . && npm run build"
