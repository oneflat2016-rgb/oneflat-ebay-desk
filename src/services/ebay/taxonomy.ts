import type { EbayCategorySuggestion } from '@/types/ebay';

/**
 * TODO(§37-38): 実装対象。eBay Taxonomy API。
 * - getDefaultCategoryTreeId(marketplaceId)
 * - getCategorySuggestions(categoryTreeId, q)
 * GET /api/ebay/categories/suggest?q= のバックエンド実装本体。
 * 候補は最大5件、eBayが返す関連性順をそのまま使用する(§37)。
 * !!! カテゴリーをアプリへハードコードしないこと(§117-2) !!!
 */
export async function suggestCategories(_params: {
  marketplaceId: string;
  query: string;
}): Promise<EbayCategorySuggestion[]> {
  throw new Error('suggestCategories is not implemented yet (§37-38)');
}
