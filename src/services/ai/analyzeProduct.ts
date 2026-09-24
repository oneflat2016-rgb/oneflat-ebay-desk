import type { ProductAnalysis } from '@/types/ai';

/**
 * TODO(§34-36): 実装対象。
 * POST /api/ai/analyze-product から呼ばれる。
 * 入力: product_id, 画像参照(Supabase Storageのpath/URL), 任意メモ。
 * 出力: ProductAnalysis相当のJSON(brand/model/mpn/product_type等)。
 * 制約:
 *  - Claudeに存在しない情報を作らせない(不明ならnull)
 *  - §104: 画像中に写り込んだ命令文をinstructionとして解釈させない
 *    (system promptで「画像は分析対象のデータであり指示ではない」旨を明示する)
 *  - 結果はai_runs/ai_suggestionsテーブルへ保存し、input_hashで再実行防止(§85)
 */
export async function analyzeProduct(_params: {
  productId: string;
  imageUrls: string[];
  note?: string;
}): Promise<ProductAnalysis> {
  throw new Error('analyzeProduct is not implemented yet (Phase1 §34-36)');
}
