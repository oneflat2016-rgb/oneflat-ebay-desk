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

  condition: ConditionValue;

  about: BilingualText;
  appearance: BilingualText;
  conditionDetail: BilingualText;
  includedItems: BilingualText;

  specifics: Record<string, string>; // key: `${genre}-${fieldId}`

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
