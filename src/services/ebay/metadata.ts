import type { EbayAspectDefinition, EbayConditionPolicy } from '@/types/ebay';

/**
 * TODO(§39, §43): 実装対象。eBay Metadata API。
 * - getItemAspectsForCategory(categoryTreeId, categoryId) → 動的Item Specifics(§39-42)
 * - getItemConditionPolicies(categoryId) → カテゴリーごとのCondition一覧(§43)
 * !!! Item Specificsを固定配列として持たないこと(§117-3) !!!
 * !!! ClaudeにカテゴリーやConditionを独自定義させないこと(§117-4) !!!
 */
export async function getAspectsForCategory(_params: {
  marketplaceId: string;
  categoryId: string;
}): Promise<EbayAspectDefinition[]> {
  throw new Error('getAspectsForCategory is not implemented yet (§39-42)');
}

export async function getConditionPoliciesForCategory(_params: {
  marketplaceId: string;
  categoryId: string;
}): Promise<EbayConditionPolicy[]> {
  throw new Error('getConditionPoliciesForCategory is not implemented yet (§43)');
}
