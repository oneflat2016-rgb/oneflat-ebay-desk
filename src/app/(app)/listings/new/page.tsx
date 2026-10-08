import { ListingForm } from '@/components/listing/ListingForm';
import { createEmptyListingFormState } from '@/lib/listing/defaultState';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { saveListingDraft, type SaveListingIdentity } from './actions';

/**
 * TODO(§30-31): これは旧ebay-listing-desk.htmlの単一フォームをそのまま移植した
 * 暫定ページ。将来はホーム画面(§30)からSTEP1(写真)→STEP2(出品情報)→
 * STEP3(最終確認・出品)のウィザードに置き換える。
 * §110 step3: 認証(Supabase Auth)導入済み(middleware.tsで未ログインは
 * /loginへリダイレクト)。「保存」ボタンでproducts/listing_draftsへ実際に
 * 保存されるようになったため、サンプルデータではなく空の状態から始める。
 *
 * 2026-10-08修正(§80関連の「写真を添付すると点滅する」不具合への対応):
 * 以前はproducts行の作成(商品準備)をクライアント側のuseEffect(マウント時)で
 * 行っていたため、開発モード特有の「同じeffectが2回実行される」挙動により、
 * 1回のページ読み込みで商品が2つ作られてしまい、productIdが途中で
 * 切り替わる→画像一覧の再取得が2回走る、という形で画面がちらつく(点滅する)
 * ことがあった。
 * ここではページを表示する前(サーバー側)で先に商品を1つだけ作成し、
 * その結果(initialIdentity)を最初から画面に渡すことで、
 * クライアント側で後からproductIdが切り替わる瞬間自体を無くす。
 */
export default async function NewListingPage() {
  const initialState = createEmptyListingFormState();
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === 'ADMIN';

  let initialIdentity: SaveListingIdentity = {
    productId: null,
    productVersion: null,
    draftId: null,
    draftVersion: null,
  };
  if (profile) {
    const prepared = await saveListingDraft(initialIdentity, initialState, []);
    if (prepared.ok && prepared.identity) {
      initialIdentity = prepared.identity;
    }
  }

  return (
    <main>
      <header className="page-header">
        <span className="page-header-eyebrow">ONEFLAT EBAY LISTING DESK</span>
        <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2.1rem)' }}>eBay出品アプリ</h1>
        <p className="subnote" style={{ maxWidth: '50ch' }}>
          いつものテンプレートに、商品ごとに変わる部分だけ入力すると、そのまま貼り付けられる説明文HTMLが組み上がります。
        </p>
      </header>
      <ListingForm initialState={initialState} initialIdentity={initialIdentity} isAdmin={isAdmin} />
    </main>
  );
}
