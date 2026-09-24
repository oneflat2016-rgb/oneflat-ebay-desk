/**
 * TODO(§84-86): 実装対象。ai_runs / ai_suggestions のCRUD。
 * §85: input_hashで同一入力の再実行を防止(キャッシュ利用)。
 * §84: input/output tokens・推定費用を記録し、管理画面の
 * 「今月AI利用」集計に使う。
 */
export async function recordAiRun(_params: {
  productId: string;
  purpose: string;
  model: string;
  inputHash: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  throw new Error('recordAiRun is not implemented yet (§84)');
}

export async function findCachedAiRun(_inputHash: string): Promise<unknown | null> {
  throw new Error('findCachedAiRun is not implemented yet (§85)');
}
