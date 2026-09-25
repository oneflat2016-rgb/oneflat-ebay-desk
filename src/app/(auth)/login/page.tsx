import { signInWithPassword } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  missing: 'メールアドレスとパスワードを入力してください。',
  invalid: 'ログインできませんでした。メールアドレスまたはパスワードをご確認ください。',
};

/**
 * §7-8: ログイン画面。アカウントはADMINが発行する想定なので、
 * ここには新規登録リンクは置かない。
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const errorMessage = searchParams.error ? ERROR_MESSAGES[searchParams.error] : null;
  const next = searchParams.next ?? '/dashboard';

  return (
    <main
      style={{
        maxWidth: 360,
        margin: '80px auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '.72rem',
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          ONEFLAT EBAY LISTING DESK
        </div>
        <h1 style={{ fontSize: '1.5rem', marginTop: 4 }}>ログイン</h1>
      </div>

      <form action={signInWithPassword} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="email">メールアドレス</label>
          <input type="email" id="email" name="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">パスワード</label>
          <input type="password" id="password" name="password" required autoComplete="current-password" />
        </div>
        {errorMessage && (
          <p className="subnote" style={{ color: 'var(--danger)' }}>
            {errorMessage}
          </p>
        )}
        <button type="submit" className="btn primary">
          ログイン
        </button>
      </form>

      <p className="subnote" style={{ textAlign: 'center' }}>
        アカウントをお持ちでない場合は管理者にお問い合わせください。
      </p>
    </main>
  );
}
