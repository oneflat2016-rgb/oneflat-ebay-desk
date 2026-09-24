/**
 * TODO(§9-10): 実装対象。
 * eBay OAuth (Authorization Code Grant)。
 * - ADMINが最初に会社eBayアカウントを認証する(§9)
 * - Refresh Tokenは暗号化してebay_accounts.refresh_token_encryptedへ保存
 * - Access Tokenは可能なら永続保存せず、必要時に生成/短期キャッシュ(§13)
 * - Access Token失効時はRefresh Tokenから再取得
 * - Sandbox/Productionを完全分離(EBAY_ENV, §10)
 *
 * §102 厳守: Client Secret/Refresh TokenはFrontendへ絶対に渡さない。
 */

export interface EbayTokenSet {
  accessToken: string;
  expiresAt: number; // epoch seconds
}

export async function getEbayAppAccessToken(_ebayAccountId: string): Promise<EbayTokenSet> {
  throw new Error('getEbayAppAccessToken is not implemented yet (§9-10)');
}

export function buildAuthorizationUrl(_state: string): string {
  throw new Error('buildAuthorizationUrl is not implemented yet (§9)');
}

export async function exchangeCodeForTokens(_code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  throw new Error('exchangeCodeForTokens is not implemented yet (§9)');
}
