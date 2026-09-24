import Link from 'next/link';

/**
 * TODO(§30): ホーム画面の本実装。
 * - 「商品を撮影して出品」「型番から登録」「バーコードから登録」「過去商品を複製」
 * - 下書き/確認待ち/出品中/本日の販売の件数サマリー(products, listing_drafts, listingsから集計)
 * - 最近の商品一覧
 * 現時点は§7のSupabase Auth導線確認用の暫定ページ。
 */
export default function DashboardPage() {
  return (
    <main>
      <h1>ONEFLAT eBay Listing Desk</h1>
      <p className="subnote" style={{ marginBottom: 20 }}>
        ホーム画面(§30)は未実装です。現在は商品登録フォームのみ利用できます。
      </p>
      <Link href="/listings/new" className="btn primary">
        📷 商品を撮影して出品(暫定: 従来フォームへ)
      </Link>
    </main>
  );
}
