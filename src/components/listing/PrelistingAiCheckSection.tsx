'use client';

import { useState } from 'react';

/**
 * §24(指示書「最新実装指示書」): 出品前AIチェックのUI。
 * §25: あくまで警告であり、Publish自体はブロックしない(ボタンとは独立)。
 * §100相当: AIが使えなくてもエラーメッセージを表示するだけで、フォームは止めない。
 */
export interface PrelistingCheckInput {
  productId: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  categoryId: string | null;
  ebayConditionId: string | null;
  conditionDetailJa: string;
  conditionDetailEn: string;
  aboutEn: string;
  appearanceEn: string;
  includedItemsEn: string;
  fulfillmentPolicyId: string | null;
  paymentPolicyId: string | null;
  returnPolicyId: string | null;
  merchantLocationKey: string | null;
  price: string;
}

interface Warning {
  source: 'rule' | 'ai';
  category: string;
  message: string;
}

export function PrelistingAiCheckSection({ getInput }: { getInput: () => PrelistingCheckInput }) {
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<Warning[] | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function handleCheck() {
    setLoading(true);
    setErrorText(null);
    setWarnings(null);
    try {
      const res = await fetch('/api/ai/prelisting-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getInput()),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? '出品前チェックに失敗しました。');
      }
      const data = (await res.json()) as { warnings: Warning[] };
      setWarnings(data.warnings);
    } catch (err) {
      setErrorText(
        err instanceof Error ? err.message : '出品前チェックが利用できませんでした。目視で確認のうえ出品してください。',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <div className="legend-row">
        <h2 style={{ fontSize: '1.05rem' }}>出品前AIチェック</h2>
        <span className="hint">型番・写真の矛盾や未入力項目をチェック(任意・Publishはブロックしません)</span>
      </div>
      <p className="subnote">
        タイトル・ブランド・型番・Condition・配送設定などの入力漏れと、商品説明が写真の内容と矛盾していないか、確認できていない事実を断定していないかをまとめて確認します。ここでの結果は参考情報であり、最終判断は必ず人が行ってください(指示書§25)。
      </p>
      <button type="button" className="btn" onClick={handleCheck} disabled={loading}>
        {loading ? 'チェック中…' : '出品前チェックを実行'}
      </button>
      {errorText && (
        <p className="subnote" style={{ marginTop: 8, color: 'var(--danger)' }}>
          {errorText}
        </p>
      )}
      {warnings && (
        <div style={{ marginTop: 12 }}>
          {warnings.length === 0 ? (
            <p className="subnote" style={{ color: 'var(--accent)' }}>
              特に気になる点は見つかりませんでした。念のため最終確認画面もご自身の目で確認してください。
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {warnings.map((w, i) => (
                <li key={`${w.category}-${i}`} className="subnote" style={{ color: '#b8860b' }}>
                  {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
