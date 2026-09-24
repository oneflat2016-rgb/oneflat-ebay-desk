import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude APIクライアントの共通生成関数。
 * §102: このモジュールはサーバー専用("use server"境界のBackendコードからのみ import)。
 * 絶対にクライアントコンポーネントからimportしないこと。
 * モデル名は環境変数で変更可能にする(指示書§4)。
 */
let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

/** 管理設定 or 環境変数でモデル名を変更可能にする(§4: コードへ直接固定しない) */
export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest';
}
