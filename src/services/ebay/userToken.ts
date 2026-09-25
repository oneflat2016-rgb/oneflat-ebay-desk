import { getEncryptedRefreshToken } from '@/repositories/ebayAccounts';
import { decryptToken } from '@/lib/crypto/tokenEncryption';
import { refreshUserAccessToken } from './auth';

/**
 * §9-10(§110 step10以降): 保存済み(暗号化済み)Refresh Tokenから、
 * 呼び出しのたびにUser Access Tokenを取得する。
 * サーバーレス環境ではインスタンスをまたいだメモリキャッシュが信用できないため、
 * §13の「短期キャッシュ」はApplication Access Token(auth.ts側)のみに留め、
 * こちらは呼び出しごとに素直にrefreshする(eBay側もrefresh_token自体は消費されない)。
 */
export async function getEbayUserAccessToken(organizationId: string): Promise<string> {
  const encrypted = await getEncryptedRefreshToken(organizationId);
  if (!encrypted) {
    throw new Error('eBayアカウントが連携されていません(ADMINが/settingsから連携する必要があります)');
  }
  const refreshToken = decryptToken(encrypted);
  const { accessToken } = await refreshUserAccessToken(refreshToken);
  return accessToken;
}
