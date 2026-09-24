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
        <h2>0. 商品ジャンルを選択</h2>
        <span className="hint">最初に選ぶと下の項目が自動で切り替わります</span>
      </div>
      <p className="subnote">
        出品する商品のジャンルを選んでください。ここで選んだジャンルに合わせて、1.の「eBayカテゴリー候補」と、7.の「商品仕様」入力欄が自動で切り替わります。当てはまるジャンルがなければ「選択しない」のままで大丈夫です。
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
