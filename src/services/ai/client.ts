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

/**
 * 管理設定 or 環境変数でモデル名を変更可能にする(§4: コードへ直接固定しない)。
 * ANTHROPIC_MODELが未設定、または空文字("")の場合は既定値にフォールバックする
 * (Vercelの環境変数UIで空欄のまま保存されるケースがあるため、空文字も未設定扱いにする)。
 */
export function getAnthropicModel(): string {
  const configured = process.env.ANTHROPIC_MODEL?.trim();
  return configured ? configured : 'claude-sonnet-5';
}
