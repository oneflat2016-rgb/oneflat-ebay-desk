import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { buildAuthorizationUrl } from '@/services/ebay/auth';

/**
 * §9(§110 step9): eBayアカウント連携の開始点。
 * ADMINが/settingsの「eBayアカウントを連携」ボタンを押すとここへ来て、
 * CSRF対策用のstateをCookieに保存した上でeBayの認可画面へリダイレクトする。
 * §102: ADMIN以外はここでブロックする(実際の連携=Refresh Token取得はADMIN限定)。
 */
const STATE_COOKIE = 'ebay_oauth_state';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }
  if (profile.role !== 'ADMIN') {
    return NextResponse.json({ message: 'eBayアカウント連携はADMINのみ実行できます。' }, { status: 403 });
  }

  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET || !process.env.EBAY_REDIRECT_URI) {
    return NextResponse.json(
      {
        message:
          'eBay連携は現在設定されていません(EBAY_CLIENT_ID/SECRET/REDIRECT_URI未設定)。',
      },
      { status: 501 },
    );
  }

  const state = randomBytes(24).toString('base64url');
  let authorizationUrl: string;
  try {
    authorizationUrl = buildAuthorizationUrl(state);
  } catch (err) {
    console.error('[api/ebay/oauth/start] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: '認可URLの生成に失敗しました。' }, { status: 500 });
  }

  const res = NextResponse.redirect(authorizationUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10分
    path: '/',
  });
  return res;
}
