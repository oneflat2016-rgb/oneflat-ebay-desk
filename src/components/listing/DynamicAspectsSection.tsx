'use client';

import { useEffect, useState } from 'react';
import type { EbayAspectDefinition } from '@/types/ebay';

/**
 * §39-42(§110 step7): eBay Taxonomy APIから取得したItem Specifics(Aspect)の
 * 動的入力フォーム。GENRE_FIELDSのようなジャンル固定配列は使わない(§40)。
 * - SELECTION_ONLY(候補値以外の入力を許さない, §42) + 候補ありなら選択式にする
 *   (cardinality=MULTIならチェックボックス、SINGLEならプルダウン)。
 * - それ以外(FREE_TEXT)はテキスト入力。候補があれば入力補助として下に表示する。
 * §117-2: 表示する候補値・項目名はすべてeBayのレスポンスに由来する(ハードコードしない)。
 */
export function DynamicAspectsSection({
  categoryTreeId,
  categoryId,
  categoryName,
  values,
  onChange,
  onAspectsLoaded,
}: {
  categoryTreeId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  values: Record<string, string[]>;
  onChange: (aspectName: string, values: string[]) => void;
  onAspectsLoaded: (aspects: EbayAspectDefinition[]) => void;
}) {
  const [aspects, setAspects] = useState<EbayAspectDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: 'warn' | 'err' | '' }>({
    text: '',
    kind: '',
  });

  useEffect(() => {
    if (!categoryTreeId || !categoryId) {
      setAspects([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setStatus({ text: '', kind: '' });
    fetch(
      `/api/ebay/aspects?categoryTreeId=${encodeURIComponent(categoryTreeId)}&categoryId=${encodeURIComponent(
        categoryId,
      )}`,
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ aspects: EbayAspectDefinition[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setAspects(data.aspects);
        onAspectsLoaded(data.aspects);
        if (data.aspects.length === 0) {
          setStatus({ text: 'このカテゴリーにはeBay側の入力項目が登録されていません。', kind: 'warn' });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setAspects([]);
        setStatus({
          text:
            '商品仕様(Item Specifics)の項目が取得できませんでした。カテゴリーを選び直すか、あとでもう一度お試しください。' +
            (err instanceof Error ? ` (${err.message})` : ''),
          kind: 'err',
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryTreeId, categoryId]);

  return (
    <section className="card" id="dynamic-aspects-section">
      <div className="legend-row">
        <h2>7. 商品仕様(Item Specifics・eBayカテゴリー連動)</h2>
        <span className="hint">
          {categoryName ? `カテゴリー: ${categoryName}` : '1.5.でeBayカテゴリーを選択してください'}
        </span>
      </div>
      <p className="subnote">
        1.5.で選んだeBayカテゴリーに合わせて、eBayが実際に要求・推奨している入力項目がここに表示されます(赤い「必須」はeBay側で入力必須の項目です)。
      </p>

      {!categoryTreeId || !categoryId ? (
        <p className="subnote">上の「1.5. eBayカテゴリー候補」でカテゴリーを選択すると、ここに入力欄が表示されます。</p>
      ) : loading ? (
        <p className="subnote">項目を読み込んでいます…</p>
      ) : (
        <>
          {status.text && (
            <p className="subnote" style={{ color: status.kind === 'err' ? 'var(--danger)' : undefined }}>
              {status.text}
            </p>
          )}
          {aspects.length > 0 && (
            <div className="field-grid">
              {aspects.map((aspect) => (
                <AspectField
                  key={aspect.aspectName}
                  aspect={aspect}
                  value={values[aspect.aspectName] ?? []}
                  onChange={(v) => onChange(aspect.aspectName, v)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AspectField({
  aspect,
  value,
  onChange,
}: {
  aspect: EbayAspectDefinition;
  value: string[];
  onChange: (values: string[]) => void;
}) {
  const inputId = `aspect-${aspect.aspectName.replace(/\s+/g, '-')}`;
  const label = (
    <label htmlFor={inputId}>
      {aspect.aspectName}
      {aspect.required && (
        <span style={{ color: 'var(--danger, #c0392b)', marginLeft: 4 }} aria-label="必須">
          *必須
        </span>
      )}
      {!aspect.required && aspect.usage === 'RECOMMENDED' && (
        <span className="hint" style={{ marginLeft: 4 }}>
          (推奨)
        </span>
      )}
    </label>
  );

  const isSelectionOnly = aspect.aspectMode === 'SELECTION_ONLY' && !!aspect.allowedValues?.length;
  const isMulti = aspect.cardinality === 'MULTI';

  if (isSelectionOnly && isMulti) {
    // MULTI + 選択式: チェックボックス一覧(候補以外の値は入力させない, §42)
    return (
      <div className="field full">
        {label}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 4 }}>
          {aspect.allowedValues!.map((v) => {
            const checked = value.includes(v);
            return (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 'normal' }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...value, v]);
                    else onChange(value.filter((x) => x !== v));
                  }}
                />
                {v}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  if (isSelectionOnly) {
    // SINGLE + 選択式: プルダウン
    return (
      <div className="field">
        {label}
        <select id={inputId} value={value[0] ?? ''} onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}>
          <option value="">-- 選択してください --</option>
          {aspect.allowedValues!.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // FREE_TEXT: テキスト入力(候補があれば入力補助のdatalistとして表示)
  const listId = aspect.allowedValues?.length ? `${inputId}-list` : undefined;
  return (
    <div className="field">
      {label}
      <input
        type="text"
        id={inputId}
        value={value[0] ?? ''}
        list={listId}
        onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
      />
      {listId && (
        <datalist id={listId}>
          {aspect.allowedValues!.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}
    </div>
  );
}
