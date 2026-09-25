import { ListingForm } from '@/components/listing/ListingForm';
import { createEmptyListingFormState } from '@/lib/listing/defaultState';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';

/**
 * TODO(§30-31): これは旧ebay-listing-desk.htmlの単一フォームをそのまま移植した
 * 暫定ページ。将来はホーム画面(§30)からSTEP1(写真)→STEP2(出品情報)→
 * STEP3(最終確認・出品)のウィザードに置き換える。
 * §110 step3: 認証(Supabase Auth)導入済み(middleware.tsで未ログインは
 * /loginへリダイレクト)。「保存」ボタンでproducts/listing_draftsへ実際に
 * 保存されるようになったため、サンプルデータではなく空の状態から始める。
 */
export default async function NewListingPage() {
  const initialState = createEmptyListingFormState();
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === 'ADMIN';
  return (
    <main>
      <header className="page" style={{ marginBottom: 26, paddingBottom: 18, borderBottom: '2px solid var(--line-strong)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            ONEFLAT EBAY LISTING DESK
          </div>
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2.1rem)' }}>eBay出品アプリ</h1>
          <p className="subnote" style={{ maxWidth: '50ch' }}>
            いつものテンプレートに、商品ごとに変わる部分だけ入力すると、そのまま貼り付けられる説明文HTMLが組み上がります。
          </p>
        </div>
      </header>
      <ListingForm initialState={initialState} isAdmin={isAdmin} />
    </main>
  );
}
