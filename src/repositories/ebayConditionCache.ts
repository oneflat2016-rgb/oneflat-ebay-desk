import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { EbayConditionPolicy } from '@/types/ebay';

/**
 * §19-20, §43(§110 step8): ebay_condition_cache テーブル(Metadata APIの
 * get_item_condition_policies結果をキャッシュし、同じカテゴリーへの問い合わせで
 * eBayを何度も叩かないようにする)。あくまでキャッシュなので、書き込み失敗は
 * APIレスポンス自体をブロックしない(ebayCategoryCache.ts / ebayAspectCache.tsと同じ方針)。
 */
export async function upsertConditionPolicyCache(
  marketplaceId: string,
  categoryId: string,
  conditions: EbayConditionPolicy[],
): Promise<void> {
  if (conditions.length === 0) return;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('ebay_condition_cache').upsert(
    conditions.map((c) => ({
      marketplace_id: marketplaceId,
      category_id: categoryId,
      condition_id: c.conditionId,
      condition_description: c.conditionDescription,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'marketplace_id,category_id,condition_id' },
  );
  if (error) {
    console.error('[ebayConditionCache] upsert failed', error.message);
  }
}
