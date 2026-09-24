/**
 * TODO(§45-46, §49): 実装対象。
 * About This Item / Appearance / Condition詳細 / Included Items の
 * 日本語ドラフトを、確認済み商品情報(ProductAnalysis + Aspect値)から
 * AIが自動作成する。社員は生成結果を編集できる(§45: 手入力欄は維持)。
 * 最終的な説明文HTML組み立て自体は src/lib/listing/templateHtml.ts
 * (クライアント/サーバー共通の純粋関数)で行う。
 */
export interface GenerateDescriptionInput {
  productType: string | null;
  confirmedAspects: Record<string, string>;
  conditionNotes?: string;
}

export interface GenerateDescriptionOutput {
  aboutJa: string;
  appearanceJa: string;
  conditionJa: string;
  includedItemsJa: string;
}

export async function generateDescriptionDrafts(
  _input: GenerateDescriptionInput,
): Promise<GenerateDescriptionOutput> {
  throw new Error('generateDescriptionDrafts is not implemented yet (§45-46, §49)');
}
