import Link from 'next/link';
import { listSalesHistory } from '@/repositories/salesHistory';
import { SalesSyncButtons } from '@/components/sales/SalesSyncButtons';

/**
 * §10(最新実装指示書): ONEFLAT販売履歴データベースの一覧画面(Phase4の第一段階)。
 * eBay Fulfillment/Finances APIから取得した注文・取引をDB(orders/order_items/
 * finance_transactions)へ保存したものを表示する。「eBayと同期」ボタンで
 * 最新の注文・手数料を取り込める。
 *
 * §11(自社販売実績照合)はこのデータを土台にする次のステップ(まだ未実装)。
 */
export default async function SalesHistoryPage() {
  const items = await listSalesHistory();

  return (
    <main>
      <header className="page" style={{ marginBottom: 26, paddingBottom: 18, borderBottom: '2px solid var(--line-strong)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            ONEFLAT EBAY LISTING DESK
          </div>
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2.1rem)' }}>販売履歴</h1>
          <p className="subnote" style={{ maxWidth: '60ch' }}>
            eBayでの注文・手数料をDBに蓄積したものです。「eBayと同期」を押すと、前回同期した時点より後の注文・取引を取り込みます(初回は全期間を取得するため時間がかかることがあります)。
          </p>
        </div>
        <SalesSyncButtons />
      </header>

      {items.length === 0 ? (
        <p className="subnote">
          まだ販売履歴がありません。「eBayと同期」を押して取得するか、eBay Sandboxでテスト注文が発生してから再度お試しください。
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--line-strong)' }}>
                <th style={{ padding: '8px 10px' }}>商品タイトル</th>
                <th style={{ padding: '8px 10px' }}>SKU</th>
                <th style={{ padding: '8px 10px' }}>数量</th>
                <th style={{ padding: '8px 10px' }}>販売価格</th>
                <th style={{ padding: '8px 10px' }}>送料</th>
                <th style={{ padding: '8px 10px' }}>eBay手数料</th>
                <th style={{ padding: '8px 10px' }}>注文日</th>
                <th style={{ padding: '8px 10px' }}>購入者国</th>
                <th style={{ padding: '8px 10px' }}>注文ステータス</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.orderItemId} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 10px', maxWidth: 320 }}>{item.title ?? '(タイトル未取得)'}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{item.sku ?? '-'}</td>
                  <td style={{ padding: '8px 10px' }}>{item.quantity}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {item.salePrice !== null ? `${item.currency ?? ''} ${item.salePrice.toFixed(2)}` : '-'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {item.shippingAmount !== null ? `${item.currency ?? ''} ${item.shippingAmount.toFixed(2)}` : '-'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {item.totalFees !== null ? `${item.currency ?? ''} ${item.totalFees.toFixed(2)}` : '-'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>{formatDate(item.creationDate)}</td>
                  <td style={{ padding: '8px 10px' }}>{item.buyerCountry ?? '-'}</td>
                  <td style={{ padding: '8px 10px' }}>{item.orderStatus ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="subnote" style={{ marginTop: 18 }}>
        <Link href="/listings">出品済みListing一覧へ戻る</Link>
      </p>
    </main>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
