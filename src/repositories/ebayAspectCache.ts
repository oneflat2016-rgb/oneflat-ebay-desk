import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { EbayAspectDefinition } from '@/types/ebay';

/**
 * §19-20, §39-42(§110 step7): ebay_aspect_cache テーブル(Taxonomy APIの
 * get_item_aspects_for_category結果をキャッシュし、同じカテゴリーへの問い合わせで
 * eBayを何度も叩かないようにする)。あくまでキャッシュなので、書き込み失敗は
 * APIレスポンス自体をブロックしない(ebayCategoryCache.tsと同じ方針)。
 */
export async function upsertAspectCache(
  marketplaceId: string,
  categoryId: string,
  aspects: EbayAspectDefinition[],
): Promise<void> {
  if (aspects.length === 0) return;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('ebay_aspect_cache').upsert(
    aspects.map((a) => ({
      marketplace_id: marketplaceId,
      category_id: categoryId,
      aspect_name: a.aspectName,
      required: a.required,
      usage: a.usage,
      data_type: a.dataType,
      cardinality: a.cardinality,
      allowed_values_json: a.allowedValues,
      expected_required_by_date: a.expectedRequiredByDate,
      raw_json: a,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'marketplace_id,category_id,aspect_name' },
  );
  if (error) {
    console.error('[ebayAspectCache] upsert failed', error.message);
  }
}
