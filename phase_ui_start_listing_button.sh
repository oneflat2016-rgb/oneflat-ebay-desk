#!/bin/bash
set -euo pipefail
cd "$HOME/oneflat-ebay-desk"

mkdir -p "src/components/listing"
cat > "src/components/listing/ListingForm.tsx" << 'ONEFLAT_EOF_UI_0'
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
import { PrelistingAiCheckSection, type PrelistingCheckInput } from './PrelistingAiCheckSection';
import { ColorTemplateSection } from './ColorTemplateSection';
import { SimilarSalesSection } from './SimilarSalesSection';
import { AiPriceSuggestionSection } from './AiPriceSuggestionSection';
import { ProfitSimulationSection } from './ProfitSimulationSection';
import { ShippingSuggestionSection } from './ShippingSuggestionSection';
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
        {/* §110 step3 追加: ページ上部にも同じ「出品を開始する」ボタンを置く。
            下までスクロールしなくても、最初に押すべき操作がすぐ見つかるようにする。 */}
        <div className="actions-row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '出品を開始しています…' : '出品を開始する'}
          </button>
          <SaveStatusLabel status={saveStatus} />
        </div>

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

        <SimilarSalesSection
          brand={state.brand || null}
          model={state.model || null}
          categoryName={state.categoryName || null}
        />

        <AiPriceSuggestionSection
          brand={state.brand || null}
          model={state.model || null}
          condition={state.ebayConditionDescription ?? null}
          categoryName={state.categoryName || null}
          onApplyPrice={(price) => patch({ price })}
        />

        <PricingSection
          price={state.price}
          quantity={state.quantity}
          currency={state.currency}
          onChange={(patchValue) => patch(patchValue)}
        />

        <ProfitSimulationSection
          price={state.price}
          quantity={state.quantity}
          costPriceJpy={state.costPriceJpy}
          onCostPriceChange={(costPriceJpy) => patch({ costPriceJpy })}
        />

        <ShippingSuggestionSection
          weightG={state.weightG}
          widthMm={state.widthMm}
          heightMm={state.heightMm}
          depthMm={state.depthMm}
          destinationCountry={state.destinationCountry}
          brand={state.brand || null}
          model={state.model || null}
          categoryName={state.categoryName || null}
          price={state.price}
          selectedShippingMethod={state.selectedShippingMethod}
          fulfillmentPolicyId={state.fulfillmentPolicyId}
          onWeightSizeChange={(patchValue) => patch(patchValue)}
          onDestinationChange={(destinationCountry) => patch({ destinationCountry })}
          onSelectShippingMethod={(selectedShippingMethod) => patch({ selectedShippingMethod })}
          onSelectFulfillmentPolicy={(fulfillmentPolicyId) => patch({ fulfillmentPolicyId })}
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

        <PrelistingAiCheckSection
          getInput={(): PrelistingCheckInput => ({
            productId: identity.productId,
            title: state.title,
            brand: state.brand || null,
            model: state.model || null,
            categoryId: state.categoryId,
            ebayConditionId: state.ebayConditionId,
            conditionDetailJa: state.conditionDetail.ja,
            conditionDetailEn: state.conditionDetail.en,
            aboutEn: state.about.en,
            appearanceEn: state.appearance.en,
            includedItemsEn: state.includedItems.en,
            fulfillmentPolicyId: state.fulfillmentPolicyId,
            paymentPolicyId: state.paymentPolicyId,
            returnPolicyId: state.returnPolicyId,
            merchantLocationKey: state.merchantLocationKey,
            price: state.price,
          })}
        />

        <div className="actions-row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '出品を開始しています…' : '出品を開始する'}
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
    return <span className="hint">まだ出品を開始していません</span>;
  }
  if (status.kind === 'saving') {
    return <span className="hint">出品情報を保存しています…</span>;
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
ONEFLAT_EOF_UI_0
echo "[OK] wrote src/components/listing/ListingForm.tsx"

mkdir -p "src/components/listing"
cat > "src/components/listing/ImagesSection.tsx" << 'ONEFLAT_EOF_UI_1'
'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  deleteProductImage,
  listProductImages,
  uploadProductImage,
} from '@/app/(app)/listings/new/actions';
import type { ProductImageWithUrl } from '@/repositories/productImages';

/**
 * §110 step4: スマホ/PCから商品写真を撮影・選択してアップロードするセクション。
 * まだ「出品を開始する」を一度も押していない(productIdが無い)間はアップロードできない
 * (product_imagesはproductsに外部キーで紐づくため)。
 * `accept="image/*"` のみでcapture属性は付けていない
 * (スマホでは「写真を撮る/ライブラリから選ぶ」の選択肢が出て、PCでは通常のファイル選択になる)。
 */
export function ImagesSection({ productId }: { productId: string | null }) {
  const [images, setImages] = useState<ProductImageWithUrl[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!productId) {
      setImages([]);
      return;
    }
    setIsLoading(true);
    listProductImages(productId)
      .then((rows) => setImages(rows))
      .catch(() => setError('画像一覧の取得に失敗しました。'))
      .finally(() => setIsLoading(false));
  }, [productId]);

  function handleFilesSelected(fileList: FileList | null) {
    if (!productId || !fileList || fileList.length === 0) return;
    setError(null);
    const files = Array.from(fileList);

    startUpload(async () => {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const result = await uploadProductImage(productId, formData);
        if (!result.ok || !result.image) {
          if (result.error === 'too_large') {
            setError(`「${file.name}」は8MBを超えているためアップロードできません。`);
          } else if (result.error === 'invalid_type') {
            setError(`「${file.name}」は画像ファイルではありません。`);
          } else {
            setError('アップロードに失敗しました。もう一度お試しください。');
          }
          continue;
        }
        setImages((prev) => [...prev, result.image as ProductImageWithUrl]);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  }

  function handleDelete(imageId: string) {
    startUpload(async () => {
      const result = await deleteProductImage(imageId);
      if (result.ok) {
        setImages((prev) => prev.filter((img) => img.id !== imageId));
      } else {
        setError('削除に失敗しました。もう一度お試しください。');
      }
    });
  }

  return (
    <section className="card">
      <div className="legend-row">
        <h2 style={{ fontSize: '1.05rem' }}>0. 商品写真</h2>
        <span className="hint">複数角度から撮影してください</span>
      </div>

      {!productId ? (
        <p className="subnote">
          写真を追加するには、先に「出品を開始する」ボタンを1回押して商品を登録してください(登録後にこの欄が使えるようになります)。
        </p>
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={isUploading}
            onChange={(e) => handleFilesSelected(e.target.files)}
            style={{ marginBottom: 12 }}
          />

          {isLoading && <p className="subnote">読み込み中…</p>}
          {error && (
            <p className="subnote" style={{ color: '#c0392b' }}>
              {error}
            </p>
          )}

          {images.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                gap: 10,
                marginTop: 10,
              }}
            >
              {images.map((img) => (
                <div key={img.id} style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URLは動的なのでnext/imageの最適化対象外 */}
                  <img
                    src={img.url}
                    alt=""
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: img.isPrimary ? '2px solid var(--accent)' : '1px solid var(--line)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleDelete(img.id)}
                    disabled={isUploading}
                    aria-label="削除"
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      background: 'rgba(0,0,0,.65)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: 22,
                      height: 22,
                      lineHeight: '20px',
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
ONEFLAT_EOF_UI_1
echo "[OK] wrote src/components/listing/ImagesSection.tsx"

mkdir -p "src/components/listing"
cat > "src/components/listing/AiAnalysisSection.tsx" << 'ONEFLAT_EOF_UI_2'
'use client';

import { useState } from 'react';
import type { ProductAnalysis } from '@/types/ai';

/**
 * §34-36: 「AIで解析」ボタン。アップロード済みの商品写真をClaude APIへ送り、
 * ブランド・型番・商品種別等の候補を取得する。
 * §34: Claudeは不明な項目をnullで返す設計のため、valueが無い項目は「不明」と表示する。
 * §100: AIが使えなくても(未設定・エラー時)手入力を止めない — 失敗してもフォームは
 * そのまま使える。
 * 取得した候補は自動反映せず、フィールドごとに「適用」ボタンを押した分だけ反映する
 * (§102: 無条件の自動上書きをしない)。
 */
export function AiAnalysisSection({
  productId,
  onApplyBrand,
  onApplyModel,
  onApplyKeywords,
}: {
  productId: string | null;
  onApplyBrand: (value: string) => void;
  onApplyModel: (value: string) => void;
  onApplyKeywords: (value: string) => void;
}) {
  const [note, setNote] = useState('');
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: 'warn' | 'err' | 'ok' | '' }>({
    text: '',
    kind: '',
  });
  const [loading, setLoading] = useState(false);

  async function handleAnalyze() {
    if (!productId) {
      setStatus({ text: '先に「出品を開始する」を1回押して商品を登録してください。', kind: 'warn' });
      return;
    }
    setLoading(true);
    setStatus({ text: '', kind: '' });
    try {
      const res = await fetch('/api/ai/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, note: note || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { analysis: ProductAnalysis; cached: boolean };
      setAnalysis(data.analysis);
      setStatus({
        text: data.cached ? '前回と同じ写真のため、保存済みの解析結果を表示しています。' : '解析が完了しました。',
        kind: 'ok',
      });
    } catch (err) {
      setStatus({
        text:
          'AI解析が利用できませんでした。お手数ですが手入力をお願いします。' +
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
        <h2 style={{ fontSize: '1.05rem' }}>0.5. AIによる商品解析</h2>
        <span className="hint">写真からブランド・型番などを推定(任意)</span>
      </div>

      {!productId ? (
        <p className="subnote">
          解析するには、先に写真をアップロードしてください(その前に「出品を開始する」を1回押して商品を登録する必要があります)。
        </p>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 10 }}>
            <span className="lang-tag">補足メモ(任意・日本語でOK)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: 箱に「○○」と書いてあった、など写真だけでは伝わりにくい情報があれば"
              rows={2}
            />
          </div>

          <button type="button" className="btn" onClick={handleAnalyze} disabled={loading}>
            {loading ? '解析中…' : 'AIで解析する'}
          </button>

          {status.text && (
            <p
              className="subnote"
              style={{
                marginTop: 8,
                color:
                  status.kind === 'err' ? 'var(--danger)' : status.kind === 'ok' ? 'var(--accent)' : undefined,
              }}
            >
              {status.text}
            </p>
          )}

          {analysis && (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <GuessRow
                label="ブランド"
                guess={analysis.brand}
                onApply={() => analysis.brand.value && onApplyBrand(analysis.brand.value)}
              />
              <GuessRow
                label="型番・モデル"
                guess={analysis.model}
                onApply={() => analysis.model.value && onApplyModel(analysis.model.value)}
              />
              <GuessRow label="MPN" guess={analysis.mpn} />
              <GuessRow
                label="商品種別"
                guess={analysis.productType}
                onApply={() => analysis.productType.value && onApplyKeywords(analysis.productType.value)}
              />

              {analysis.visibleText.length > 0 && (
                <p className="subnote">写真中の文字: {analysis.visibleText.join(' / ')}</p>
              )}
              {analysis.includedItems.length > 0 && (
                <p className="subnote">写真から確認できる付属品: {analysis.includedItems.join(' / ')}</p>
              )}
              {analysis.unknownFields.length > 0 && (
                <p className="subnote">AIが特定できなかった項目: {analysis.unknownFields.join(' / ')}</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function GuessRow({
  label,
  guess,
  onApply,
}: {
  label: string;
  guess: ProductAnalysis['brand'];
  onApply?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="lang-tag" style={{ minWidth: 90 }}>
        {label}
      </span>
      {guess.value ? (
        <>
          <span>
            {guess.value}
            <span className="hint" style={{ marginLeft: 6 }}>
              (確信度 {Math.round(guess.confidence * 100)}%)
            </span>
          </span>
          {onApply && (
            <button type="button" className="btn ghost" onClick={onApply}>
              適用
            </button>
          )}
        </>
      ) : (
        <span className="hint">不明(写真からは判断できませんでした)</span>
      )}
    </div>
  );
}
ONEFLAT_EOF_UI_2
echo "[OK] wrote src/components/listing/AiAnalysisSection.tsx"

mkdir -p "src/app/(app)/listings/new"
cat > "src/app/(app)/listings/new/publishActions.ts" << 'ONEFLAT_EOF_UI_3'
'use server';

import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import * as productsRepo from '@/repositories/products';
import * as listingsRepo from '@/repositories/listings';
import * as productImagesRepo from '@/repositories/productImages';
import * as auditRepo from '@/repositories/audit';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { createOrReplaceInventoryItem, createOffer, publishOffer } from '@/services/ebay/inventory';
import { assertValidSku } from '@/lib/sku/skuStrategy';
import { mapConditionIdToEnum } from '@/lib/ebay/conditionEnumMap';
import { buildDescriptionHtml } from '@/lib/listing/templateHtml';
import type { ListingFormState } from '@/types/listing';
import type { SaveListingIdentity } from './actions';

/**
 * §66-71, §76(§110 step11): 出品下書きを実際にeBayへPublishする。
 * §67, §70: 以下の順序を厳守する。
 *   1. Validation(必須項目 + SKU)
 *   2. status=PUBLISHINGへロック(二重出品防止)
 *   3. 画像準備(署名付きURL)
 *   4. createOrReplaceInventoryItem
 *   5. createOffer
 *   6. publishOffer
 *   7. listings テーブルへ保存 + listing_drafts.status=PUBLISHED
 *   8. audit_log書き込み(失敗してもPublish自体は成功扱いにする。§102: 監査ログの
 *      書き込み失敗でユーザー操作全体を失敗させると、逆に「何が起きたか分からない」
 *      状態を招くため)
 *
 * 呼び出し元(UI)は、事前に saveListingDraft を呼んでidentity.productId/draftIdが
 * 確定していることを前提とする(まだ一度も保存していない下書きはPublishできない)。
 */
export interface PublishListingResult {
  ok: boolean;
  listingId?: string;
  offerId?: string;
  sku?: string;
  error?: string;
}

const REQUIRED_FIELD_LABELS: { key: keyof ListingFormState; label: string }[] = [
  { key: 'title', label: 'タイトル' },
];

export async function publishListingToEbay(
  identity: SaveListingIdentity,
  state: ListingFormState,
): Promise<PublishListingResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, error: 'ログインが必要です。' };
  }

  if (!identity.productId || !identity.draftId) {
    return { ok: false, error: '先に「出品を開始する」を押して下書きを保存してください。' };
  }

  // §1: Validation ------------------------------------------------------
  const missing: string[] = [];
  for (const { key, label } of REQUIRED_FIELD_LABELS) {
    if (!state[key]) missing.push(label);
  }
  if (!state.categoryId) missing.push('カテゴリー(eBay Taxonomy検索で選択)');
  if (!state.ebayConditionId) missing.push('Condition(eBay Metadata APIから選択)');
  if (!state.merchantLocationKey) missing.push('保管場所(Inventory Location)');
  if (!state.paymentPolicyId) missing.push('支払いポリシー');
  if (!state.fulfillmentPolicyId) missing.push('配送ポリシー');
  if (!state.returnPolicyId) missing.push('返品ポリシー');

  const priceValue = Number(state.price);
  if (!state.price || Number.isNaN(priceValue) || priceValue <= 0) {
    missing.push('価格(0より大きい数値)');
  }
  if (!Number.isInteger(state.quantity) || state.quantity < 1) {
    missing.push('数量(1以上の整数)');
  }

  if (missing.length > 0) {
    return { ok: false, error: `以下の項目が未入力/未選択です: ${missing.join(' / ')}` };
  }

  const product = await productsRepo.getProductById(identity.productId);
  if (!product) {
    return { ok: false, error: '商品が見つかりませんでした。ページを再読み込みしてください。' };
  }
  try {
    assertValidSku(product.sku);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'SKUが不正です。' };
  }

  let conditionEnum: string;
  try {
    conditionEnum = mapConditionIdToEnum(state.ebayConditionId as string);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Conditionの変換に失敗しました。' };
  }

  // §2: ロック(二重出品防止) --------------------------------------------
  const locked = await listingsRepo.lockDraftForPublishing(identity.draftId);
  if (!locked) {
    return {
      ok: false,
      error: 'この下書きは既にPublish処理中、または公開済みです。ページを再読み込みして状態を確認してください。',
    };
  }

  try {
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US';
    const accessToken = await getEbayUserAccessToken(profile.organizationId);

    // §3: 画像準備 ----------------------------------------------------
    const imageUrls = await productImagesRepo.getImageUrlsForEbay(identity.productId);
    if (imageUrls.length === 0) {
      throw new Error('商品写真が1枚も登録されていません。eBayへの出品には最低1枚の写真が必要です。');
    }

    const descriptionHtml = buildDescriptionHtml(state, false);
    // 2026-09-26追加の修正: 価格改定など後続のOffer更新機能が説明文を参照できるよう、
    // ここでlisting_drafts.description_htmlへも保存しておく(これまでeBayへ渡すためだけに
    // その場で組み立てるだけでDBには保存していなかった)。
    await listingsRepo.updateDraftDescriptionHtml(identity.draftId, descriptionHtml);

    // §4: Inventory Item -----------------------------------------------
    await createOrReplaceInventoryItem(accessToken, {
      sku: product.sku,
      availabilityQuantity: state.quantity,
      conditionEnum,
      title: state.title,
      descriptionHtml,
      aspects: state.aspectValues,
      imageUrls,
    });

    // §5: Offer ----------------------------------------------------------
    const { offerId } = await createOffer(accessToken, {
      sku: product.sku,
      categoryId: state.categoryId as string,
      price: priceValue,
      currency: state.currency || 'USD',
      quantity: state.quantity,
      merchantLocationKey: state.merchantLocationKey as string,
      paymentPolicyId: state.paymentPolicyId as string,
      fulfillmentPolicyId: state.fulfillmentPolicyId as string,
      returnPolicyId: state.returnPolicyId as string,
      marketplaceId,
      listingDescriptionHtml: descriptionHtml,
    });

    // §6: Publish ----------------------------------------------------------
    const result = await publishOffer(accessToken, offerId, product.sku);

    // §7: 保存 ----------------------------------------------------------
    await listingsRepo.createPublishedListing({
      productId: identity.productId,
      listingDraftId: identity.draftId,
      sku: product.sku,
      ebayListingId: result.listingId,
      ebayOfferId: result.offerId,
      marketplaceId,
      categoryId: state.categoryId,
      createdBy: profile.id,
    });
    await listingsRepo.markDraftPublished(identity.draftId);

    // §8: 監査ログ(失敗してもPublish自体は成功として扱う) -----------------
    try {
      await auditRepo.writeAuditLog({
        organizationId: profile.organizationId,
        userId: profile.id,
        entityType: 'listing',
        entityId: identity.draftId,
        action: 'PUBLISH',
        afterJson: { listingId: result.listingId, offerId: result.offerId, sku: product.sku },
      });
    } catch (auditErr) {
      console.error('[publishListingToEbay] audit log failed', auditErr);
    }

    return { ok: true, listingId: result.listingId, offerId: result.offerId, sku: product.sku };
  } catch (err) {
    // §71: 失敗時はstatusをFAILEDへ戻し、再試行できるようにする。
    await listingsRepo.markDraftPublishFailed(identity.draftId).catch(() => undefined);
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました。';
    console.error('[publishListingToEbay] failed', message);
    return { ok: false, error: message };
  }
}
ONEFLAT_EOF_UI_3
echo "[OK] wrote src/app/(app)/listings/new/publishActions.ts"

echo "Done. Now run: npx tsc --noEmit -p . && npm run build"
