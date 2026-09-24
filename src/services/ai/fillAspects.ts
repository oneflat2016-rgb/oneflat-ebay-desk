import type { EbayAspectDefinition } from '@/types/ebay';

/**
 * TODO(§41-42): 実装対象。
 * POST /api/ai/fill-aspects
 * 入力: 商品解析結果 + eBay Aspect定義(services/ebay/metadata.tsで取得) + 確認済み商品情報
 * 出力: Aspect名ごとの入力候補(値 + confidence)
 * 制約: eBayから渡されたAspect名だけに回答する。新しいAspect名を作らせない(§41)。
 */
export interface FillAspectsInput {
  aspects: EbayAspectDefinition[];
  productFacts: Record<string, string | null>;
}

export interface AspectSuggestion {
  aspectName: string;
  value: string;
  confidence: number;
}

export async function fillAspects(_input: FillAspectsInput): Promise<AspectSuggestion[]> {
  throw new Error('fillAspects is not implemented yet (Phase1 §41-42)');
}
