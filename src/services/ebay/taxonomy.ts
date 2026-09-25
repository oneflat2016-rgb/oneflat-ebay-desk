import type { EbayCategory, EbayCategorySuggestion } from '@/types/ebay';
import { getEbayApiBaseUrl, getEbayAppAccessToken } from './auth';
import { upsertCategoryCache } from '@/repositories/ebayCategoryCache';

/**
 * §37-38(§110 step6): eBay Taxonomy API。
 * GET /api/ebay/categories/suggest?q= のバックエンド実装本体。
 * 候補は最大5件、eBayが返す関連性順をそのまま使用する(§37)。
 * !!! カテゴリーをアプリへハードコードしないこと(§117-2) !!! — 値はすべてeBayのレスポンスに由来する。
 */

const MAX_SUGGESTIONS = 5;

// マーケットプレイスごとのdefault category tree idは長期間変わらないため、モジュール内でキャッシュする。
const categoryTreeIdCache = new Map<string, string>();

async function ebayFetch(path: string, marketplaceId: string): Promise<Response> {
  const token = await getEbayAppAccessToken();
  return fetch(`${getEbayApiBaseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
      'Content-Type': 'application/json',
    },
  });
}

export async function getDefaultCategoryTreeId(marketplaceId: string): Promise<string> {
  const cached = categoryTreeIdCache.get(marketplaceId);
  if (cached) return cached;

  // 注意: 他のTaxonomy APIエンドポイントと違い、get_default_category_tree_idは
  // "category_tree/"を挟まず直下にある(/commerce/taxonomy/v1/get_default_category_tree_id)。
  // ここに"category_tree/"を付けると、eBay側が category_tree_id="get_default_category_tree_id"
  // という不正なパスパラメータとして解釈し404を返す。
  const res = await ebayFetch(
    `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${encodeURIComponent(marketplaceId)}`,
    marketplaceId,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay Taxonomy API (get_default_category_tree_id) failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { categoryTreeId: string };
  categoryTreeIdCache.set(marketplaceId, json.categoryTreeId);
  return json.categoryTreeId;
}

interface EbayCategorySuggestionResponseItem {
  category: { categoryId: string; categoryName: string };
  categoryTreeNodeAncestors?: { categoryId: string }[];
  categoryTreeNodeLevel?: number;
  relevancy?: string;
}

export async function suggestCategories(params: {
  marketplaceId: string;
  query: string;
}): Promise<EbayCategorySuggestion[]> {
  const { marketplaceId, query } = params;
  if (!query.trim()) return [];

  const categoryTreeId = await getDefaultCategoryTreeId(marketplaceId);

  const res = await ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(
      categoryTreeId,
    )}/get_category_suggestions?q=${encodeURIComponent(query)}`,
    marketplaceId,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay Taxonomy API (get_category_suggestions) failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { categorySuggestions?: EbayCategorySuggestionResponseItem[] };
  const items = (json.categorySuggestions ?? []).slice(0, MAX_SUGGESTIONS);

  const suggestions: EbayCategorySuggestion[] = items.map((item, index) => {
    const ancestors = item.categoryTreeNodeAncestors ?? [];
    const lastAncestor = ancestors.length > 0 ? ancestors[ancestors.length - 1] : undefined;
    const parentCategoryId = lastAncestor?.categoryId ?? null;
    const category: EbayCategory = {
      categoryTreeId,
      categoryId: item.category.categoryId,
      categoryName: item.category.categoryName,
      parentCategoryId,
      leaf: true, // Taxonomy APIのcategory suggestionsは常にleafカテゴリーのみを返す
    };
    return {
      category,
      // eBayは"relevancy"を返さない場合があるため、返却順(=eBay側の関連性順, §37)を保持する
      relevancy: item.relevancy ? Number(item.relevancy) : items.length - index,
    };
  });

  // キャッシュへの書き込みは失敗してもレスポンスをブロックしない(ベストエフォート)
  upsertCategoryCache(
    marketplaceId,
    categoryTreeId,
    suggestions.map((s) => s.category),
  ).catch(() => undefined);

  return suggestions;
}
