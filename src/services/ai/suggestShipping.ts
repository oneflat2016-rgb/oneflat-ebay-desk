/**
 * TODO(Phase2 §62-64): 実装対象。
 * ONEFLAT履歴(同カテゴリー/重量帯/配送国/過去利用Policy/実送料)から
 * おすすめのFulfillment Policyを提案する。自動確定はせず、
 * 社員がいつでも変更可能(§63)。AI提案→社員選択の差分はai_suggestionsに保存(§64)。
 */
export interface ShippingSuggestionInput {
  categoryId: string;
  weightGrams: number;
  destinationCountry: string;
}

export interface ShippingSuggestion {
  fulfillmentPolicyId: string;
  reasoning: string[];
}

export async function suggestShipping(
  _input: ShippingSuggestionInput,
): Promise<ShippingSuggestion> {
  throw new Error('suggestShipping is Phase2 scope (§62-64), not implemented yet');
}
