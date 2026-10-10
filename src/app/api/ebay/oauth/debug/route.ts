import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { EBAY_OAUTH_SCOPES, buildAuthorizationUrl } from '@/services/ebay/auth';

/**
 * eBay連携がうまくいかないときの切り分け用(ADMIN限定)。
 * 秘密の値(Client ID/Secret/RuNameそのもの)は返さず、形式が正しいかの「はい/いいえ」だけを返す。
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  if (profile.role !== 'ADMIN') return NextResponse.json({ message: 'ADMINのみ実行できます。' }, { status: 403 });

  const clientId = process.env.EBAY_CLIENT_ID ?? '';
  const ru = process.env.EBAY_REDIRECT_URI ?? '';
  const bad = /[\s"'`]/;

  return NextResponse.json({
    EBAY_ENV: process.env.EBAY_ENV ?? '(未設定)',
    clientId: {
      set: clientId.length > 0,
      hasPRD: clientId.includes('-PRD-'),
      hasSBX: clientId.includes('-SBX-'),
      hasSpaceOrQuote: bad.test(clientId),
    },
    redirectUri: {
      set: ru.length > 0,
      hasPRD: ru.includes('-PRD-'),
      hasSBX: ru.includes('-SBX-'),
      hasSpaceOrQuote: bad.test(ru),
      looksLikeUrl: /^https?:\/\//i.test(ru),
      length: ru.length,
    },
    scopes: EBAY_OAUTH_SCOPES,
    // 認可URLの形(stateはダミー)。Client ID/RuNameの値そのものは含まれるため、貼る前に確認すること。
    authorizeUrlShape: (() => {
      try {
        const u = new URL(buildAuthorizationUrl('DUMMY'));
        return { host: u.host, path: u.pathname, params: [...u.searchParams.keys()], scope: u.searchParams.get('scope'), rawQueryHasPlus: u.search.includes('+') };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    })(),
  });
}
