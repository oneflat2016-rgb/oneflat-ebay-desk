import Link from 'next/link';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { signOut } from '@/app/(auth)/login/actions';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * §7-8: ログイン中の社員情報をヘッダーに表示し、Roleに応じて
 * 管理画面リンク(ADMINのみ)を出し分ける。
 * Supabase未設定の開発中は認証をスキップし、middleware同様に素通りさせる。
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = SUPABASE_CONFIGURED ? await getCurrentProfile() : null;

  return (
    <>
      {SUPABASE_CONFIGURED && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 12,
            fontSize: '.8rem',
            color: 'var(--muted)',
            paddingBottom: 8,
          }}
        >
          {profile ? (
            <>
              <span>
                こんにちは {profile.displayName} さん({profile.role})
              </span>
              {profile.role === 'ADMIN' && <Link href="/settings">管理</Link>}
              <form action={signOut}>
                <button type="submit" className="btn ghost" style={{ fontSize: '.75rem' }}>
                  ログアウト
                </button>
              </form>
            </>
          ) : (
            <span>
              アカウントが未登録です。管理者にお問い合わせください。
            </span>
          )}
        </div>
      )}
      {children}
    </>
  );
}
