'use client';

import type { GenreKey } from '@/types/listing';
import { GENRE_FIELDS, specificFieldKey } from '@/lib/listing/genreFields';

interface Props {
  genre: GenreKey;
  specifics: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

/**
 * !!! REMOVE予定(§39-42, §116) !!!
 * ジャンル固定フィールドの代わりに、カテゴリー確定後
 * GET /api/ebay/categories/:categoryId/aspects の結果から
 * required/recommended/optionalの動的フォームを生成する
 * (allowed valuesがあればSelect/Combobox優先, §42)。
 * AIによる入力候補補完(POST /api/ai/fill-aspects, §41)もここに統合する。
 */
export function SpecificsSection({ genre, specifics, onChange }: Props) {
  const def = genre ? GENRE_FIELDS[genre] : undefined;

  return (
    <section className="card" id="specifics-section">
      <div className="legend-row">
        <h2>7. 商品仕様(Item Specifics)</h2>
        <span className="hint">{def ? `ジャンル: ${def.label}` : 'ジャンル未選択'}</span>
      </div>
      <p className="subnote">
        0.で選んだジャンルに合わせて、よく使う入力欄がここに表示されます。入力すると、下のプレビューに「商品仕様」としてまとめて表示されるほか、説明文HTMLにも表(Specifications)として自動的に追加されます。
      </p>
      {!def && (
        <p className="subnote">
          上の「0. 商品ジャンルを選択」でジャンルを選ぶと、ここに入力欄が表示されます。
        </p>
      )}
      {def && (
        <div className="field-grid">
          {def.fields.map((f) => {
            const key = specificFieldKey(genre, f.id);
            return (
              <div className="field" key={key}>
                <label htmlFor={`spec-${key}`}>
                  {f.ja}({f.en})
                </label>
                <input
                  type="text"
                  id={`spec-${key}`}
                  value={specifics[key] ?? ''}
                  onChange={(e) => onChange(key, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
