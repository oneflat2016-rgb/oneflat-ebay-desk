/**
 * Phase1-STEP1時点のドメイン型。
 * GenreKey / GENRE_FIELDS / CATEGORY_PRESETS は指示書§40で将来REMOVE対象。
 * eBay Taxonomy/Metadata API連携(§37-43)が入り次第、
 * EbayCategory / EbayAspect / EbayCondition (services/ebay 参照)に置き換える。
 */

export type GenreKey =
  | ''
  | 'chisel'
  | 'character'
  | 'clothing'
  | 'jewelry'
  | 'cosmetics'
  | 'food';

export type ConditionValue =
  | 'New'
  | 'New – Open Box'
  | 'Used – Excellent'
  | 'Used – Good'
  | 'Used – Fair'
  | 'For Parts / Not Working';

export interface SpecificField {
  id: string;
  ja: string;
  en: string;
}

export interface GenreDefinition {
  label: string;
  fields: SpecificField[];
}

export interface BilingualText {
  ja: string;
  en: string;
}

export interface ChecklistState {
  [itemId: string]: boolean;
}

export interface TemplateColors {
  border: string;
  accent: string;
}

/**
 * 商品登録フォーム全体の状態。
 * 将来的にはlisting_drafts(DB)にマッピングされ、
 * debounce自動保存(§80)・楽観的排他制御(§81, version)の対象になる。
 */
export interface ListingFormState {
  genre: GenreKey;

  brand: string;
  model: string;
  keywords: string;
  title: string;
  category: string;
  categoryPreset: string;

  /**
   * §37-38(§110 step6): eBay Taxonomy APIから選択した実カテゴリー。
   * 未選択の間はnull(旧`category`自由入力欄との併用期間)。
   * §117-2: カテゴリーをアプリへハードコードしないため、値は必ずeBay APIの応答から来る。
   */
  categoryTreeId: string | null;
  categoryId: string | null;
  categoryName: string | null;

  condition: ConditionValue; // §40/§43でREMOVE予定の固定6択(暫定)

  /**
   * §43(§110 step8): eBay Metadata APIから選択した実カテゴリーのCondition。
   * 未選択の間はnull(旧`condition`固定6択との併用期間)。
   * §117-3/§117-4: Conditionをアプリへハードコード・独自定義しないため、
   * 値は必ずeBay APIの応答(conditionId/conditionDescription)から来る。
   */
  ebayConditionId: string | null;
  ebayConditionDescription: string | null;

  about: BilingualText;
  appearance: BilingualText;
  conditionDetail: BilingualText;
  includedItems: BilingualText;

  specifics: Record<string, string>; // key: `${genre}-${fieldId}` (§40でREMOVE予定の暫定項目)

  /**
   * §39-42(§110 step7): eBay Taxonomy APIから取得したItem Specifics(Aspect)の入力値。
   * key: eBayのaspectName(例: "Brand")。value: 入力値の配列(MULTI cardinality対応)。
   * categoryTreeId/categoryIdが未選択の間は使われない(旧specificsとの併用期間、§117-2)。
   */
  aspectValues: Record<string, string[]>;

  /**
   * §110 step10: eBay Sell Account API / Inventory APIから取得したBusiness Policies・
   * 保管場所の選択値。名前(表示用)はDBへ保存せず、画面表示のたびにIDから解決する
   * (§117-4: eBay由来でない値を保存しない。名前だけの古いキャッシュを持たせない)。
   */
  fulfillmentPolicyId: string | null;
  paymentPolicyId: string | null;
  returnPolicyId: string | null;
  merchantLocationKey: string | null;

  /**
   * §110 step11: eBay Offerの必須項目(価格・数量・通貨)。
   * DBのlisting_drafts.price/currency/quantityへそのまま対応する。
   * priceは文字列で保持し(入力途中の"12."等を許容するため)、Publish直前に数値化して検証する。
   */
  price: string;
  quantity: number;
  currency: string;

  /**
   * §16-17(最新実装指示書, Phase5): 利益シミュレーション用の原価。
   * DBのproducts.cost_price/cost_currencyへ対応する。文字列で保持し(price同様)、
   * 保存時に数値化する。円(JPY)前提(products.cost_currencyの既定値)。
   */
  costPriceJpy: string;

  /**
   * §21-22(最新実装指示書, Phase5): 配送提案用の商品重量・サイズ。
   * DBのproducts.weight_g/width_mm/height_mm/depth_mmへ対応する(これらの列は
   * §22の実装前からschema.sqlに存在していたが、UIから未接続だった)。
   * 文字列で保持し(price/costPriceJpy同様)、保存時に数値化する。
   */
  weightG: string;
  widthMm: string;
  heightMm: string;
  depthMm: string;

  /**
   * §21: 配送提案を計算する際の配送先想定国。DBのlisting_drafts.destination_countryへ対応する。
   * 新規出品時点では購入者が決まっていないため、担当者が基準国を選んで試算する(§21-17)。
   */
  destinationCountry: string;

  /**
   * §21-20: 配送候補から担当者が選んだ配送方法(表示名)。この時点ではeBay設定は変更せず、
   * DBのlisting_drafts.selected_shipping_methodへ保存するだけ(§21-11: Business Policyの
   * 実際の適用は引き続きBusiness Policiesセクションでの明示選択が必要)。
   */
  selectedShippingMethod: string | null;

  checklist: ChecklistState;

  templateColors: TemplateColors;
}

export const CHECKLIST_ITEMS: { id: string; label: string }[] = [
  { id: 'chk-1', label: '複数角度から写真を撮影した' },
  { id: 'chk-2', label: '傷・汚れ・付属品の状態を確認した' },
  { id: 'chk-3', label: '動作確認をした(該当する場合)' },
  { id: 'chk-4', label: 'クリーニング・清掃をした' },
  { id: 'chk-5', label: 'サイズ・重量を計測した' },
  { id: 'chk-6', label: '梱包資材を準備した' },
  { id: 'chk-7', label: '送料・関税表記を確認した' },
  { id: 'chk-8', label: 'タイトル・説明文を最終確認した' },
];

export const CONDITION_OPTIONS: { value: ConditionValue; labelJa: string }[] = [
  { value: 'New', labelJa: '新品 (New)' },
  { value: 'New – Open Box', labelJa: '新品・開封済み' },
  { value: 'Used – Excellent', labelJa: '中古・極美品' },
  { value: 'Used – Good', labelJa: '中古・良好' },
  { value: 'Used – Fair', labelJa: '中古・使用感あり' },
  { value: 'For Parts / Not Working', labelJa: 'ジャンク・部品取り' },
];
