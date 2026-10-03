'use client';

import { useState } from 'react';

/**
 * §15(指示書「最新実装指示書」): AI価格提案のUI。
 * §11(自社販売実績照合)のデータを根拠にAIが提案する価格を表示する。
 * §25と同じ考え方: あくまで提案であり、「この価格を使う」ボタンを押さない限り
 * 価格欄は自動で書き換わらない(最終判断は人間が行う)。
 */
interface PriceSuggestion {
  suggestedPrice: number;
  priceRangeLow: number;
  priceRangeHigh: number;
  basedOnOwnSales: boolean;
  reasoningJa: string;
}

export function AiPriceSuggestionSection({
  brand,
  model,
  condition,
  categoryName,
  onApplyPrice,
}: {
  brand: string | null;
  model: string | null;
  condition: string | null;
  categoryName: string | null;
  onApplyPrice: (price: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<PriceSuggestion | null>(null);
  const [comparableCount, setComparableCount] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const canRequest = Boolean((brand && brand.trim()) || (model && model.trim()) || (categoryName && categoryName.trim()));

  async function handleSuggest() {
    setLoading(true);
    setErrorText(null);
    setSuggestion(null);
    try {
      const res = await fetch('/api/ai/suggest-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, model, condition, categoryName }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'AI価格提案に失敗しました。');
      }
      const data = (await res.json()) as { suggestion: PriceSuggestion; comparableSalesCount: number };
      setSuggestion(data.suggestion);
      setComparableCount(data.comparableSalesCount);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'AI価格提案が利用できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <div className="legend-row">
        <h2 style={{ fontSize: '1.05rem' }}>10. AI価格提案(§15)</h2>
        <span className="hint">自社の過去の販売実績を根拠に、AIが価格の目安を提案(任意・自動反映しません)</span>
      </div>
      <p className="subnote">
        自社が過去に実際に売った似た商品があればそれを最優先の根拠として、無ければ一般的な相場の目安として、AIが価格を提案します。あくまで参考であり、実際の価格は「この価格を使う」を押した場合のみ反映されます。
      </p>
      <button type="button" className="btn" onClick={handleSuggest} disabled={loading || !canRequest}>
        {loading ? '提案を作成中…' : 'AIに価格を提案してもらう'}
      </button>
      {!canRequest && (
        <p className="subnote" style={{ marginTop: 8 }}>
          ブランド・型番・カテゴリーのいずれかが入力されると提案できます。
        </p>
      )}
      {errorText && (
        <p className="subnote" style={{ marginTop: 8, color: 'var(--danger)' }}>
          {errorText}
        </p>
      )}
      {suggestion && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
            提案価格: USD {suggestion.suggestedPrice.toFixed(2)}
            <span className="subnote" style={{ marginLeft: 8, fontWeight: 400 }}>
              (目安レンジ: {suggestion.priceRangeLow.toFixed(2)} 〜 {suggestion.priceRangeHigh.toFixed(2)})
            </span>
          </p>
          <p className="subnote" style={{ margin: 0 }}>
            {suggestion.basedOnOwnSales
              ? `自社の過去の販売実績(${comparableCount ?? 0}件)を根拠にしています。`
              : '自社の販売実績が見つからなかったため、一般的な相場からの目安です。'}
          </p>
          <p className="subnote" style={{ margin: 0 }}>{suggestion.reasoningJa}</p>
          <div>
            <button
              type="button"
              className="btn primary"
              onClick={() => onApplyPrice(suggestion.suggestedPrice.toFixed(2))}
            >
              この価格を使う
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
