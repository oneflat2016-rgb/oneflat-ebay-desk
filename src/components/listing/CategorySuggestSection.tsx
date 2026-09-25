'use client';

import { useState } from 'react';
import type { EbayCategorySuggestion } from '@/types/ebay';

/**
 * §37-38(§110 step6): eBay Taxonomy APIによるカテゴリー候補の検索・選択。
 * ブランドが特定できない商品でも、商品種別(productType)などのキーワードで
 * カテゴリーを絞り込めるようにする(ブランド不明品への対応)。
 * §117-2: カテゴリーはハードコードせず、必ずeBayから返ってきた候補のみを選択できる。
 */
export function CategorySuggestSection({
  categoryId,
  categoryName,
  onSelect,
  defaultQuery,
}: {
  categoryId: string | null;
  categoryName: string | null;
  onSelect: (category: { categoryTreeId: string; categoryId: string; categoryName: string }) => void;
  defaultQuery?: string;
}) {
  const [query, setQuery] = useState(defaultQuery ?? '');
  const [suggestions, setSuggestions] = useState<EbayCategorySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: 'warn' | 'err' | '' }>({
    text: '',
    kind: '',
  });

  async function handleSearch() {
    if (!query.trim()) {
      setStatus({ text: '検索キーワードを入力してください(例: 商品種別・型番など)。', kind: 'warn' });
      return;
    }
    setLoading(true);
    setStatus({ text: '', kind: '' });
    try {
      const res = await fetch(`/api/ebay/categories/suggest?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { suggestions: EbayCategorySuggestion[] };
      setSuggestions(data.suggestions);
      if (data.suggestions.length === 0) {
        setStatus({ text: '該当するカテゴリーが見つかりませんでした。別のキーワードでお試しください。', kind: 'warn' });
      }
    } catch (err) {
      setStatus({
        text:
          'カテゴリー候補が取得できませんでした。下の自由入力欄に手入力を続けてください。' +
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
        <h2 style={{ fontSize: '1.05rem' }}>1.5. eBayカテゴリー候補(Taxonomy API)</h2>
        <span className="hint">ブランドが分からない商品でも種別から検索できます</span>
      </div>
      <p className="subnote">
        英語のキーワード(商品種別・型番など)を入れて検索すると、eBayの実カテゴリーを検索できます。
      </p>

      {categoryId && categoryName && (
        <p className="subnote" style={{ marginBottom: 8 }}>
          現在選択中: <strong>{categoryName}</strong>
          <span className="hint" style={{ marginLeft: 6 }}>
            (Category ID: {categoryId})
          </span>
        </p>
      )}

      <div className="actions-row" style={{ gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例: wristwatch, kitchen knife"
          style={{ flex: 1 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSearch();
            }
          }}
        />
        <button type="button" className="btn" onClick={handleSearch} disabled={loading}>
          {loading ? '検索中…' : '候補を検索'}
        </button>
      </div>

      {status.text && (
        <p className="subnote" style={{ marginTop: 8, color: status.kind === 'err' ? 'var(--danger)' : undefined }}>
          {status.text}
        </p>
      )}

      {suggestions.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {suggestions.map((s) => (
            <button
              key={s.category.categoryId}
              type="button"
              className="btn ghost"
              style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
              onClick={() =>
                onSelect({
                  categoryTreeId: s.category.categoryTreeId,
                  categoryId: s.category.categoryId,
                  categoryName: s.category.categoryName,
                })
              }
            >
              <span>{s.category.categoryName}</span>
              <span className="hint" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                #{s.category.categoryId}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
