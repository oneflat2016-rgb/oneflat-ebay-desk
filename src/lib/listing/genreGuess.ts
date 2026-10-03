import type { GenreKey } from '@/types/listing';

/**
 * 2026-10-03: 「順番が不自然。タイトルを入れたら、タイトルを元にジャンル選択
 * できるようにしたい。目的は可能な限り手動入力を少なくすることだ」という
 * 本番実商品テスト中の要望への対応。
 *
 * これまでは「0. 商品ジャンルを選択」がフォームの一番最初にあり、タイトルも
 * ブランドも何も入れていない段階で、必ず手動でジャンルを選ばないと次に
 * 進みにくい構成になっていた。
 *
 * ここでは、タイトル・ブランド・キーワードのテキストをキーワード一致だけで
 * 判定する簡易ロジックでジャンルを自動提案する(AIを呼ばない・追加APIコストなし)。
 * あくまで下の「1.5. eBayカテゴリー候補」の参考候補・旧仕様入力欄向けの
 * 簡易提案であり、eBayへ実際に送るカテゴリー(categoryId)はCategorySuggestSection
 * (eBay Taxonomy API)が別途・独立して決める。判定できない場合は''(未選択)を返し、
 * ユーザーが手動で選べる状態のままにする。
 */
const GENRE_KEYWORDS: Record<Exclude<GenreKey, ''>, string[]> = {
  chisel: [
    '鑿',
    'のみ',
    'ノミ',
    '鉋',
    'かんな',
    'カンナ',
    '鋸',
    'のこぎり',
    '大工道具',
    'chisel',
    'hand plane',
    'nomi',
    'kanna',
    'saw',
    'woodworking',
  ],
  character: [
    'フィギュア',
    'ぬいぐるみ',
    'キャラクター',
    'キーホルダー',
    'グッズ',
    'figure',
    'plush',
    'character',
    'anime',
    'pokemon',
    'sanrio',
    'keychain',
  ],
  clothing: [
    'シャツ',
    'ジャケット',
    'ドレス',
    '着物',
    '浴衣',
    '衣類',
    'kimono',
    'yukata',
    'shirt',
    'jacket',
    'dress',
    'clothing',
    'apparel',
  ],
  jewelry: [
    '指輪',
    'リング',
    'ネックレス',
    'ブレスレット',
    'ジュエリー',
    'アクセサリー',
    'ring',
    'necklace',
    'bracelet',
    'jewelry',
    'jewellery',
    'pendant',
  ],
  cosmetics: [
    '化粧品',
    'コスメ',
    '石鹸',
    'シャンプー',
    'soap',
    'cosmetic',
    'skincare',
    'skin care',
    'lotion',
    'cream',
    'shampoo',
  ],
  food: ['食品', 'お菓子', '調味料', '日用品', 'food', 'snack', 'tea', 'candy', 'grocery'],
};

export function guessGenreFromText(text: string): GenreKey {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return '';
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS) as [Exclude<GenreKey, ''>, string[]][]) {
    if (keywords.some((kw) => normalized.includes(kw.toLowerCase()))) {
      return genre;
    }
  }
  return '';
}
