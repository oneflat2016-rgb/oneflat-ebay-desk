import type { ListingFormState } from '@/types/listing';

/**
 * §31時点ではウィザードのSTEP2で使うサンプル初期値(移植元HTMLのデフォルト値)。
 * 実際の商品作成フローでは空の状態から始まり、STEP1のAI解析結果で埋まる想定(§34-36)。
 */
export function createSampleListingFormState(): ListingFormState {
  return {
    genre: 'chisel',
    brand: 'Chiyozuru',
    model: 'Oire Nomi 24mm Japanese Bench Chisel',
    keywords: 'Hand Forged, Made in Japan',
    title: 'Chiyozuru Oire Nomi 24mm Japanese Bench Chisel - Used - Excellent - Ships from Japan',
    category: 'Chisels',
    categoryPreset: '',
    categoryTreeId: null,
    categoryId: null,
    categoryName: null,
    condition: 'Used – Excellent',
    about: {
      ja: '職人が使用していた鑿(ノミ)です。刃には大きな欠けはなく、研ぎ直せばすぐに使えます。当店は海外バイヤー様への発送実績が豊富ですので、安心してご購入いただけます。',
      en: 'This is a chisel (nomi) that was used by a professional carpenter. The blade has no major chips and is ready to use again after sharpening. We have a strong track record shipping to international buyers, so please purchase with confidence.',
    },
    appearance: {
      ja: '柄には使用による色艶があり、刃部にはわずかな錆があります。全体の写真でご確認ください。',
      en: 'The handle has a nice patina from years of use, and there is slight surface rust on the blade. Please check the photos for the exact condition.',
    },
    conditionDetail: {
      ja: '刃こぼれはなく、切れ味は良好です。柄と刃のガタつきもありません。',
      en: 'There are no chips in the cutting edge and it still cuts well. The handle is firmly seated with no looseness.',
    },
    includedItems: {
      ja: '鑿本体のみの出品です。鞘(さや)や砥石は付属しません。',
      en: 'This listing includes the chisel only. The blade sheath (saya) and sharpening stone are not included.',
    },
    specifics: {},
    checklist: {},
    templateColors: { border: '#000000', accent: '#fff100' },
  };
}

export function createEmptyListingFormState(): ListingFormState {
  return {
    genre: '',
    brand: '',
    model: '',
    keywords: '',
    title: '',
    category: '',
    categoryPreset: '',
    categoryTreeId: null,
    categoryId: null,
    categoryName: null,
    condition: 'Used – Excellent',
    about: { ja: '', en: '' },
    appearance: { ja: '', en: '' },
    conditionDetail: { ja: '', en: '' },
    includedItems: { ja: '', en: '' },
    specifics: {},
    checklist: {},
    templateColors: { border: '#000000', accent: '#fff100' },
  };
}
