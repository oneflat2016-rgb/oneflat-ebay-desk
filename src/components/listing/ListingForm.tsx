'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { ListingFormState } from '@/types/listing';
import type { EbayAspectDefinition } from '@/types/ebay';
import { createEmptyListingFormState } from '@/lib/listing/defaultState';
import { CATEGORY_PRESETS } from '@/lib/listing/genreFields';
import { guessGenreFromText } from '@/lib/listing/genreGuess';
import { mapConditionIdToTitleValue } from '@/lib/ebay/conditionEnumMap';
import { saveListingDraft, type SaveListingIdentity } from '@/app/(app)/listings/new/actions';
import { publishListingToEbay } from '@/app/(app)/listings/new/publishActions';
import { ImagesSection } from './ImagesSection';
import { PricingSection } from './PricingSection';
import { AiAnalysisSection } from './AiAnalysisSection';
import { AiDescriptionDraftSection, type DescriptionDrafts } from './AiDescriptionDraftSection';
import { CategorySuggestSection } from './CategorySuggestSection';
import { TitleSection } from './TitleSection';
import { DynamicConditionSection } from './DynamicConditionSection';
import { BusinessPoliciesSection } from './BusinessPoliciesSection';
import { BilingualSection } from './BilingualSection';
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
 * §80(2026-10-08実装): 入力停止後1.5秒のdebounceによる自動保存も実装済み
 * (詳細はscheduleAutoSave/handleSave内のコメントを参照)。
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
  /**
   * 2026-10-08: 「なんかわかりにくいな。もっとアプリ風に」という指摘への対応。
   * TODO(§30-31)で予告されていた「STEP1(写真)/STEP2(出品情報)/STEP3(最終確認)の
   * ウィザード」をここで実装する。データは今まで通り単一のstateで一括管理し、
   * 表示だけを3ステップに分割する(display:noneで隠すだけで、各セクションは
   * マウントしたままにして入力内容やeBayから取得済みの候補を保持する)。
   */
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const goToStep = (next: 1 | 2 | 3) => {
    setStep(next);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const patch = useCallback((partial: Partial<ListingFormState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  /**
   * 2026-10-03: 本番実商品テストで発見したバグへの対応。
   * 「2. タイトル作成」欄の「ブランド」(state.brand)と、eBayの商品仕様(Item
   * Specifics)側の「Brand」(state.aspectValues.Brand)は別々の入力欄のため、
   * タイトル用のブランドだけ入力してItem Specifics側を空のままPublishすると、
   * eBayから「The item specific Brand is missing.」(400エラー)で拒否されていた。
   * eBay側のBrand項目がまだ未入力の間は、タイトル用のブランド欄の値を自動で
   * 反映する(ユーザーがItem Specifics側のBrandを一度でも編集したら、以降は
   * 上書きしない)。
   */
  useEffect(() => {
    const hasBrandAspect = ebayAspects.some((a) => a.aspectName === 'Brand');
    if (!hasBrandAspect || !state.brand) return;
    setState((prev) => {
      const existing = prev.aspectValues['Brand'];
      if (existing && existing.length > 0) return prev;
      return { ...prev, aspectValues: { ...prev.aspectValues, Brand: [prev.brand] } };
    });
  }, [ebayAspects, state.brand]);

  /**
   * 2026-10-03: 本番実商品テストで発見した「Conditionの入力欄が2つある」問題への対応。
   * これまでは、実際にeBayへ送るCondition(DynamicConditionSection・eBay Metadata API由来)
   * と、タイトル候補生成だけに使う固定6択のCondition(旧ConditionSection)を、
   * それぞれ別々に選ぶ必要があった(§43/§116で「廃止予定」とされていたもの)。
   * ここでは、eBayのConditionを選んだ時点でタイトル候補生成用の値も自動的に
   * 合わせる。これにより旧ConditionSectionの手動選択欄は不要になったため、
   * 画面上から削除した(下記JSX参照)。
   */
  useEffect(() => {
    if (!state.ebayConditionId) return;
    const titleValue = mapConditionIdToTitleValue(state.ebayConditionId);
    if (!titleValue) return;
    setState((prev) => (prev.condition === titleValue ? prev : { ...prev, condition: titleValue }));
  }, [state.ebayConditionId]);

  /**
   * 2026-10-03: 本番実商品テストで出た「順番が不自然。タイトルを入れたら、
   * タイトルを元にジャンル選択できるようにしたい。目的は可能な限り手動入力を
   * 少なくすることだ」という要望への対応。
   * 以前は「0. 商品ジャンルを選択」がフォームの一番最初にあり、タイトルも
   * ブランドも何も入れていない段階で必ず手動選択する構成になっていた。
   * ここではタイトル・ブランド・キーワードの入力内容から簡易キーワード一致で
   * ジャンルを自動提案し、ジャンルがまだ未選択('')の間だけ自動反映する
   * (Brand自動反映・Condition自動同期と同じ考え方: ユーザーが一度でも
   * 手動でジャンルを選んだら、以降は自動提案で上書きしない)。
   */
  useEffect(() => {
    if (state.genre) return;
    const guessed = guessGenreFromText(
      [state.title, state.brand, state.keywords].filter(Boolean).join(' '),
    );
    if (!guessed) return;
    setState((prev) => {
      if (prev.genre) return prev;
      const presets = CATEGORY_PRESETS[guessed];
      return { ...prev, genre: guessed, category: presets?.[0] ?? prev.category };
    });
  }, [state.title, state.brand, state.keywords, state.genre]);

  /**
   * 2026-10-04: 本番実商品テストで出た「保存してから出品を開始するのが使いにくい」
   * という指摘への対応。
   * これまでは「出品を開始する」ボタンを明示的に1回押してproducts行を作成しないと
   * 写真アップロードやAI解析が使えなかった(productIdがまだ無いため)。
   * ここではページを開いた時点で自動的に(裏側で)1回だけ保存を実行し、productIdを
   * 作っておくことで、ユーザーが手動でボタンを押す手間を無くす。
   * 失敗した場合(未ログインなど)はSaveStatusLabelにエラーが表示され、再試行ボタンで
   * やり直せる。
   */
  const hasAutoSavedRef = useRef(false);
  useEffect(() => {
    if (hasAutoSavedRef.current) return;
    if (identity.productId) return;
    hasAutoSavedRef.current = true;
    handleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * §80(2026-10-08実装): 入力停止後1.5秒のdebounceによる自動保存。
   * これまでは「保存」ボタンを明示的に押さないと変更が消えてしまう問題があった
   * (§102「まだ実装されていないもの」参照)。ここでは入力(state)が変わるたびに
   * タイマーをリセットし、1.5秒操作が無ければ自動でhandleSave()を呼ぶ。
   *
   * ・まだproductIdが無い(=上のマウント時自動保存がまだ終わっていない)間は
   *   動かさない(そちらが終われば自然にこの効果が動き出す)。
   * ・保存が進行中(isSavingRef)の間に次の変更が来た場合は、今回は保存せず
   *   dirtyRef(未保存の変更あり)だけ立てておき、保存完了後にもう一度だけ
   *   自動保存をスケジュールする(連打のような二重保存を避けるため)。
   * ・初回マウント時(まだ何も編集していない)は走らせない。
   */
  const isSavingRef = useRef(false);
  const dirtyRef = useRef(false);
  const skipFirstAutoSaveEffectRef = useRef(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 2026-10-08修正: 自動保存が無限に繰り返され、画像アップロードが
   * まともに進まなくなる不具合への対応。
   * 原因: 各セクションがpatch()を呼ぶたびにstateは「新しいオブジェクト」になるため、
   * 内容が実質的に変わっていなくても(参照が変わるだけで)自動保存のuseEffectが
   * 再実行されてしまっていた。保存→再描画→(内容は同じでも)再度保存対象と
   * 誤認、のループになっていた可能性が高い。
   * ここでは「直前に実際に保存した内容」をJSON文字列として保持し、今回のstateと
   * 内容が完全に同じ(実質的な変更が無い)場合は、そもそもタイマーすら
   * スケジュールしないようにする(参照が変わっただけの空振りを根本から止める)。
   */
  const lastSavedSnapshotRef = useRef<string>(JSON.stringify(initialState));

  /**
   * 2026-10-08再修正: 「写真を添付すると点滅する」の本当の原因が判明したため追加。
   * ページを開いた直後は、eBay Business Policies取得・配送料金取得・配送方法の
   * 自動提案・ジャンル自動推測・Brand/Condition自動反映など、複数のセクションが
   * それぞれ別タイミングで一度だけstateへ自動入力(patch)を行う。これらは
   * 「内容が実質的に変わっていない場合はスキップする」ガードだけでは防げない
   * (実際に値が入るので内容は毎回変わる)。その結果、ページを開いてから数秒の間に
   * 保存が何度も連続して発生し、保存状況の表示が目まぐるしく切り替わる
   * (=点滅して見える)原因になっていた。
   * ここではページを開いてから一定時間(SETTLE_WINDOW_MS)の間は、自動反映による
   * stateの変化を「まとめて」1回の保存にするため、保存予約の実行時刻を
   * 「その時間が終わるタイミングより前には実行しない」ようにする
   * (=1.5秒の間隔が空いていても、起動直後の自動入力ラッシュが終わるまでは待つ)。
   */
  const SETTLE_WINDOW_MS = 4000;
  const settleUntilRef = useRef(Date.now() + SETTLE_WINDOW_MS);

  /**
   * 2026-10-08 本当の原因が判明したための再修正(「ひたすら保存が繰り返される」):
   * scheduleAutoSaveはuseCallback(..., [])でマウント時に1回だけ作られる関数のため、
   * その中から直接handleSaveを呼ぶと、その「1回だけ作られた時点」のhandleSave
   * (=最初の描画時のstate/identityを閉じ込めたまま古くなった関数)を永久に
   * 呼び続けてしまっていた。
   * 具体的には: タイマーが発火するたびに「古いstate(=初期状態)」でlastSavedSnapshotRef
   * を上書きしてしまい、次にこの古いstateと「今の本当のstate」を比較すると毎回
   * 「変わった」と誤認 → また古いhandleSaveが呼ばれる…という無限ループになっていた。
   * さらにidentityも初期値(productId=null)のまま固定されるため、保存するたびに
   * 新しい商品が作られ続ける不具合にもなっていた。
   * 対策: 常に「今レンダーされた最新のhandleSave」をrefに入れておき(handleSaveRef)、
   * タイマーからはそのrefを経由して呼び出す。これにより呼び出す側は
   * いつも最新のstate/identityを参照するhandleSaveを実行できる。
   */
  const handleSaveRef = useRef<() => void>(() => {});
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const delay = Math.max(1500, settleUntilRef.current - Date.now());
    autoSaveTimerRef.current = setTimeout(() => {
      if (isSavingRef.current) {
        // 保存中に次の変更が来ていた場合は、保存完了後にhandleSave側から再スケジュールする。
        return;
      }
      dirtyRef.current = false;
      handleSaveRef.current();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipFirstAutoSaveEffectRef.current) {
      skipFirstAutoSaveEffectRef.current = false;
      return;
    }
    if (!identity.productId) return; // 商品の下準備がまだの間は自動保存しない
    const snapshot = JSON.stringify(state);
    if (snapshot === lastSavedSnapshotRef.current) return; // 内容が実質的に変わっていなければ何もしない
    dirtyRef.current = true;
    scheduleAutoSave();
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, identity.productId]);

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
    isSavingRef.current = true;
    // 今回保存しにいく内容をスナップショットしておく(自動保存の重複スケジュール防止用)。
    lastSavedSnapshotRef.current = JSON.stringify(state);
    setSaveStatus({ kind: 'saving' });
    startSaveTransition(async () => {
      try {
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
      } finally {
        isSavingRef.current = false;
        // §80: 保存中にも編集が続いていた場合、取りこぼさないようもう一度自動保存をスケジュールする。
        if (dirtyRef.current) {
          dirtyRef.current = false;
          scheduleAutoSave();
        }
      }
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
        {/* 2026-10-04: ページを開いた時点で自動的に保存(商品の下準備)が走るため、
            明示的に押すボタンは不要になった。保存状況の表示と、失敗時の再試行だけ残す。 */}
        <div className="actions-row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SaveStatusLabel status={saveStatus} />
          {saveStatus.kind === 'error' && (
            <button type="button" className="btn" onClick={handleSave} disabled={isSaving}>
              再試行
            </button>
          )}
        </div>

        <StepTabs step={step} onChange={goToStep} />

        {publishStatus.kind !== 'idle' && (
          <div className="card" style={{ marginBottom: 16 }}>
            <PublishStatusLabel status={publishStatus} />
          </div>
        )}

        <div style={{ display: step === 1 ? 'block' : 'none' }}>
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

        </div>

        <div style={{ display: step === 2 ? 'block' : 'none' }}>
        {/* 2026-10-04: 「コンディションの選択は2番目くらいの操作がいい。新品か中古かは
            タイトルに影響するから」という指摘への対応。
            eBayのConditionはカテゴリーごとに選べる項目が決まる(Metadata API)ため、
            タイトルより本当に2番目には出せないが、カテゴリー候補(Taxonomy API)→
            コンディションの順にタイトルより前へ移動した。これで「3.タイトル」で
            AIタイトルを生成する時点で、すでに新品/中古が分かっている状態になる。
            ブランド・型番・キーワードはこの下の「5.タイトル」欄に入力する項目だが、
            値自体はトップレベルのstateで管理しているため、この位置にあっても
            AI解析(2.)で取得した値や、ここから遡って入力した値を使って検索できる。 */}
        <CategorySuggestSection
          categoryId={state.categoryId}
          categoryName={state.categoryName}
          defaultQuery={
            state.title || [state.model, state.brand, state.keywords].filter(Boolean).join(' ')
          }
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

        <DynamicConditionSection
          categoryId={state.categoryId}
          conditionId={state.ebayConditionId}
          onSelect={({ conditionId, conditionDescription }) =>
            patch({ ebayConditionId: conditionId, ebayConditionDescription: conditionDescription })
          }
        />

        {/* 2026-10-03: 「4と5の違いは何？統合できないの？」という指摘への対応。
            旧ジャンル選択(手動6択)は、実際にeBayへ送られる本物のカテゴリー
            (上のeBayカテゴリー候補・Taxonomy API)とは別物で、タイトル欄の
            旧カテゴリー候補ドロップダウンを切り替えるためだけの暫定機能だった。
            そのドロップダウンごと廃止したため、ジャンル選択欄も画面から削除した。
            ジャンルの自動推定(state.genre)自体は裏側に残し、AI説明文下書きの
            商品種別フォールバックなど小さな用途にのみ引き続き使う。 */}
        <TitleSection
          brand={state.brand}
          model={state.model}
          keywords={state.keywords}
          title={state.title}
          category={state.category}
          condition={state.condition}
          ebayConditionDescription={state.ebayConditionDescription}
          aspectValues={state.aspectValues}
          onBrandChange={(brand) => patch({ brand })}
          onModelChange={(model) => patch({ model })}
          onKeywordsChange={(keywords) => patch({ keywords })}
          onTitleChange={(title) => patch({ title })}
          onCategoryChange={(category) => patch({ category })}
        />

        <DynamicAspectsSection
          categoryTreeId={state.categoryTreeId}
          categoryId={state.categoryId}
          categoryName={state.categoryName}
          values={state.aspectValues}
          onChange={handleAspectValueChange}
          onAspectsLoaded={setEbayAspects}
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
          sectionNumber={14}
          heading="About This Item(商品について)"
          hint="1行 = 1項目・空欄なら省略"
          description="状態や見た目以外で伝えたい、商品の特徴やアピールポイントを書く欄です。"
          value={state.about}
          onChange={(about) => patch({ about })}
          idPrefix="about"
        />

        <BilingualSection
          sectionNumber={15}
          heading="Appearance(見た目・外観)"
          hint="1行 = 1項目・空欄なら省略"
          description="傷・汚れ・色あせなど、見た目に関する情報を書く欄です。"
          value={state.appearance}
          onChange={(appearance) => patch({ appearance })}
          idPrefix="appearance"
        />

        <BilingualSection
          sectionNumber={16}
          heading="Condition(状態の詳細説明)"
          hint="1行 = 1項目・空欄なら省略"
          description="動作確認の結果など、状態について詳しく説明する文章です。"
          value={state.conditionDetail}
          onChange={(conditionDetail) => patch({ conditionDetail })}
          idPrefix="condition-detail"
        />

        <BilingualSection
          sectionNumber={17}
          heading="Included Items(付属品)"
          hint="1行 = 1項目・空欄なら省略"
          description="本体以外に一緒にお届けするもの(箱・説明書・付属品など)を書く欄です。"
          value={state.includedItems}
          onChange={(includedItems) => patch({ includedItems })}
          idPrefix="included"
        />

        <section className="card">
          <div className="legend-row">
            <h2 style={{ fontSize: '1.05rem' }}>
              18. Shipping / Importer&apos;s Obligation(発送・関税について)
            </h2>
            <span className="hint">固定(TODO: §50で条件連動化)</span>
          </div>
          <p className="subnote">
            この2セクションはいつものテンプレート文をそのまま使用しています。TODO(§50):
            実際に適用している配送条件と一致する場合だけ表示するよう変更し、管理画面からテンプレート編集できるようにする。
          </p>
        </section>

        </div>

        <div style={{ display: step === 3 ? 'block' : 'none' }}>
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

        {/* 2026-10-03: 「テンプレートの配色、こんなの一番最後でしょ」という指摘への対応。
            商品の内容とは関係ない見た目設定(TODO §51: 将来は管理画面へ移動予定)のため、
            情報入力の流れを邪魔しないよう一番最後(チェック類の後ろ)に移動した。 */}
        <ColorTemplateSection
          colors={state.templateColors}
          onChange={(templateColors) => patch({ templateColors })}
        />

        <div className="actions-row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={handleClear}>
            クリアして次の商品へ
          </button>
        </div>
        </div>

        {/* 2026-10-08: アプリ風の操作感にするため、保存・ステップ移動・出品を
            画面下部に固定したツールバーへ統一する(globals.cssに元々あったが
            どこからも使われていなかった.mobile-action-barを活用)。 */}
        {/*
         * 2026-10-08再修正: 「出品できたのかどうかがわからない」
         * 「何度も出品ボタンが押せてしまう」という指摘への対応。
         * ・出品結果(publishStatus)の表示が画面の上の方(カード)にしか無く、
         *   ボタンが画面下部の固定バーにあるため、押した直後の結果が
         *   目に入らなかった。ボタンの真上にも同じ内容を表示するようにした。
         * ・isPublishingは「送信している間」だけtrueになるuseTransitionの値のため、
         *   送信が完了(成功・失敗どちらでも)すると自動的にfalseへ戻ってしまい、
         *   成功した後もボタンが押せる状態のままだった。publishStatusが
         *   「published(出品済み)」になったらボタンを無効化し、ラベルも
         *   「出品済み」に変えることで、連打による再出品を防ぐ。
         */}
        {step === 3 && publishStatus.kind !== 'idle' && (
          <div className="card" style={{ marginBottom: 12 }}>
            <PublishStatusLabel status={publishStatus} />
          </div>
        )}
        <div className="mobile-action-bar">
          <button type="button" className="btn" onClick={() => goToStep((step - 1) as 1 | 2 | 3)} disabled={step === 1}>
            ← 戻る
          </button>
          <button type="button" className="btn" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '保存中…' : '保存'}
          </button>
          {step < 3 ? (
            <button type="button" className="btn primary" onClick={() => goToStep((step + 1) as 1 | 2 | 3)}>
              次へ →
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              onClick={handlePublish}
              disabled={isPublishing || isSaving || publishStatus.kind === 'published'}
            >
              {publishStatus.kind === 'published'
                ? '出品済み'
                : isPublishing
                  ? '出品しています…'
                  : 'eBayへ出品する'}
            </button>
          )}
        </div>
      </div>

      <PreviewPanel state={state} />
    </div>
  );
}

/**
 * 2026-10-08: 「もっとアプリ風に」という指摘への対応。
 * 21個のセクションが縦に全部並ぶ単一フォームを、写真→商品情報→最終確認の
 * 3ステップに分けて表示するためのタブ。クリックで自由に行き来できる
 * (入力途中で前の内容を確認したくなるケースが多いため、順番を強制しない)。
 */
function StepTabs({ step, onChange }: { step: 1 | 2 | 3; onChange: (step: 1 | 2 | 3) => void }) {
  const steps: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: '写真・AI解析' },
    { n: 2, label: '商品情報' },
    { n: 3, label: '最終確認・出品' },
  ];
  return (
    <div className="step-tabs" role="tablist" aria-label="出品ステップ">
      {steps.map((s) => (
        <button
          key={s.n}
          type="button"
          role="tab"
          aria-selected={step === s.n}
          className={`step-tab${step === s.n ? ' active' : ''}`}
          onClick={() => onChange(s.n)}
        >
          <span className="step-tab-num">{s.n}</span>
          <span className="step-tab-label">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * §81: 楽観的排他制御のconflict時は、上書き保存させず
 * 「他の人が更新しました」と明示する(§102: 無条件の上書き禁止)。
 */
function SaveStatusLabel({ status }: { status: SaveStatus }) {
  if (status.kind === 'idle') {
    return <span className="hint">商品を準備しています…</span>;
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
