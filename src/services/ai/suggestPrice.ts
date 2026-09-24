/**
 * TODO(Phase2 §57-58): 実装対象。
 * ONEFLAT DBの過去販売統計(平均/中央値/最低/最高/直近販売価格)と
 * 類似商品(最大5件)をもとにAI価格提案を行う。
 * 自動確定はしない(社員が必ず最終確認・変更可能, §58)。
 */
export interface PriceSuggestionInput {
  productCategoryId: string;
  condition: string;
  hasAccessories: boolean;
  comparableListingIds: string[]; // 同型/類似商品(最大5件ずつ, §56)
}

export interface PriceSuggestion {
  suggestedPrice: number;
  currency: string;
  reasoning: string[];
}

export async function suggestPrice(_input: PriceSuggestionInput): Promise<PriceSuggestion> {
  throw new Error('suggestPrice is Phase2 scope (§57-58), not implemented yet');
}
