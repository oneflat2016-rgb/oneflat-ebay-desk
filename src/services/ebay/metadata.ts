import type { EbayConditionPolicy } from '@/types/ebay';
import { getEbayApiBaseUrl, getEbayAppAccessToken } from './auth';
import { upsertConditionPolicyCache } from '@/repositories/ebayConditionCache';

/**
 * §43(§110 step8): eBay Metadata API(Sell APIの/sell/metadata/v1/...)。
 * get_item_condition_policies(categoryId) → カテゴリーごとのCondition一覧。
 * !!! Conditionを固定配列として持たないこと(§117-3) !!!
 * !!! アプリやClaudeが独自にConditionの区分を作らないこと(§117-4) !!!
 *
 * 注意: eBay Item Aspects(動的Item Specifics, §39-42)はTaxonomy APIの
 * get_item_aspects_for_categoryであり、こちらのMetadata APIとは別エンドポイント
 * なのでservices/ebay/taxonomy.ts(getItemAspectsForCategory)に実装済み。
 */

interface EbayConditionValueResponseItem {
  conditionId: string;
  conditionDescription: string;
}

interface EbayItemConditionPolicyResponseItem {
  categoryId: string;
  itemConditionRequired?: boolean;
  // 注意: eBayの実際のレスポンスは"conditionValues"ではなく"itemConditions"というフィールド名で返る
  // (公開ドキュメントの記載と異なる。実際のログで確認済み、2026-09-25)。
  itemConditions?: EbayConditionValueResponseItem[];
}

export async function getConditionPoliciesForCategory(params: {
  marketplaceId: string;
  categoryId: string;
}): Promise<EbayConditionPolicy[]> {
  const { marketplaceId, categoryId } = params;
  const token = await getEbayAppAccessToken();

  const res = await fetch(
    `${getEbayApiBaseUrl()}/sell/metadata/v1/marketplace/${encodeURIComponent(
      marketplaceId,
    )}/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${categoryId}}`)}`,
    {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay Metadata API (get_item_condition_policies) failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { itemConditionPolicies?: EbayItemConditionPolicyResponseItem[] };
  const policies = json.itemConditionPolicies ?? [];
  // §102: categoryIdの型がstring/number両方あり得るため文字列化して比較する(取りこぼし防止)。
  const policy = policies.find((p) => String(p.categoryId) === String(categoryId));
  const conditions: EbayConditionPolicy[] = (policy?.itemConditions ?? []).map((c) => ({
    conditionId: c.conditionId,
    conditionDescription: c.conditionDescription,
  }));

  // キャッシュへの書き込みは失敗してもレスポンスをブロックしない(ベストエフォート、§19-20)
  upsertConditionPolicyCache(marketplaceId, categoryId, conditions).catch(() => undefined);

  return conditions;
}
