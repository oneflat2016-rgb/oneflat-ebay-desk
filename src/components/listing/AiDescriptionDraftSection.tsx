'use client';

import { useState } from 'react';

/**
 * §13(指示書「最新実装指示書」)/§45-46・§49: AI説明文下書き生成ボタン。
 * ブランド・型番・Item Specifics・Conditionから、About/Appearance/Condition詳細/
 * Included Itemsの4つの日本語下書きをまとめて作成し、各セクションの日本語欄へ反映する。
 * §102: 生成するのは「下書き」であり、ボタンを押すたびに日本語欄を上書きする点は
 * 既存の「→ 英語に変換」ボタンと同じ挙動(押した結果だけ反映・社員が自由に編集可能)。
 * §100: AIが使えなくても(未設定・エラー時)手入力をそのまま続行できる。
 */
export interface DescriptionDrafts {
  aboutJa: string;
  appearanceJa: string;
  conditionJa: string;
  includedItemsJa: string;
}

export function AiDescriptionDraftSection({
  productType,
  confirmedAspects,
  conditionNotes,
  onDraftsGenerated,
}: {
  productType: string | null;
  confirmedAspects: Record<string, string>;
  conditionNotes?: string;
  onDraftsGenerated: (drafts: DescriptionDrafts) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: 'err' | 'ok' | '' }>({ text: '', kind: '' });

  async function handleGenerate() {
    setLoading(true);
    setStatus({ text: '', kind: '' });
    try {
      const res = await fetch('/api/ai/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productType, confirmedAspects, conditionNotes }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'AI説明文生成に失敗しました。');
      }
      const data = (await res.json()) as DescriptionDrafts;
      onDraftsGenerated(data);
      setStatus({ text: '下書きを作成しました。各セクションの日本語欄に反映しています。内容を確認・編集してください。', kind: 'ok' });
    } catch (err) {
      setStatus({
        text:
          'AI説明文生成が利用できませんでした。お手数ですが各セクションに手入力をお願いします。' +
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
        <h2 style={{ fontSize: '1.05rem' }}>2.5. AIによる説明文の下書き作成</h2>
        <span className="hint">ブランド・型番・Item Specifics・Conditionから日本語下書きを作成(任意)</span>
      </div>
      <p className="subnote">
        下の「About This Item / Appearance / Condition / Included Items」4セクションの日本語欄へ、AIが確認済みの情報だけから下書きをまとめて作成します。事実として確認できていないことは書き足さないので、内容は必ず確認・編集してください。
      </p>
      <button type="button" className="btn" onClick={handleGenerate} disabled={loading}>
        {loading ? 'AIが下書きを作成中…' : 'AIで説明文の下書きを作成'}
      </button>
      {status.text && (
        <p
          className="subnote"
          style={{ marginTop: 8, color: status.kind === 'err' ? 'var(--danger)' : status.kind === 'ok' ? 'var(--accent)' : undefined }}
        >
          {status.text}
        </p>
      )}
    </section>
  );
}
