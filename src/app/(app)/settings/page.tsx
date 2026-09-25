import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getEbayAccountForOrganization } from '@/repositories/ebayAccounts';
import { disconnectEbayAccountAction } from './actions';

/**
 * §8, §9(§110 step9): 管理画面(現時点はeBayアカウント連携のみ)。
 * ADMIN以外はアクセスできない。§30以降で他の管理機能(ユーザー招待等)を追加予定。
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { ebay_connected?: string; ebay_error?: string };
}) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <main>
        <h1>管理</h1>
        <p className="subnote">ログインが必要です。</p>
      </main>
    );
  }
  if (profile.role !== 'ADMIN') {
    return (
      <main>
        <h1>管理</h1>
        <p className="subnote">この画面はADMINのみ利用できます。</p>
      </main>
    );
  }

  const ebayConfigured =
    !!process.env.EBAY_CLIENT_ID && !!process.env.EBAY_CLIENT_SECRET && !!process.env.EBAY_REDIRECT_URI;
  const account = await getEbayAccountForOrganization(profile.organizationId);
  const connected = account?.connectionStatus === 'CONNECTED';

  return (
    <main>
      <h1>管理</h1>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="legend-row">
          <h2>eBayアカウント連携(§110 step9)</h2>
          <span className="hint">{connected ? '連携済み' : '未連携'}</span>
        </div>
        <p className="subnote">
          出品(Inventory API)や、将来の注文・利益管理機能に必要なeBayアカウントの認可(OAuth)です。
          連携すると、eBay側で許可した内容(sell.inventory / sell.account / sell.fulfillment /
          sell.finances)の範囲でこのアプリがeBayアカウントを操作できるようになります。
        </p>

        {searchParams.ebay_connected && (
          <p className="subnote" style={{ color: 'var(--accent)' }}>
            eBayアカウントの連携が完了しました。
          </p>
        )}
        {searchParams.ebay_error && (
          <p className="subnote" style={{ color: 'var(--danger, #c0392b)' }}>
            {decodeURIComponent(searchParams.ebay_error)}
          </p>
        )}

        {!ebayConfigured && (
          <p className="subnote" style={{ color: 'var(--danger, #c0392b)' }}>
            eBay連携は現在設定されていません(EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_REDIRECT_URI
            未設定)。
          </p>
        )}

        {ebayConfigured && connected && (
          <>
            <p className="subnote">
              マーケットプレイス: {account?.marketplaceId}
              {account?.ebayUserId && <> / eBayユーザー: {account.ebayUserId}</>}
              {account?.lastVerifiedAt && (
                <> / 連携日時: {new Date(account.lastVerifiedAt).toLocaleString('ja-JP')}</>
              )}
            </p>
            <form action={disconnectEbayAccountAction}>
              <button type="submit" className="btn">
                連携を解除
              </button>
            </form>
            <p className="subnote" style={{ marginTop: 4 }}>
              ※このボタンはこのアプリ側の連携情報を消すだけです。eBay側で許可した内容自体を取り消したい場合は、
              eBayの「Account Settings &gt; App Authorizations」からも取り消してください。
            </p>
          </>
        )}

        {ebayConfigured && !connected && (
          <a href="/api/ebay/oauth/start" className="btn primary">
            eBayアカウントを連携
          </a>
        )}
      </section>
    </main>
  );
}
