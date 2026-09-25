import type { EbayAspectDefinition, EbayCategory, EbayCategorySuggestion } from '@/types/ebay';
import { getEbayApiBaseUrl, getEbayAppAccessToken } from './auth';
import { upsertCategoryCache } from '@/repositories/ebayCategoryCache';
import { upsertAspectCache } from '@/repositories/ebayAspectCache';

/**
 * §37-42(§110 step6-7): eBay Taxonomy API。
 * GET /api/ebay/categories/suggest?q= (step6, カテゴリー候補) と
 * GET /api/ebay/aspects?categoryTreeId=&categoryId= (step7, Item Specifics定義) の
 * バックエンド実装本体。
 * 候補は最大5件、eBayが返す関連性順をそのまま使用する(§37)。
 * !!! カテゴリー/Aspectをアプリへハードコードしないこと(§117-2) !!! — 値はすべてeBayのレスポンスに由来する。
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

/**
 * §39-42(§110 step7): eBay Taxonomy APIの get_item_aspects_for_category。
 * 選択済みカテゴリー(categoryTreeId/categoryId)に対して、eBayが実際に要求/推奨する
 * Item Specifics(Aspect)の一覧を取得する。GENRE_FIELDSのような固定配列は使わない(§40)。
 */
interface EbayAspectConstraintResponse {
  aspectDataType?: string;
  itemToAspectCardinality?: string;
  aspectMode?: string;
  aspectRequired?: boolean;
  aspectUsage?: string;
  expectedRequiredByDate?: string | null;
}

interface EbayAspectResponseItem {
  localizedAspectName: string;
  aspectConstraint?: EbayAspectConstraintResponse;
  aspectValues?: { localizedValue: string }[];
}

function toAspectUsage(raw: string | undefined, required: boolean): EbayAspectDefinition['usage'] {
  if (raw === 'REQUIRED' || raw === 'RECOMMENDED' || raw === 'OPTIONAL') return raw;
  return required ? 'REQUIRED' : 'OPTIONAL';
}

function toAspectDataType(raw: string | undefined): EbayAspectDefinition['dataType'] {
  if (raw === 'STRING' || raw === 'NUMBER' || raw === 'DATE' || raw === 'STRING_ARRAY') return raw;
  return 'STRING';
}

function toAspectCardinality(raw: string | undefined): EbayAspectDefinition['cardinality'] {
  return raw === 'MULTI' ? 'MULTI' : 'SINGLE';
}

function toAspectMode(raw: string | undefined): EbayAspectDefinition['aspectMode'] {
  if (raw === 'FREE_TEXT' || raw === 'SELECTION_ONLY') return raw;
  return null;
}

export async function getItemAspectsForCategory(params: {
  marketplaceId: string;
  categoryTreeId: string;
  categoryId: string;
}): Promise<EbayAspectDefinition[]> {
  const { marketplaceId, categoryTreeId, categoryId } = params;

  const res = await ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(
      categoryTreeId,
    )}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`,
    marketplaceId,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay Taxonomy API (get_item_aspects_for_category) failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { aspects?: EbayAspectResponseItem[] };
  const items = json.aspects ?? [];

  const aspects: EbayAspectDefinition[] = items.map((item) => {
    const constraint = item.aspectConstraint ?? {};
    const required = constraint.aspectRequired ?? false;
    const values = (item.aspectValues ?? []).map((v) => v.localizedValue).filter(Boolean);
    return {
      aspectName: item.localizedAspectName,
      usage: toAspectUsage(constraint.aspectUsage, required),
      required,
      dataType: toAspectDataType(constraint.aspectDataType),
      cardinality: toAspectCardinality(constraint.itemToAspectCardinality),
      aspectMode: toAspectMode(constraint.aspectMode),
      allowedValues: values.length > 0 ? values : null,
      expectedRequiredByDate: constraint.expectedRequiredByDate ?? null,
    };
  });

  // キャッシュへの書き込みは失敗してもレスポンスをブロックしない(ベストエフォート、§19-20)
  upsertAspectCache(marketplaceId, categoryId, aspects).catch(() => undefined);

  return aspects;
}
