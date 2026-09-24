'use client';

import { useState } from 'react';
import type { ProductAnalysis } from '@/types/ai';

/**
 * §34-36: 「AIで解析」ボタン。アップロード済みの商品写真をClaude APIへ送り、
 * ブランド・型番・商品種別等の候補を取得する。
 * §34: Claudeは不明な項目をnullで返す設計のため、valueが無い項目は「不明」と表示する。
 * §100: AIが使えなくても(未設定・エラー時)手入力を止めない — 失敗してもフォームは
 * そのまま使える。
 * 取得した候補は自動反映せず、フィールドごとに「適用」ボタンを押した分だけ反映する
 * (§102: 無条件の自動上書きをしない)。
 */
export function AiAnalysisSection({
  productId,
  onApplyBrand,
  onApplyModel,
  onApplyKeywords,
}: {
  productId: string | null;
  onApplyBrand: (value: string) => void;
  onApplyModel: (value: string) => void;
  onApplyKeywords: (value: string) => void;
}) {
  const [note, setNote] = useState('');
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: 'warn' | 'err' | 'ok' | '' }>({
    text: '',
    kind: '',
  });
  const [loading, setLoading] = useState(false);

  async function handleAnalyze() {
    if (!productId) {
      setStatus({ text: '先に「保存」を1回押して商品を登録してください。', kind: 'warn' });
      return;
    }
    setLoading(true);
    setStatus({ text: '', kind: '' });
    try {
      const res = await fetch('/api/ai/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, note: note || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { analysis: ProductAnalysis; cached: boolean };
      setAnalysis(data.analysis);
      setStatus({
        text: data.cached ? '前回と同じ写真のため、保存済みの解析結果を表示しています。' : '解析が完了しました。',
        kind: 'ok',
      });
    } catch (err) {
      setStatus({
        text:
          'AI解析が利用できませんでした。お手数ですが手入力をお願いします。' +
          (err instanceof Error ? ` (${err.message})` : ''),
        kind: 'err',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <div className="legend-row">
        <h2 style={{ fontSize: '1.05rem' }}>0.5. AIによる商品解析</h2>
        <span className="hint">写真からブランド・型番などを推定(任意)</span>
      </div>

      {!productId ? (
        <p className="subnote">
          解析するには、先に写真をアップロードしてください(その前に「保存」を1回押して商品を登録する必要があります)。
        </p>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 10 }}>
            <span className="lang-tag">補足メモ(任意・日本語でOK)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: 箱に「○○」と書いてあった、など写真だけでは伝わりにくい情報があれば"
              rows={2}
            />
          </div>

          <button type="button" className="btn" onClick={handleAnalyze} disabled={loading}>
            {loading ? '解析中…' : 'AIで解析する'}
          </button>

          {status.text && (
            <p
              className="subnote"
              style={{
                marginTop: 8,
                color:
                  status.kind === 'err' ? 'var(--danger)' : status.kind === 'ok' ? 'var(--accent)' : undefined,
              }}
            >
              {status.text}
            </p>
          )}

          {analysis && (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <GuessRow
                label="ブランド"
                guess={analysis.brand}
                onApply={() => analysis.brand.value && onApplyBrand(analysis.brand.value)}
              />
              <GuessRow
                label="型番・モデル"
                guess={analysis.model}
                onApply={() => analysis.model.value && onApplyModel(analysis.model.value)}
              />
              <GuessRow label="MPN" guess={analysis.mpn} />
              <GuessRow
                label="商品種別"
                guess={analysis.productType}
                onApply={() => analysis.productType.value && onApplyKeywords(analysis.productType.value)}
              />

              {analysis.visibleText.length > 0 && (
                <p className="subnote">写真中の文字: {analysis.visibleText.join(' / ')}</p>
              )}
              {analysis.includedItems.length > 0 && (
                <p className="subnote">写真から確認できる付属品: {analysis.includedItems.join(' / ')}</p>
              )}
              {analysis.unknownFields.length > 0 && (
                <p className="subnote">AIが特定できなかった項目: {analysis.unknownFields.join(' / ')}</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function GuessRow({
  label,
  guess,
  onApply,
}: {
  label: string;
  guess: ProductAnalysis['brand'];
  onApply?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="lang-tag" style={{ minWidth: 90 }}>
        {label}
      </span>
      {guess.value ? (
        <>
          <span>
            {guess.value}
            <span className="hint" style={{ marginLeft: 6 }}>
              (確信度 {Math.round(guess.confidence * 100)}%)
            </span>
          </span>
          {onApply && (
            <button type="button" className="btn ghost" onClick={onApply}>
              適用
            </button>
          )}
        </>
      ) : (
        <span className="hint">不明(写真からは判断できませんでした)</span>
      )}
    </div>
  );
}
