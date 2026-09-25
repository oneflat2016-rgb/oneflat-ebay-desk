import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * §7-8: (app)配下は未ログインなら/loginへリダイレクトする。
 * §100の精神(AIが落ちてもアプリは使える)と同様、Supabase未設定時
 * (環境変数が空)はログインを要求せず素通りさせ、開発中に固まらないようにする。
 */
const PUBLIC_PATHS = ['/login', '/auth/callback'];

export async function middleware(request: NextRequest) {
  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseConfigured) {
    return NextResponse.next();
  }

  const { supabase, response } = updateSession(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 静的アセット・Next.js内部パスを除外
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)',
  ],
};
