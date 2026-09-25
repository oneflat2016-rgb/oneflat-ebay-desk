import { GENRE_FIELDS, specificFieldKey } from './genreFields';
import type { ListingFormState } from '@/types/listing';

/**
 * ebay-listing-desk.htmlの説明文HTML生成ロジックを、DOMに依存しない
 * 純粋関数として移植したもの(Phase1-STEP1)。
 *
 * §49/§50に合わせて今後調整する点:
 * - 空欄セクションは出力しない(実装済み)
 * - Shipping/Import文言は固定文でなく、管理画面テンプレート
 *   (今はTEMPLATE定数、将来はDB `description_templates` 的なテーブル)から取得する
 */

const TEMPLATE_HEAD =
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"> ' +
  "<link rel='stylesheet' href='https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css'><style></style>" +
  '<style>.template__main.variant-6 h2, .template__main.variant-1 h2{color: #000;}  ' +
  '.template__main {word-break: break-word; width: 100%;background: #fff;border: 1px solid var(--tmpl-border,#000);padding: 0 20px 30px 20px !important;-webkit-box-sizing: border-box;box-sizing: border-box;word-break: break-all; } ' +
  '.template__main h1 { font-family: "Verdana", sans-serif,sans-serif!important; font-weight: bold; font-size: 22px !important;margin: 30px 0;text-align: center;color: #111; word-break: break-word;} ' +
  '.template__main h2 { font-family: "Verdana", sans-serif,sans-serif!important; margin: 0 0 15px 0; font-size: 18px;line-height: 1.2;text-align: left; word-break: break-word; } ' +
  '.template__main h3 {margin: 0; padding-left: 10px; font-size: 14px;color: #111; word-break: break-word;} ' +
  '.template__main .main__table { font-family: "Verdana", sans-serif,sans-serif!important; width: auto; padding-left: 50px; padding-bottom: 40px; } ' +
  '.template__main .main__table h3 {margin: 0; padding: 0 0 10px 0; font-size: 14px;color: #111;text-align: center; word-wrap: break-word; word-break: break-word;}  ' +
  '.template__main .main__table table th {text-align:left; font-weight: bold;} ' +
  '.template__main .product__desc {margin: 0;padding: 0 0 20px 0;color: #111;text-align: left;} ' +
  '.template__main .product__intro {line-height: 24px;font-size: 14px;padding: 0 30px 20px;} ' +
  '.template__main .product__intro ol {margin: 0; padding: 0;} ' +
  '.template__main .product__intro ol li { font-family: "Verdana", sans-serif,sans-serif!important; list-style-type: disc; font-size: 14px; word-break: break-word; color: #111;} ' +
  '.template__main p { word-break: break-word; font-family: "Verdana", sans-serif,sans-serif!important; margin: 0;padding: 0 10px 20px;color: #111;text-align: left;line-height: 24px;font-size: 14px;} ' +
  '.template__main table { border-collapse: separate; border-spacing: revert; width: 100%!important; font-size: 14px;} ' +
  '.template__main table tr {background-color: #eee;color: #111;} ' +
  '.template__main table tr:first-of-type {background-color: var(--tmpl-accent,#FFF100);color: var(--tmpl-header-ink,#111);} ' +
  '.template__main table th, .template__main table td { font-family: "Verdana", sans-serif,sans-serif!important; padding: 0.5em 0 0.5em 0.5em;  word-break: break-word;} ' +
  '.template__main h3 {padding-bottom: 10px; font-weight: bold; font-family: "Verdana", sans-serif,sans-serif!important;} ' +
  '.aside__item:not(:last-of-type) { padding-bottom: 20px; }  ' +
  '.template__main section {padding-bottom: 20px;} ' +
  '.template__main .img-area {text-align:center;} ' +
  '.template__main img {max-width: 100%; object-fit: cover; }  ' +
  '.template__main h2 { position: relative; color: #111; padding: 10px 10px;border-radius: 5px; } ' +
  '.template__main h2::before {position: absolute; content: ""; width: 100%; height: 3px; left: 0; bottom: 0; background-color: var(--tmpl-accent,#FFF100); border-radius: 3px; } ' +
  '.template__main .jp-preview-only, .template__main .jp-preview-only *{color: #C2178C !important;} ' +
  '.template__main li.jp-preview-only::before{content: "[JP・下書き確認用] "; font-weight: bold; font-size: 0.85em;} ' +
  '.template__main h3.jp-preview-only::before{content: "[JP・下書き確認用] "; font-weight: bold; font-size: 0.8em;} ' +
  '.template__main .jp-preview-banner{background:#FDF0FA;border:1px dashed #C2178C;color:#C2178C;padding:10px 14px;margin:0 0 18px;border-radius:6px;font-size:13px;line-height:1.6;}</style>';

// TODO(§50): 管理画面「説明文テンプレート」から取得するように差し替える
const SHIPPING_EN = [
  'We always send the item with a tracking number. So please place an order without any concerns about delivery. You can always track the delivery status.',
  'Shipping is only available to the address registered in eBay. If you want us to ship to another address, please change your address on eBay and then place an order.',
  'Shipping is available from Monday to Friday. Weekends are not available because freight (shipping) companies are closed.',
  'We do not mark merchandise below value or mark items as "gifts" — Japan, US and International government regulations prohibit such behavior.',
  'Remote area surcharge may apply depending on your address. No action is needed on your side — we will check after your order, and contact you before shipping only if an additional fee applies. The fee can be paid securely through eBay.',
];
const SHIPPING_JA = [
  '必ず追跡番号付きでお送りします。お届けの際、ご心配なくご注文ください。配送状況は常に確認することができます。',
  '発送はeBayに登録されている住所にのみ可能です。他の住所への発送をご希望の場合は、eBayで住所を変更した上でご注文ください。',
  '発送は月曜日から金曜日までです。週末は運送会社がお休みのため、ご利用いただけません。',
  '商品価格を低く記載することや、販売品をgiftと記載することは行いません(日本・米国をはじめ各国の規制で禁じられているためです)。',
  '住所により遠隔地料金がかかる場合があります。お客様の作業は不要です。ご注文後にこちらで確認し、追加送料が必要な場合のみ発送前にご連絡します。お支払いはeBay上で安全に行えます。',
];

const IMPORT_US = {
  jaHeading: '米国在住の購入者様:',
  enHeading: 'For buyers in the United States:',
  ja: [
    '輸入関税および税金は商品価格または送料に含まれています。',
    '米国宛ての商品は「関税込み(DDP)」方式で発送されます。これは輸入関連費用がすべて前払いされていることを意味します。',
    '商品到着時に追加料金を支払う必要はありません。',
  ],
  en: [
    'Import duties and taxes are included in the item price or shipping cost.',
    'Items shipped to the U.S. are sent under the Delivered Duty Paid (DDP) method, which means all import-related charges are prepaid.',
    "You don't need to pay any additional fees when your order arrives.",
  ],
};
const IMPORT_INTL = {
  jaHeading: '米国以外の購入者様:',
  enHeading: 'For buyers outside the United States:',
  ja: [
    '輸入関税、税金、および諸費用は商品価格または送料に含まれておりません。これらの費用はバイヤー様のご負担となります。',
    'これらの費用は購入者様の負担となります。',
    '入札または購入前に、お住まいの国の税関事務所に確認し、これらの追加費用がいくらになるかご確認ください。',
  ],
  en: [
    'Import duties, taxes, and charges are not included in the item price or shipping cost.',
    "These charges are the buyer's responsibility.",
    "Please check with your country's customs office to determine what these additional costs will be before bidding or buying.",
  ],
};

export function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function linesToLis(text: string, extraClass?: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<li${extraClass ? ` class="${extraClass}"` : ''}>${escapeHtml(l)}</li>`)
    .join('');
}

function bilingualLis(ja: string, en: string, isPreview: boolean): string {
  let html = linesToLis(en);
  if (isPreview) html += linesToLis(ja, 'jp-preview-only');
  return html;
}

function enLis(arr: string[]): string {
  return arr.map((t) => `<li>${t}</li>`).join('');
}
function jaPreviewLis(arr: string[]): string {
  return arr.map((t) => `<li class="jp-preview-only">${t}</li>`).join('');
}

function buildImportBlock(
  block: { jaHeading: string; enHeading: string; ja: string[]; en: string[] },
  isPreview: boolean,
): string {
  let html = '';
  if (isPreview) {
    html +=
      `<h3 class="jp-preview-only">${block.jaHeading}</h3>` +
      `<div class="product__intro jp-preview-only" property="description"><ol>${jaPreviewLis(block.ja)}</ol></div>`;
  }
  html += `<h3>${block.enHeading}</h3><div class="product__intro" property="description"><ol>${enLis(block.en)}</ol></div>`;
  return html;
}

function buildShippingAndImportHtml(isPreview: boolean): string {
  const shippingLis = (isPreview ? jaPreviewLis(SHIPPING_JA) : '') + enLis(SHIPPING_EN);
  return (
    `<aside><div class="shipping aside__item change-color-3 change-background-color"><h2 class="section__heading">Shipping</h2><div class="product__intro" property="description"><ol>${shippingLis}</ol></div></div>` +
    '<div class="caution aside__item change-color-3 change-background-color"><h2 class="change-color-1 change-color-2 change-color-6 change-background-color change-text-color change-border-color change-triangle-color">About Importer\'s Obligation</h2>' +
    buildImportBlock(IMPORT_US, isPreview) +
    buildImportBlock(IMPORT_INTL, isPreview) +
    '<p>Thank you for your understanding.</p></div></aside>'
  );
}

export interface SpecificsRow {
  en: string;
  value: string;
}

export function currentGenreSpecifics(state: ListingFormState): SpecificsRow[] {
  const genre = state.genre;
  if (!genre || !GENRE_FIELDS[genre]) return [];
  const def = GENRE_FIELDS[genre];
  const rows: SpecificsRow[] = [];
  for (const f of def.fields) {
    const v = (state.specifics[specificFieldKey(genre, f.id)] ?? '').trim();
    if (v) rows.push({ en: f.en, value: v });
  }
  return rows;
}

/**
 * §39-42(§110 step7): eBay Taxonomy API由来のItem Specifics(state.aspectValues)。
 * 旧ジャンル固定版(currentGenreSpecifics)と統合してプレビュー/説明文HTMLに表示する。
 */
function currentEbayAspectSpecifics(state: ListingFormState): SpecificsRow[] {
  const rows: SpecificsRow[] = [];
  for (const [aspectName, values] of Object.entries(state.aspectValues)) {
    const v = values.filter((s) => s.trim() !== '');
    if (v.length > 0) rows.push({ en: aspectName, value: v.join(', ') });
  }
  return rows;
}

function allSpecificsRows(state: ListingFormState): SpecificsRow[] {
  return [...currentEbayAspectSpecifics(state), ...currentGenreSpecifics(state)];
}

export function buildSpecificsText(state: ListingFormState): string {
  const rows = allSpecificsRows(state);
  if (!rows.length) return '';
  return rows.map((r) => `${r.en}: ${r.value}`).join('\n');
}

function buildSpecificsHtml(state: ListingFormState): string {
  const rows = allSpecificsRows(state);
  if (!rows.length) return '';
  const rowsHtml = rows
    .map((r) => `<tr><td>${escapeHtml(r.en)}</td><td>${escapeHtml(r.value)}</td></tr>`)
    .join('');
  return (
    '<div class="main__item"><h3 class="pBottom-10">Specifications</h3>' +
    `<table><tr><th>Specification</th><th>Details</th></tr>${rowsHtml}</table></div>`
  );
}

function relativeLuminance(hex: string): number {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 1;
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => parseInt(h, 16));
  const [cr, cg, cb] = [r, g, b].map((c) => {
    const cs = (c ?? 0) / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * cr! + 0.7152 * cg! + 0.0722 * cb!;
}

/** §49: 空欄セクションは出力しないルールに対応した main__item ビルダー */
function optionalSection(heading: string, ja: string, en: string, isPreview: boolean): string {
  if (!ja.trim() && !en.trim()) return '';
  return (
    `<div class="main__item"><h3 class="pBottom-10">${heading}</h3>` +
    `<div class="product__intro" property="description"><ol>${bilingualLis(ja, en, isPreview)}</ol></div></div>`
  );
}

export function buildDescriptionHtml(state: ListingFormState, isPreview: boolean): string {
  const title = state.title || '[商品タイトルを入力]';
  const border = state.templateColors.border || '#000000';
  const accent = state.templateColors.accent || '#fff100';
  const headerInk = relativeLuminance(accent) > 0.5 ? '#111111' : '#ffffff';
  const themeStyle = `--tmpl-border:${border};--tmpl-accent:${accent};--tmpl-header-ink:${headerInk};`;
  const banner = isPreview
    ? '<p class="jp-preview-banner">ピンク色で表示されている日本語は下書き確認用です。コピーされるHTML・実際の出品には含まれません。</p>'
    : '';

  const sections = [
    optionalSection('About This Item', state.about.ja, state.about.en, isPreview),
    optionalSection('Appearance', state.appearance.ja, state.appearance.en, isPreview),
    optionalSection('Condition', state.conditionDetail.ja, state.conditionDetail.en, isPreview),
    optionalSection('Included Items', state.includedItems.ja, state.includedItems.en, isPreview),
    buildSpecificsHtml(state),
  ]
    .filter(Boolean)
    .join('');

  return (
    TEMPLATE_HEAD +
    `<div class="template__main variant-3 change-color-3 change-background-color" style="${themeStyle}">` +
    banner +
    `<h1>${escapeHtml(title)}</h1>` +
    `<section class="product__desc"><h2 class="section__heading">Description</h2><div class="product">${sections}</div></section>` +
    buildShippingAndImportHtml(isPreview) +
    '</div>'
  );
}
