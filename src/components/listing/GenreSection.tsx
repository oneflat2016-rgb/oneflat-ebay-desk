'use client';

import type { GenreKey } from '@/types/listing';
import { GENRE_FIELDS } from '@/lib/listing/genreFields';

const GENRE_OPTIONS: { value: GenreKey; label: string }[] = [
  { value: '', label: '選択しない(自由入力のまま進める)' },
  { value: 'chisel', label: '刃物・大工道具(鑿・鉋・工具など)' },
  { value: 'character', label: 'キャラクターグッズ(ぬいぐるみ・フィギュア・キーホルダーなど)' },
  { value: 'clothing', label: '衣類・ファッション' },
  { value: 'jewelry', label: 'ジュエリー・アクセサリー' },
  { value: 'cosmetics', label: 'コスメ・石鹸' },
  { value: 'food', label: '食品・日用消耗品' },
];

/**
 * TODO(§37-40): このジャンル選択は暫定UI。
 * 将来はeBay Taxonomy APIのカテゴリー候補選択(CategorySection)に置き換わる。
 *
 * 2026-10-03: 以前はこの欄がフォーム最初の「0.」で、タイトルも何も入れていない
 * うちに手動で選ぶ必要があった。いまは1.のタイトル入力の後ろに移動し、
 * タイトル・ブランド・キーワードの内容から自動でジャンルが提案される
 * (ListingForm.tsxのuseEffect参照)。多くの場合、ここで手動選択する必要はない。
 */
export function GenreSection({
  genre,
  onChange,
}: {
  genre: GenreKey;
  onChange: (genre: GenreKey) => void;
}) {
  const currentLabel = genre ? GENRE_FIELDS[genre]?.label : undefined;

  return (
    <section className="card" id="genre-section">
      <div className="legend-row">
        <h2>4. 商品ジャンル(タイトルから自動提案)</h2>
        <span className="hint">タイトルの内容から自動で選ばれます・変更できます</span>
      </div>
      <p className="subnote">
        上の「3. タイトル」に入力した内容から、商品ジャンルが自動で提案されます。提案が違う場合や、当てはまるジャンルがない場合はここで選び直してください(「選択しない」のままでも出品できます)。ここで選んだジャンルは、下の「5. eBayカテゴリー候補」の参考候補として使われます。
      </p>
      <div className="field-grid">
        <div className="field full">
          <label htmlFor="f-genre">商品ジャンル</label>
          <select
            id="f-genre"
            value={genre}
            onChange={(e) => onChange(e.target.value as GenreKey)}
          >
            {GENRE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {currentLabel && (
        <p className="subnote" style={{ marginTop: 4 }}>
          選択中: {currentLabel}
        </p>
      )}
    </section>
  );
}
