'use client';

import { useEffect, useRef, useState } from 'react';
import type { EbayCategorySuggestion } from '@/types/ebay';

/**
 * §37-38(§110 step6): eBay Taxonomy APIによるカテゴリー候補の検索・選択。
 * ブランドが特定できない商品でも、商品種別(productType)などのキーワードで
 * カテゴリーを絞り込めるようにする(ブランド不明品への対応)。
 * §117-2: カテゴリーはハードコードせず、必ずeBayから返ってきた候補のみを選択できる。
 *
 * 2026-10-04: 「ここは入力せずに、3(タイトル作成)に入力した情報から判断できるのでは？
 * 簡素化して」という指摘への対応。
 * これまでは検索キーワードを毎回手入力してボタンを押す必要があったが、タイトル欄
 * (ブランド・型番・キーワード・タイトル)の内容が変わるたびに自動で検索するようにし、
 * 手入力・ボタン操作を無くした。手入力欄は、自動検索の結果が合わない場合の
 * 上書き用として残す。
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
  const [status, setStatus] = useState<{ text: string; kind: 'warn' | 'err' | 'ok' | '' }>({
    text: '',
    kind: '',
  });
  // ユーザーが手入力欄を一度でも手動編集したら、以降はdefaultQueryの変化による
  // 自動上書き・自動再検索を止める(手動編集を優先する)。
  const userEditedRef = useRef(false);
  const lastAutoSearchedRef = useRef<string>('');

  async function handleSearch(q: string) {
    if (!q.trim()) {
      setStatus({ text: '検索キーワードを入力してください(例: 商品種別・型番など)。', kind: 'warn' });
      return;
    }
    setLoading(true);
    setStatus({ text: '', kind: '' });
    try {
      const res = await fetch(`/api/ebay/categories/suggest?q=${encodeURIComponent(q)}`);
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
          'カテゴリー候補が取得できませんでした。下の入力欄で手入力を続けてください。' +
          (err instanceof Error ? ` (${err.message})` : ''),
        kind: 'err',
      });
    } finally {
      setLoading(false);
    }
  }

  // defaultQuery(タイトル欄の内容)が変わるたびに、1.2秒入力が止まったら自動検索する。
  // すでにカテゴリーが選択済みの間、またはユーザーが手入力欄を編集した後は自動実行しない。
  useEffect(() => {
    if (categoryId) return;
    if (userEditedRef.current) return;
    const next = (defaultQuery ?? '').trim();
    if (!next || next === lastAutoSearchedRef.current) return;
    setQuery(next);
    const timer = setTimeout(() => {
      lastAutoSearchedRef.current = next;
      handleSearch(next);
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultQuery, categoryId]);

  return (
    <section className="card">
      <div className="legend-row">
        <h2 style={{ fontSize: '1.05rem' }}>3. eBayカテゴリー候補(Taxonomy API)</h2>
        <span className="hint">5のタイトル作成の内容から自動検索されます</span>
      </div>
      <p className="subnote">
        5(タイトル作成)のブランド・型番・キーワードや、2(AI解析)で取得した情報から、eBayの実カテゴリーを自動検索します。候補が違う場合だけ、下の欄で検索キーワードを書き換えてください。
      </p>

      {categoryId && categoryName && (
        <div
          role="status"
          style={{
            marginBottom: 10,
            padding: '10px 12px',
            border: '2px solid var(--accent, #2e7d32)',
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          ✓ 選択済み: {categoryName}
          <span className="hint" style={{ marginLeft: 6, fontWeight: 400 }}>
            (Category ID: {categoryId})
          </span>
        </div>
      )}

      <div className="actions-row" style={{ gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            userEditedRef.current = true;
            setQuery(e.target.value);
          }}
          placeholder="例: wristwatch, kitchen knife"
          style={{ flex: 1 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSearch(query);
            }
          }}
        />
        <button type="button" className="btn" onClick={() => handleSearch(query)} disabled={loading}>
          {loading ? '検索中…' : '再検索'}
        </button>
      </div>

      {status.text && (
        <p
          className="subnote"
          style={{
            marginTop: 8,
            color: status.kind === 'err' ? 'var(--danger)' : undefined,
            fontWeight: status.kind === 'ok' ? 600 : undefined,
          }}
        >
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
              style={{
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                ...(s.category.categoryId === categoryId ? { borderColor: 'var(--accent, #2e7d32)', borderWidth: 2 } : {}),
              }}
              onClick={() => {
                onSelect({
                  categoryTreeId: s.category.categoryTreeId,
                  categoryId: s.category.categoryId,
                  categoryName: s.category.categoryName,
                });
                // 選択したら候補一覧を閉じ、選択結果が分かるメッセージを出す
                setSuggestions([]);
                setStatus({ text: `「${s.category.categoryName}」を選択しました。変える場合は「再検索」を押してください。`, kind: 'ok' });
              }}
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
