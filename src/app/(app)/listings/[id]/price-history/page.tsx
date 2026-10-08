import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getListingSummary } from '@/repositories/listings';
import { getPriceHistoryForListing } from '@/repositories/priceHistory';

/**
 * §33(Phase6実装仕様, 2026-10-08): 値下げ履歴の表示画面。
 * 一覧(/listings)の各行から「価格履歴」リンクで遷移する、1 Listingぶんの
 * 価格変更履歴(値上げ・値下げどちらも含む)をそのまま時系列で表示するだけの画面。
 */
export default async function PriceHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await getListingSummary(id);
  if (!listing) notFound();

  const history = await getPriceHistoryForListing(id);

  return (
    <main>
      <header className="page-header">
        <span className="page-header-eyebrow">ONEFLAT EBAY LISTING DESK</span>
        <h1>価格変更履歴</h1>
        <p className="subnote">
          {listing.title ?? listing.sku}(SKU: {listing.sku})
        </p>
      </header>

      {history.length === 0 ? (
        <p className="subnote">この商品はまだ価格を変更していません。</p>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--line-strong)' }}>
                <th style={{ padding: '8px 10px' }}>変更日時</th>
                <th style={{ padding: '8px 10px' }}>変更前</th>
                <th style={{ padding: '8px 10px' }}>変更後</th>
                <th style={{ padding: '8px 10px' }}>変化</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => {
                const diff = entry.newPrice - entry.oldPrice;
                const isDrop = diff < 0;
                return (
                  <tr key={entry.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 10px' }}>{formatDate(entry.createdAt)}</td>
                    <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>
                      {entry.currency} {entry.oldPrice}
                    </td>
                    <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>
                      {entry.currency} {entry.newPrice}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        fontVariantNumeric: 'tabular-nums',
                        color: isDrop ? 'var(--accent-2)' : diff > 0 ? 'var(--danger)' : undefined,
                      }}
                    >
                      {diff > 0 ? '+' : ''}
                      {diff.toFixed(2)} {isDrop ? '(値下げ)' : diff > 0 ? '(値上げ)' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 20 }}>
        <Link href="/listings">← 出品済みListing一覧に戻る</Link>
      </p>
    </main>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
