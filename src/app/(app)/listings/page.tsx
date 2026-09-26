import Link from 'next/link';
import { listPublishedListings } from '@/repositories/listings';
import { buildEbayItemUrl } from '@/services/ebay/auth';

/**
 * §110 step12(2026-09-26): 出品済みListing管理画面の第一段階(一覧表示のみ)。
 * まずは「今どのSKUが、いくらで、何個、どのステータスで出品されているか」を
 * 一覧で確認できるようにする。End Item・在庫同期・価格改定・再出品は未実装
 * (後続のstepで、この画面に操作ボタンを追加していく想定)。
 *
 * 一覧の絞り込みはRLS(schema.sqlの「listings: same organization」ポリシー)に
 * 任せており、このページ自体はorganization_idを明示的に扱わない。
 */
export default async function ListingsIndexPage() {
  const listings = await listPublishedListings();

  return (
    <main>
      <header className="page" style={{ marginBottom: 26, paddingBottom: 18, borderBottom: '2px solid var(--line-strong)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            ONEFLAT EBAY LISTING DESK
          </div>
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2.1rem)' }}>出品済みListing一覧</h1>
          <p className="subnote" style={{ maxWidth: '60ch' }}>
            現在eBayへ出品済み(Publish成功済み)のListingです。End Item・在庫同期・価格改定・再出品は今後追加予定です。
          </p>
        </div>
        <Link href="/listings/new" className="btn primary">
          + 新しく出品する
        </Link>
      </header>

      {listings.length === 0 ? (
        <p className="subnote">まだ出品済みのListingはありません。</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--line-strong)' }}>
                <th style={{ padding: '8px 10px' }}>タイトル</th>
                <th style={{ padding: '8px 10px' }}>SKU</th>
                <th style={{ padding: '8px 10px' }}>価格</th>
                <th style={{ padding: '8px 10px' }}>数量</th>
                <th style={{ padding: '8px 10px' }}>ステータス</th>
                <th style={{ padding: '8px 10px' }}>出品日</th>
                <th style={{ padding: '8px 10px' }}>eBay</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 10px', maxWidth: 320 }}>{listing.title ?? '(タイトル未取得)'}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{listing.sku}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {listing.price ? `${listing.currency ?? ''} ${listing.price}` : '-'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>{listing.quantity ?? '-'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <StatusBadge status={listing.status} />
                  </td>
                  <td style={{ padding: '8px 10px' }}>{formatDate(listing.publishedAt)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {listing.ebayListingId ? (
                      <a href={buildEbayItemUrl(listing.ebayListingId)} target="_blank" rel="noreferrer">
                        {listing.ebayListingId}
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '出品中',
  ENDED: '終了',
  SOLD_OUT: '在庫切れ',
  ERROR: 'エラー',
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: '.78rem',
        border: '1px solid var(--line-strong)',
      }}
    >
      {label}
    </span>
  );
}
