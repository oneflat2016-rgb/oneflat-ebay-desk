import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { exchangeCodeForTokens, EBAY_OAUTH_SCOPES } from '@/services/ebay/auth';
import { getEbayUserIdentity } from '@/services/ebay/identity';
import { encryptToken } from '@/lib/crypto/tokenEncryption';
import { upsertEbayAccountConnection } from '@/repositories/ebayAccounts';

/**
 * §9(§110 step9): eBayアカウント連携のコールバック。
 * eBayの認可画面でユーザー(ADMIN)が許可すると、ここへcode/stateが渡ってくる。
 * 1. stateがoauth/startで発行したものと一致するか確認(CSRF対策)
 * 2. codeをUser Access Token + Refresh Tokenに交換
 * 3. Identity APIでeBay側のユーザー名を取得(表示用、任意)
 * 4. Refresh Tokenを暗号化してebay_accountsへ保存(§102: 平文のまま保存しない)
 */
const STATE_COOKIE = 'ebay_oauth_state';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const cookieStore = cookies();
  const savedState = cookieStore.get(STATE_COOKIE)?.value;

  function redirectWithError(reason: string) {
    const res = NextResponse.redirect(`${origin}/settings?ebay_error=${encodeURIComponent(reason)}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  }

  if (errorParam) {
    return redirectWithError(`eBay側で連携が拒否されました(${errorParam})`);
  }
  if (!code || !state) {
    return redirectWithError('codeまたはstateが見つかりませんでした');
  }
  if (!savedState || savedState !== state) {
    return redirectWithError('stateが一致しませんでした(CSRF対策・時間切れの可能性があります)');
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return redirectWithError('ログインセッションが切れています');
  }
  if (profile.role !== 'ADMIN') {
    return redirectWithError('ADMINのみeBayアカウントを連携できます');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    let ebayUserId: string | null = null;
    try {
      const identity = await getEbayUserIdentity(tokens.accessToken);
      ebayUserId = identity.username ?? identity.userId ?? null;
    } catch (err) {
      // Identity API取得は表示用の付加情報のため、失敗しても連携自体は継続する
      console.error('[api/ebay/oauth/callback] identity lookup failed', err instanceof Error ? err.message : err);
    }

    const refreshTokenEncrypted = encryptToken(tokens.refreshToken);
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US';

    await upsertEbayAccountConnection({
      organizationId: profile.organizationId,
      marketplaceId,
      ebayUserId,
      refreshTokenEncrypted,
      tokenScope: EBAY_OAUTH_SCOPES.join(' '),
    });

    const res = NextResponse.redirect(`${origin}/settings?ebay_connected=1`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    // §102: rawエラーにSecret(Client Secret/Refresh Token)を含めない
    console.error('[api/ebay/oauth/callback] failed', err instanceof Error ? err.message : err);
    return redirectWithError('eBayアカウントの連携に失敗しました');
  }
}
