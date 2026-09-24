import type { GenreDefinition, GenreKey } from '@/types/listing';

/**
 * !!! REMOVE予定(指示書§40, §116) !!!
 * このジャンル別固定配列方式は、eBay Taxonomy API + Metadata API による
 * 動的カテゴリー/Aspect取得(§37-43)に置き換わり次第、丸ごと削除する。
 * Phase1-STEP1では「見た目を変えない」ため、現状のロジックのまま
 * ebay-listing-desk.htmlから移植している。
 */
export const GENRE_FIELDS: Record<Exclude<GenreKey, ''>, GenreDefinition> = {
  chisel: {
    label: '刃物・大工道具',
    fields: [
      { id: 'brand', ja: 'ブランド', en: 'Brand' },
      { id: 'type', ja: '種類(例: 追入鑿、薄鑿、鉋、鋸)', en: 'Type' },
      { id: 'bladewidth', ja: '刃幅 (mm)', en: 'Blade Width' },
      { id: 'length', ja: '全長 (mm)', en: 'Overall Length' },
      { id: 'bladelength', ja: '刃長 (mm)', en: 'Blade Length' },
      { id: 'weight', ja: '重量 (g)', en: 'Weight' },
      { id: 'handlematerial', ja: '柄の素材', en: 'Handle Material' },
      { id: 'pieces', ja: 'セット本数', en: 'Number of Pieces' },
      { id: 'country', ja: '製造国', en: 'Country/Region of Manufacture' },
    ],
  },
  character: {
    label: 'キャラクターグッズ',
    fields: [
      { id: 'character', ja: 'キャラクター名', en: 'Character' },
      { id: 'franchise', ja: 'フランチャイズ・シリーズ(例: Sanrio, Pokemon)', en: 'Franchise' },
      { id: 'type', ja: '種類(例: ぬいぐるみ、フィギュア、キーホルダー)', en: 'Type' },
      { id: 'material', ja: '素材', en: 'Material' },
      { id: 'size', ja: 'サイズ・高さ (cm)', en: 'Size' },
      { id: 'color', ja: '色', en: 'Color' },
      { id: 'manufacturer', ja: 'メーカー(例: Takara Tomy, Bandai)', en: 'Manufacturer' },
      { id: 'licensed', ja: '正規ライセンス品か(Yes/No)', en: 'Officially Licensed' },
      { id: 'year', ja: '製造年(任意)', en: 'Year Manufactured' },
    ],
  },
  clothing: {
    label: '衣類・ファッション',
    fields: [
      { id: 'brand', ja: 'ブランド', en: 'Brand' },
      { id: 'size', ja: 'サイズ表記', en: 'Size' },
      { id: 'sizetype', ja: 'サイズ規格(JP/US/EU/フリー)', en: 'Size Type' },
      { id: 'department', ja: '対象(レディース/メンズ/ユニセックス)', en: 'Department' },
      { id: 'color', ja: '色', en: 'Color' },
      { id: 'material', ja: '素材', en: 'Material' },
      { id: 'style', ja: 'スタイル(例: Cottagecore, Gothic, Vintage)', en: 'Style' },
      { id: 'sleeve', ja: '袖丈', en: 'Sleeve Length' },
      { id: 'pattern', ja: '柄', en: 'Pattern' },
    ],
  },
  jewelry: {
    label: 'ジュエリー・アクセサリー',
    fields: [
      { id: 'type', ja: '種類(ネックレス/チョーカー/ブレスレット等)', en: 'Type' },
      { id: 'material', ja: '素材(例: Swarovski Crystal, Sterling Silver)', en: 'Material' },
      { id: 'stone', ja: 'メインストーン', en: 'Main Stone' },
      { id: 'color', ja: '色', en: 'Color' },
      { id: 'closure', ja: '留め具の種類', en: 'Closure Type' },
      { id: 'length', ja: '長さ (cm)', en: 'Length' },
      { id: 'style', ja: 'スタイル', en: 'Style' },
    ],
  },
  cosmetics: {
    label: 'コスメ・石鹸',
    fields: [
      { id: 'brand', ja: 'ブランド', en: 'Brand' },
      { id: 'type', ja: '種類(例: 石鹸、リップ、スキンケア、シャンプー)', en: 'Type' },
      { id: 'volume', ja: '内容量(例: 100ml, 470ml)', en: 'Volume/Size' },
      { id: 'scent', ja: '香り', en: 'Scent' },
      { id: 'skintype', ja: '対象の肌タイプ(例: 敏感肌、乾燥肌)', en: 'Skin Type' },
      { id: 'expiry', ja: '使用期限(任意)', en: 'Expiration Date' },
      { id: 'ingredients', ja: '主成分・特徴(任意)', en: 'Key Ingredients' },
      { id: 'country', ja: '製造国', en: 'Country/Region of Manufacture' },
    ],
  },
  food: {
    label: '食品・日用消耗品',
    fields: [
      { id: 'brand', ja: 'ブランド', en: 'Brand' },
      { id: 'type', ja: '種類(例: 粉ミルク、お菓子、洗剤、布巾)', en: 'Type' },
      { id: 'netweight', ja: '内容量(例: 180g, 470ml)', en: 'Net Weight/Volume' },
      { id: 'quantity', ja: '個数・セット数', en: 'Quantity Included' },
      { id: 'expiry', ja: '賞味期限・使用期限', en: 'Best By/Expiration Date' },
      { id: 'ingredients', ja: '主な原材料(任意)', en: 'Ingredients' },
      { id: 'allergen', ja: 'アレルギー情報(任意)', en: 'Allergen Information' },
      { id: 'country', ja: '製造国', en: 'Country/Region of Manufacture' },
    ],
  },
};

/**
 * !!! REMOVE予定(指示書§40) !!!
 * eBay Taxonomy APIのgetCategorySuggestions(§37-38)に置き換わる。
 */
export const CATEGORY_PRESETS: Record<Exclude<GenreKey, ''>, string[]> = {
  chisel: ['Chisels', 'Hand Planes', 'Japanese Woodworking Hand Tools', 'Saws'],
  character: [
    'Collectible Character Toys',
    'Plush',
    'Action Figures',
    'Keychains, Rings & Finger Rope',
  ],
  clothing: [
    "Women's Dresses",
    "Women's Tops & Blouses & Shirts",
    "Women's Skirts",
    "Women's Clothing (Other)",
  ],
  jewelry: ['Necklaces & Pendants', 'Bracelets', 'Fashion Rings', 'Costume Jewelry (Other)'],
  cosmetics: ['Bath & Body', 'Skin Care', 'Makeup', 'Hair Care'],
  food: ['Grocery & Gourmet Food', 'Specialty Foods', 'Household Supplies & Cleaning'],
};

export function specificFieldKey(genre: GenreKey, fieldId: string): string {
  return `${genre}-${fieldId}`;
}
