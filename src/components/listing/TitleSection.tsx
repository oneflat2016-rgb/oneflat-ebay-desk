'use client';

import { useState } from 'react';
import type { ConditionValue } from '@/types/listing';
import { buildTitleCandidates } from '@/lib/listing/titleSuggestions';

interface Props {
  brand: string;
  model: string;
  keywords: string;
  title: string;
  category: string;
  condition: ConditionValue;
  ebayConditionDescription: string | null;
  aspectValues: Record<string, string[]>;
  onBrandChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onKeywordsChange: (v: string) => void;
  onTitleChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
}

export function TitleSection({
  brand,
  model,
  keywords,
  title,
  category,
  condition,
  ebayConditionDescription,
  aspectValues,
  onBrandChange,
  onModelChange,
  onKeywordsChange,
  onTitleChange,
  onCategoryChange,
}: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const len = title.length;

  async function handleAiGenerate() {
    setIsAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/generate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: brand.trim() || null,
          model: model.trim() || null,
          condition: ebayConditionDescription ?? condition,
          keyAspects: aspectValues,
          keywords,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'AIタイトル生成に失敗しました。');
      }
      const data = (await res.json()) as { titles: string[] };
      setSuggestions(data.titles);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'AIタイトル生成に失敗しました。手入力または下のボタンで続行できます。',
      );
    } finally {
      setIsAiLoading(false);
    }
  }

  return (
    <section className="card">
      <div className="legend-row">
        <h2>5. タイトル</h2>
        <span className="hint">テンプレートの見出し(H1) / eBayタイトル欄に使用</span>
      </div>
      <p className="subnote">
        eBayの商品タイトル欄と、説明文HTMLの一番上に表示される大見出しの両方に使われます。ブランド・商品名を確認したら、下のボタンでタイトル候補を作成してください。
      </p>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="f-brand">ブランド</label>
          <input
            type="text"
            id="f-brand"
            value={brand}
            onChange={(e) => onBrandChange(e.target.value)}
            placeholder="例: Chiyozuru"
          />
        </div>
        <div className="field">
          <label htmlFor="f-model">商品名・型番</label>
          <input
            type="text"
            id="f-model"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="例: Oire Nomi 24mm Japanese Bench Chisel"
          />
        </div>
        <div className="field full">
          <label htmlFor="f-keywords">アピールしたいキーワード(カンマ区切り・任意)</label>
          <input
            type="text"
            id="f-keywords"
            value={keywords}
            onChange={(e) => onKeywordsChange(e.target.value)}
            placeholder="例: Hand Forged, Made in Japan"
          />
        </div>
      </div>

      {/* 2026-10-03: 「AIでタイトル候補を生成、はタイトル欄の先頭に来ないとおかしい」という
          指摘への対応。以前はこのボタンが欄の一番下(カテゴリー欄より後ろ)にあり、押すと
          上の方にあるタイトル欄が埋まるという逆向きの流れになっていた。ブランド・型番・
          キーワードを確認したら、その場でタイトル候補を作る→選ぶ→下のタイトル欄に反映、
          という自然な順番に合わせて、生成ボタンと候補一覧をタイトル欄の直前に移動した。 */}
      <div className="actions-row" style={{ marginTop: 2, flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn primary" onClick={handleAiGenerate} disabled={isAiLoading}>
          {isAiLoading ? 'AIがタイトルを作成中…' : 'AIでタイトル候補を生成'}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() =>
            setSuggestions(buildTitleCandidates({ brand, model, keywords, condition }))
          }
        >
          簡易候補を提案(AIを使わない)
        </button>
      </div>
      <p className="subnote">
        指示書§12: AIはブランド・型番・状態・Item Specifics・入力したキーワードなど、確認できている情報だけからタイトルを作成します(未確認の&quot;RARE&quot;や&quot;Vintage&quot;などは勝手に付け足しません)。AIが使えない場合は「簡易候補」ボタンでも続行できます。
      </p>
      {aiError && (
        <p className="subnote" style={{ color: '#c0392b', marginTop: 4 }}>
          {aiError}
        </p>
      )}
      {suggestions.length > 0 && (
        <div className="suggestion-list" style={{ marginTop: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="btn ghost"
              style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => onTitleChange(s.length > 80 ? s.slice(0, 80) : s)}
            >
              <span>{s}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                {s.length}/80
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="field-grid">
        <div className="field full">
          <label htmlFor="f-title">商品タイトル(eBay出品用・80文字まで)</label>
          <input
            type="text"
            id="f-title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
          />
          <p className="subnote" style={{ marginTop: 4 }}>
            {len} / 80文字
          </p>
        </div>
        <div className="field full">
          <label htmlFor="f-category">eBayカテゴリー(検索用キーワード・自由に編集できます)</label>
          <input
            type="text"
            id="f-category"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            placeholder="例: Chisels(eBayのカテゴリー検索欄に入力する言葉)"
          />
          <p className="subnote" style={{ marginTop: 4 }}>
            TODO(§37-38): eBay Taxonomy APIの実カテゴリーIDに置き換わり次第、この自由入力欄は廃止する。
          </p>
        </div>
      </div>
    </section>
  );
}
