/**
 * §9-10: eBay OAuth。
 * このファイルには2種類のトークンが混在する:
 *  - Application Access Token(Client Credentials Grant): ユーザー(出品者)の認証と無関係に、
 *    EBAY_CLIENT_ID/EBAY_CLIENT_SECRETだけで取得できる。Taxonomy/Metadata APIなど
 *    「公開データを読むだけ」のAPIで使う(§110 step6, step7, step8はこれで十分)。
 *  - User Access Token(Authorization Code Grant, §9): 出品者本人のeBayアカウントに
 *    紐づく操作(Inventory/Account/Fulfillment API)に必要。ADMINが最初に一度だけ認可し、
 *    Refresh Tokenを暗号化してebay_accounts.refresh_token_encryptedへ保存する(§110 step9で実装)。
 *
 * §10: Sandbox/Productionを完全に分離する(EBAY_ENVで切り替え、Client ID/Secretも別物)。
 * §102厳守: Client Secret/Refresh TokenはFrontendへ絶対に渡さない(このファイルは
 * サーバー専用コードからのみimportすること)。
 */

function getEbayEnv(): 'sandbox' | 'production' {
  return process.env.EBAY_ENV === 'production' ? 'production' : 'sandbox';
}

export function getEbayApiBaseUrl(): string {
  return getEbayEnv() === 'production' ? 'https://api.ebay.com' : 'https://api.sandbox.ebay.com';
}

function getEbayCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('EBAY_CLIENT_ID / EBAY_CLIENT_SECRET is not set');
  }
  return { clientId, clientSecret };
}

export interface EbayTokenSet {
  accessToken: string;
  expiresAt: number; // epoch seconds
}

// モジュールスコープの簡易キャッシュ(§13: Access Tokenは可能なら永続保存せず短期キャッシュ)。
// サーバーレス環境ではインスタンスごとにリセットされるため、DBへの永続化はしない。
let cachedAppToken: EbayTokenSet | null = null;

/**
 * Application Access Token(Client Credentials Grant)を取得する。
 * Taxonomy/Metadata APIなど、特定の出品者アカウントに紐づかない読み取り専用APIで使用する。
 * §102: Secretはこの関数の外へ出さない(呼び出し元にはaccessTokenのみ返す)。
 */
export async function getEbayAppAccessToken(): Promise<EbayTokenSet> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAppToken && cachedAppToken.expiresAt - 60 > now) {
    return cachedAppToken;
  }

  const { clientId, clientSecret } = getEbayCredentials();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${getEbayApiBaseUrl()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay OAuth token request failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  const tokenSet: EbayTokenSet = {
    accessToken: json.access_token,
    expiresAt: now + json.expires_in,
  };
  cachedAppToken = tokenSet;
  return tokenSet;
}

/**
 * TODO(§9): User Access Token(Authorization Code Grant)。ADMINによるeBayアカウント連携
 * (§110 step9)で実装する。Inventory/Account API等、出品者本人の操作が必要なAPIで使用する。
 */
export function buildAuthorizationUrl(_state: string): string {
  throw new Error('buildAuthorizationUrl is not implemented yet (§9, §110 step9)');
}

export async function exchangeCodeForTokens(_code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  throw new Error('exchangeCodeForTokens is not implemented yet (§9, §110 step9)');
}
