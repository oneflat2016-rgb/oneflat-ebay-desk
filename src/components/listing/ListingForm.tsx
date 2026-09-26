'use client';

import { useCallback, useState, useTransition } from 'react';
import type { ConditionValue, GenreKey, ListingFormState } from '@/types/listing';
import type { EbayAspectDefinition } from '@/types/ebay';
import { createEmptyListingFormState } from '@/lib/listing/defaultState';
import { CATEGORY_PRESETS } from '@/lib/listing/genreFields';
import { saveListingDraft, type SaveListingIdentity } from '@/app/(app)/listings/new/actions';
import { publishListingToEbay } from '@/app/(app)/listings/new/publishActions';
import { ImagesSection } from './ImagesSection';
import { PricingSection } from './PricingSection';
import { AiAnalysisSection } from './AiAnalysisSection';
import { AiDescriptionDraftSection, type DescriptionDrafts } from './AiDescriptionDraftSection';
import { CategorySuggestSection } from './CategorySuggestSection';
import { GenreSection } from './GenreSection';
import { TitleSection } from './TitleSection';
import { ConditionSection } from './ConditionSection';
import { DynamicConditionSection } from './DynamicConditionSection';
import { BusinessPoliciesSection } from './BusinessPoliciesSection';
import { BilingualSection } from './BilingualSection';
import { SpecificsSection } from './SpecificsSection';
import { DynamicAspectsSection } from './DynamicAspectsSection';
import { ChecklistSection } from './ChecklistSection';
import { ColorTemplateSection } from './ColorTemplateSection';
import { PreviewPanel } from './PreviewPanel';

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'conflict'; target: 'product' | 'draft' }
  | { kind: 'error'; message: string };

type PublishStatus =
  | { kind: 'idle' }
  | { kind: 'publishing' }
  | { kind: 'published'; listingId: string }
  | { kind: 'error'; message: string };

/**
 * ebay-listing-desk.html のIIFE状態管理を、React state(useState)へ移植した
 * トップレベルのフォームコンテナ(Phase1-STEP1〜STEP3)。
 *
 * §110 step3: 「保存」ボタンでlisting_drafts/productsへDB保存する(手動保存)。
 * TODO(§80): 入力停止後1〜2秒のdebounceによる自動保存はまだ未実装。
 * §81: version列による楽観的排他制御は実装済み(他の人が先に保存していた場合、
 * conflictとして検知しUIに警告を出す)。
 * TODO(§30-31): ホーム画面 + STEP1(写真)/STEP2(出品情報)/STEP3(最終確認)の
 * ウィザードへ分割する。現状は単一フォーム(旧UIのまま)。
 */
export function ListingForm({
  initialState,
  initialIdentity,
  isAdmin = false,
}: {
  initialState: ListingFormState;
  initialIdentity?: SaveListingIdentity;
  isAdmin?: boolean;
}) {
  const [state, setState] = useState<ListingFormState>(initialState);
  const [identity, setIdentity] = useState<SaveListingIdentity>(
    initialIdentity ?? { productId: null, productVersion: null, draftId: null, draftVersion: null },
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [isSaving, startSaveTransition] = useTransition();
  const [publishStatus, setPublishStatus] = useState<PublishStatus>({ kind: 'idle' });
  const [isPublishing, startPublishTransition] = useTransition();
  // §39-42(§110 step7): 現在のカテゴリーに対応するeBay Aspect定義。
  // 保存時にstate.aspectValuesと突き合わせてrequired/usage/dataTypeを一緒に保存するために保持する。
  const [ebayAspects, setEbayAspects] = useState<EbayAspectDefinition[]>([]);

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

  function handleAspectValueChange(aspectName: string, values: string[]) {
    setState((prev) => ({ ...prev, aspectValues: { ...prev.aspectValues, [aspectName]: values } }));
  }

  function handleDescriptionDrafts(drafts: DescriptionDrafts) {
    setState((prev) => ({
      ...prev,
      about: { ...prev.about, ja: drafts.aboutJa },
      appearance: { ...prev.appearance, ja: drafts.appearanceJa },
      conditionDetail: { ...prev.conditionDetail, ja: drafts.conditionJa },
      includedItems: { ...prev.includedItems, ja: drafts.includedItemsJa },
    }));
  }

  function handleChecklistToggle(id: string) {
    setState((prev) => ({
      ...prev,
      checklist: { ...prev.checklist, [id]: !prev.checklist[id] },
    }));
  }

  function handleClear() {
    setState(createEmptyListingFormState());
    setIdentity({ productId: null, productVersion: null, draftId: null, draftVersion: null });
    setSaveStatus({ kind: 'idle' });
  }

  function handleSave() {
    setSaveStatus({ kind: 'saving' });
    startSaveTransition(async () => {
      const result = await saveListingDraft(identity, state, ebayAspects);
      if (!result.ok) {
        if (result.conflict) {
          setSaveStatus({ kind: 'conflict', target: result.conflict });
        } else if (result.error === 'not_authenticated') {
          setSaveStatus({ kind: 'error', message: 'ログインが必要です。ページを再読み込みしてください。' });
        } else {
          setSaveStatus({ kind: 'error', message: '保存に失敗しました。もう一度お試しください。' });
        }
        return;
      }
      if (result.identity) setIdentity(result.identity);
      setSaveStatus({ kind: 'saved', at: result.savedAt ?? new Date().toISOString() });
    });
  }

  /**
   * §70: Publishボタンは「保存 → Publish」を1操作で行う。
   * 直前の入力を必ずDBへ反映してからeBayへ送るため、まずsaveListingDraftを呼び、
   * 返ってきた最新identityでpublishListingToEbayを呼ぶ(保存に失敗した場合は
   * Publishへ進まない)。
   */
  function handlePublish() {
    setPublishStatus({ kind: 'publishing' });
    startPublishTransition(async () => {
      const saveResult = await saveListingDraft(identity, state, ebayAspects);
      if (!saveResult.ok || !saveResult.identity) {
        setPublishStatus({
          kind: 'error',
          message: '保存に失敗したため、Publishを中止しました。上の保存状況を確認してください。',
        });
        return;
      }
      setIdentity(saveResult.identity);
      setSaveStatus({ kind: 'saved', at: saveResult.savedAt ?? new Date().toISOString() });

      const publishResult = await publishListingToEbay(saveResult.identity, state);
      if (!publishResult.ok) {
        setPublishStatus({ kind: 'error', message: publishResult.error ?? 'Publishに失敗しました。' });
        return;
      }
      setPublishStatus({ kind: 'published', listingId: publishResult.listingId ?? '' });
    });
  }

  return (
    <div className="layout">
      <div className="form-col">
        <ImagesSection productId={identity.productId} />

        <AiAnalysisSection
          productId={identity.productId}
          onApplyBrand={(value) => patch({ brand: value })}
          onApplyModel={(value) => patch({ model: value })}
          onApplyKeywords={(value) =>
            setState((prev) => ({
              ...prev,
              keywords: prev.keywords ? `${prev.keywords} ${value}` : value,
            }))
          }
        />

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
          ebayConditionDescription={state.ebayConditionDescription}
          aspectValues={state.aspectValues}
          onBrandChange={(brand) => patch({ brand })}
          onModelChange={(model) => patch({ model })}
          onKeywordsChange={(keywords) => patch({ keywords })}
          onTitleChange={(title) => patch({ title })}
          onCategoryChange={(category) => patch({ category })}
          onCategoryPresetChange={(categoryPreset) =>
            patch({ categoryPreset, category: categoryPreset })
          }
        />

        <CategorySuggestSection
          categoryId={state.categoryId}
          categoryName={state.categoryName}
          defaultQuery={[state.model, state.brand].filter(Boolean).join(' ')}
          onSelect={({ categoryTreeId, categoryId, categoryName }) => {
            // カテゴリーが変わったら、旧カテゴリーのAspect/Condition定義・入力値をクリアする
            // (別カテゴリーの値を引き継がないため、§117-2/§117-4)。
            setEbayAspects([]);
            setState((prev) => ({
              ...prev,
              categoryTreeId,
              categoryId,
              categoryName,
              category: categoryName,
              aspectValues: {},
              ebayConditionId: null,
              ebayConditionDescription: null,
            }));
          }}
        />

        <DynamicAspectsSection
          categoryTreeId={state.categoryTreeId}
          categoryId={state.categoryId}
          categoryName={state.categoryName}
          values={state.aspectValues}
          onChange={handleAspectValueChange}
          onAspectsLoaded={setEbayAspects}
        />

        <DynamicConditionSection
          categoryId={state.categoryId}
          conditionId={state.ebayConditionId}
          onSelect={({ conditionId, conditionDescription }) =>
            patch({ ebayConditionId: conditionId, ebayConditionDescription: conditionDescription })
          }
        />

        <ConditionSection
          condition={state.condition}
          onChange={(condition: ConditionValue) => patch({ condition })}
        />

        <BusinessPoliciesSection
          fulfillmentPolicyId={state.fulfillmentPolicyId}
          paymentPolicyId={state.paymentPolicyId}
          returnPolicyId={state.returnPolicyId}
          merchantLocationKey={state.merchantLocationKey}
          isAdmin={isAdmin}
          onChange={(patchValue) => patch(patchValue)}
        />

        <PricingSection
          price={state.price}
          quantity={state.quantity}
          currency={state.currency}
          onChange={(patchValue) => patch(patchValue)}
        />

        <AiDescriptionDraftSection
          productType={state.categoryName || state.genre || null}
          confirmedAspects={Object.fromEntries(
            Object.entries(state.aspectValues)
              .filter(([, values]) => values.some((v) => v.trim()))
              .map(([name, values]) => [name, values.filter((v) => v.trim()).join(', ')]),
          )}
          conditionNotes={state.ebayConditionDescription ?? undefined}
          onDraftsGenerated={handleDescriptionDrafts}
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

        <div className="actions-row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '保存中…' : '保存'}
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            クリアして次の商品へ
          </button>
          <SaveStatusLabel status={saveStatus} />
        </div>

        <div className="actions-row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn primary"
            onClick={handlePublish}
            disabled={isPublishing || isSaving}
          >
            {isPublishing ? 'eBayへ出品しています…' : 'eBayへ出品する(Publish)'}
          </button>
          <PublishStatusLabel status={publishStatus} />
        </div>
      </div>

      <PreviewPanel state={state} />
    </div>
  );
}

/**
 * §81: 楽観的排他制御のconflict時は、上書き保存させず
 * 「他の人が更新しました」と明示する(§102: 無条件の上書き禁止)。
 */
function SaveStatusLabel({ status }: { status: SaveStatus }) {
  if (status.kind === 'idle') {
    return <span className="hint">まだ保存されていません</span>;
  }
  if (status.kind === 'saving') {
    return <span className="hint">保存しています…</span>;
  }
  if (status.kind === 'saved') {
    const time = new Date(status.at).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return <span className="hint" style={{ color: 'var(--accent)' }}>{time} に保存しました</span>;
  }
  if (status.kind === 'conflict') {
    return (
      <span className="hint" style={{ color: '#c0392b' }}>
        他の人がこの{status.target === 'product' ? '商品' : '出品情報'}を先に更新しました。ページを再読み込みしてから、もう一度編集してください。
      </span>
    );
  }
  return (
    <span className="hint" style={{ color: '#c0392b' }}>
      {status.message}
    </span>
  );
}

function PublishStatusLabel({ status }: { status: PublishStatus }) {
  if (status.kind === 'idle') {
    return <span className="hint">まだeBayへ出品していません</span>;
  }
  if (status.kind === 'publishing') {
    return <span className="hint">eBayへ送信しています…(完了まで数秒かかることがあります)</span>;
  }
  if (status.kind === 'published') {
    return (
      <span className="hint" style={{ color: 'var(--accent)' }}>
        eBayへ出品しました(Listing ID: {status.listingId})
      </span>
    );
  }
  return (
    <span className="hint" style={{ color: '#c0392b' }}>
      {status.message}
    </span>
  );
}
