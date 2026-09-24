'use client';

import { useCallback, useState } from 'react';
import type { ConditionValue, GenreKey, ListingFormState } from '@/types/listing';
import { createEmptyListingFormState } from '@/lib/listing/defaultState';
import { CATEGORY_PRESETS } from '@/lib/listing/genreFields';
import { GenreSection } from './GenreSection';
import { TitleSection } from './TitleSection';
import { ConditionSection } from './ConditionSection';
import { BilingualSection } from './BilingualSection';
import { SpecificsSection } from './SpecificsSection';
import { ChecklistSection } from './ChecklistSection';
import { ColorTemplateSection } from './ColorTemplateSection';
import { PreviewPanel } from './PreviewPanel';

/**
 * ebay-listing-desk.html のIIFE状態管理を、React state(useState)へ移植した
 * トップレベルのフォームコンテナ(Phase1-STEP1)。
 *
 * TODO(§80-82): 入力停止後1〜2秒のdebounceでlisting_draftsへ自動保存し、
 * version列による楽観的排他制御を行う(現状はクライアント内state保持のみ)。
 * TODO(§30-31): ホーム画面 + STEP1(写真)/STEP2(出品情報)/STEP3(最終確認)の
 * ウィザードへ分割する。現状は単一フォーム(旧UIのまま)。
 */
export function ListingForm({ initialState }: { initialState: ListingFormState }) {
  const [state, setState] = useState<ListingFormState>(initialState);

  const patch = useCallback((partial: Partial<ListingFormState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  function handleGenreChange(genre: GenreKey) {
    setState((prev) => {
      const presets = genre ? CATEGORY_PRESETS[genre] : undefined;
      return {
        ...prev,
        genre,
        category: presets?.[0] ?? prev.category,
      };
    });
  }

  function handleSpecificChange(key: string, value: string) {
    setState((prev) => ({ ...prev, specifics: { ...prev.specifics, [key]: value } }));
  }

  function handleChecklistToggle(id: string) {
    setState((prev) => ({
      ...prev,
      checklist: { ...prev.checklist, [id]: !prev.checklist[id] },
    }));
  }

  function handleClear() {
    setState(createEmptyListingFormState());
  }

  return (
    <div className="layout">
      <div className="form-col">
        <ColorTemplateSection
          colors={state.templateColors}
          onChange={(templateColors) => patch({ templateColors })}
        />

        <GenreSection genre={state.genre} onChange={handleGenreChange} />

        <TitleSection
          genre={state.genre}
          brand={state.brand}
          model={state.model}
          keywords={state.keywords}
          title={state.title}
          category={state.category}
          categoryPreset={state.categoryPreset}
          condition={state.condition}
          onBrandChange={(brand) => patch({ brand })}
          onModelChange={(model) => patch({ model })}
          onKeywordsChange={(keywords) => patch({ keywords })}
          onTitleChange={(title) => patch({ title })}
          onCategoryChange={(category) => patch({ category })}
          onCategoryPresetChange={(categoryPreset) =>
            patch({ categoryPreset, category: categoryPreset })
          }
        />

        <ConditionSection
          condition={state.condition}
          onChange={(condition: ConditionValue) => patch({ condition })}
        />

        <BilingualSection
          sectionNumber={3}
          heading="About This Item(商品について)"
          hint="1行 = 1項目・空欄なら省略"
          description="状態や見た目以外で伝えたい、商品の特徴やアピールポイントを書く欄です。"
          value={state.about}
          onChange={(about) => patch({ about })}
          idPrefix="about"
        />

        <BilingualSection
          sectionNumber={4}
          heading="Appearance(見た目・外観)"
          hint="1行 = 1項目・空欄なら省略"
          description="傷・汚れ・色あせなど、見た目に関する情報を書く欄です。"
          value={state.appearance}
          onChange={(appearance) => patch({ appearance })}
          idPrefix="appearance"
        />

        <BilingualSection
          sectionNumber={5}
          heading="Condition(状態の詳細説明)"
          hint="1行 = 1項目・空欄なら省略"
          description="動作確認の結果など、状態について詳しく説明する文章です。"
          value={state.conditionDetail}
          onChange={(conditionDetail) => patch({ conditionDetail })}
          idPrefix="condition-detail"
        />

        <BilingualSection
          sectionNumber={6}
          heading="Included Items(付属品)"
          hint="1行 = 1項目・空欄なら省略"
          description="本体以外に一緒にお届けするもの(箱・説明書・付属品など)を書く欄です。"
          value={state.includedItems}
          onChange={(includedItems) => patch({ includedItems })}
          idPrefix="included"
        />

        <SpecificsSection
          genre={state.genre}
          specifics={state.specifics}
          onChange={handleSpecificChange}
        />

        <section className="card">
          <div className="legend-row">
            <h2 style={{ fontSize: '1.05rem' }}>
              Shipping / Importer&apos;s Obligation(発送・関税について)
            </h2>
            <span className="hint">固定(TODO: §50で条件連動化)</span>
          </div>
          <p className="subnote">
            この2セクションはいつものテンプレート文をそのまま使用しています。TODO(§50):
            実際に適用している配送条件と一致する場合だけ表示するよう変更し、管理画面からテンプレート編集できるようにする。
          </p>
        </section>

        <ChecklistSection checklist={state.checklist} onToggle={handleChecklistToggle} />

        <div className="actions-row">
          <button type="button" className="btn" onClick={handleClear}>
            クリアして次の商品へ
          </button>
        </div>
      </div>

      <PreviewPanel state={state} />
    </div>
  );
}
