import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { EbayCategory } from '@/types/ebay';

/**
 * §37: ebay_category_cache テーブル(Taxonomy APIの結果をキャッシュし、
 * 同じカテゴリーへの問い合わせでeBayを何度も叩かないようにする)。
 * あくまでキャッシュなので、書き込み失敗はAPIレスポンス自体をブロックしない。
 */
export async function upsertCategoryCache(
  marketplaceId: string,
  categoryTreeId: string,
  categories: EbayCategory[],
): Promise<void> {
  if (categories.length === 0) return;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('ebay_category_cache').upsert(
    categories.map((c) => ({
      marketplace_id: marketplaceId,
      category_tree_id: categoryTreeId,
      category_id: c.categoryId,
      category_name: c.categoryName,
      parent_category_id: c.parentCategoryId,
      leaf: c.leaf,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'marketplace_id,category_tree_id,category_id' },
  );
  if (error) {
    console.error('[ebayCategoryCache] upsert failed', error.message);
  }
}
