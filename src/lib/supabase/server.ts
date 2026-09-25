import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * サーバー側(Server Components/Route Handlers/Server Actions)専用のSupabaseクライアント。
 * §29: RLSを必ず有効化した上で、これはユーザーのセッション(anon key + cookie)で動作する
 * クライアント。service_role相当の管理操作は getSupabaseAdminClient() (別ファイル)を使う。
 */
export function getSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component内からの呼び出しは無視してよい(Next.jsの制約)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // 同上
          }
        },
      },
    },
  );
}
