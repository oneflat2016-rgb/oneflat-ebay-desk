/**
 * TODO(§47-48): 実装対象。
 * POST /api/ai/generate-title
 * 入力: Brand/Model/商品Type/Condition/主要Item Specifics/確認済み特徴
 * 出力: 80文字以内の候補を最大3件
 * 重要な制約: 事実として確認できない語(RARE, Authentic, Mint,
 * Tested & Working, Original, Vintage, Made in Japan)を無断で追加しない。
 * 確認済みフィールド(例: country of manufacture = Japan が確定している等)
 * からのみそれらの語を使ってよい。
 */
export interface GenerateTitleInput {
  brand: string | null;
  model: string | null;
  productType: string | null;
  condition: string;
  keyAspects: Record<string, string>;
  confirmedFacts: string[]; // 例: ["made_in_japan"], ["tested_working"]
}

export async function generateTitleCandidates(_input: GenerateTitleInput): Promise<string[]> {
  throw new Error('generateTitleCandidates is not implemented yet (Phase1 §47-48)');
}
