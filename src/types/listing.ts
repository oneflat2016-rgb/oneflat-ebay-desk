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
