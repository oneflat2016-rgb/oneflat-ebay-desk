'use client';

import { useState } from 'react';

/**
 * §11(最新実装指示書, Phase4): 自社販売実績照合のUI。
 * brand/model(無ければcategoryName)を使って、過去に自社で実際に売れた
 * 似た商品をONEFLAT販売履歴DB(§10)から検索し、値付けの参考として表示する。
 * §25と同じ考え方: あくまで参考情報であり、何かをブロックすることはない。
 */
interface SimilarSoldItem {
  orderItemId: string;
  sku: string | null;
  title: string | null;
  brand: string | null;
  model: string | null;
  quantity: number;
  salePrice: number | null;
  currency: string | null;
  creationDate: string | null;
  orderStatus: string | null;
}

export function SimilarSalesSection({
  brand,
  model,
  categoryName,
}: {
  brand: string | null;
  model: string | null;
  categoryName: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SimilarSoldItem[] | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const canSearch = Boolean((brand && brand.trim()) || (model && model.trim()) || (categoryName && categoryName.trim()));

  async function handleSearch() {
    setLoading(true);
    setErrorText(null);
    setItems(null);
    try {
      const res = await fetch('/api/sales/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, model, categoryName }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? '類似販売実績の検索に失敗しました。');
      }
      const data = (await res.json()) as { items: SimilarSoldItem[] };
      setItems(data.items);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '類似販売実績を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <div className="legend-row">
        <h2 style={{ fontSize: '1.05rem' }}>自社の過去の販売実績(§11)</h2>
        <span className="hint">ブランド・型番が近い、自社で実際に売れた商品を検索(値付けの参考・任意)</span>
      </div>
      <p className="subnote">
        現在入力されているブランド・型番(無ければカテゴリー)に近い、ONEFLATが過去に実際に販売した商品をeBay販売履歴DBから探します。価格を決める際の参考情報であり、ここでの結果が何かを自動で決めることはありません。
      </p>
      <button type="button" className="btn" onClick={handleSearch} disabled={loading || !canSearch}>
        {loading ? '検索中…' : '過去の類似販売実績を検索'}
      </button>
      {!canSearch && (
        <p className="subnote" style={{ marginTop: 8 }}>
          ブランド・型番・カテゴリーのいずれかが入力されると検索できます。
        </p>
      )}
      {errorText && (
        <p className="subnote" style={{ marginTop: 8, color: 'var(--danger)' }}>
          {errorText}
        </p>
      )}
      {items && (
        <div style={{ marginTop: 12 }}>
          {items.length === 0 ? (
            <p className="subnote">一致する過去の販売実績は見つかりませんでした。</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line-strong)' }}>
                    <th style={{ padding: '6px 8px' }}>商品タイトル</th>
                    <th style={{ padding: '6px 8px' }}>ブランド/型番</th>
                    <th style={{ padding: '6px 8px' }}>個数</th>
                    <th style={{ padding: '6px 8px' }}>販売価格</th>
                    <th style={{ padding: '6px 8px' }}>注文日</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.orderItemId} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 8px', maxWidth: 260 }}>{item.title ?? '(タイトル未取得)'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {[item.brand, item.model].filter(Boolean).join(' / ') || '-'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{item.quantity}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {item.salePrice !== null ? `${item.currency ?? ''} ${item.salePrice.toFixed(2)}` : '-'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{formatDate(item.creationDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
