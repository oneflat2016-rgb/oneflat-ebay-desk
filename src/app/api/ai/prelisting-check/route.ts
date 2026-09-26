import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getImagesForAnalysis } from '@/repositories/productImages';
import { precheckListingWithAi, type PrecheckWarning } from '@/services/ai/precheckListing';

/**
 * §24(指示書「最新実装指示書」): 出品前AIチェックのBackendエンドポイント。
 * §25: これは警告のみでPublishを強制的にブロックしない(最終判断は人間が行う)。
 * §43/§44: 入力有無などの機械的チェックはAIを使わずここで直接判定し、
 * 写真との突き合わせが必要なチェックだけをClaude(precheckListingWithAi)へ委ねる。
 */

export interface PrelistingCheckWarning {
  source: 'rule' | 'ai';
  category: string;
  message: string;
}

const requestSchema = z.object({
  productId: z.string().uuid().nullable(),
  title: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  categoryId: z.string().nullable(),
  ebayConditionId: z.string().nullable(),
  conditionDetailJa: z.string(),
  conditionDetailEn: z.string(),
  aboutEn: z.string(),
  appearanceEn: z.string(),
  includedItemsEn: z.string(),
  fulfillmentPolicyId: z.string().nullable(),
  paymentPolicyId: z.string().nullable(),
  returnPolicyId: z.string().nullable(),
  merchantLocationKey: z.string().nullable(),
  price: z.string(),
});

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'invalid request body' }, { status: 400 });
  }
  const data = parsed.data;

  const warnings: PrelistingCheckWarning[] = [];

  // --- ルールベースのチェック(AIを使わない、§43/§44) ---
  if (!data.title.trim()) {
    warnings.push({ source: 'rule', category: 'missing_title', message: 'タイトルが未入力です。' });
  }
  if (!data.brand?.trim() && !data.model?.trim()) {
    warnings.push({
      source: 'rule',
      category: 'unknown_brand',
      message: 'ブランド・商品名(型番)がどちらも未入力です(§24: ブランド不明)。',
    });
  }
  if (!data.categoryId) {
    warnings.push({ source: 'rule', category: 'missing_category', message: 'eBayカテゴリーが未選択です。' });
  }
  if (!data.ebayConditionId) {
    warnings.push({ source: 'rule', category: 'missing_condition', message: 'eBayのConditionが未選択です。' });
  }
  const conditionDetailLength = (data.conditionDetailEn || data.conditionDetailJa).trim().length;
  if (conditionDetailLength < 8) {
    warnings.push({
      source: 'rule',
      category: 'thin_condition_detail',
      message: 'Condition(状態)の詳細説明が短すぎるか未入力です(§24: Condition説明不足)。',
    });
  }
  const missingPolicies = [
    !data.fulfillmentPolicyId && '配送(Fulfillment)ポリシー',
    !data.paymentPolicyId && '支払い(Payment)ポリシー',
    !data.returnPolicyId && '返品(Return)ポリシー',
    !data.merchantLocationKey && '保管場所(Inventory Location)',
  ].filter((v): v is string => Boolean(v));
  if (missingPolicies.length > 0) {
    warnings.push({
      source: 'rule',
      category: 'missing_shipping_setup',
      message: `未設定の項目があります(§24: 配送方法未設定): ${missingPolicies.join(' / ')}`,
    });
  }
  const priceNum = Number(data.price);
  if (!data.price || Number.isNaN(priceNum) || priceNum <= 0) {
    warnings.push({ source: 'rule', category: 'missing_price', message: '価格が未入力、または0以下です。' });
  }

  // --- 写真取得(AIチェック用。写真が無ければAIチェックはスキップ) ---
  let images: Awaited<ReturnType<typeof getImagesForAnalysis>> = [];
  if (data.productId) {
    try {
      images = await getImagesForAnalysis(data.productId);
    } catch (err) {
      console.error('[api/ai/prelisting-check] image fetch failed', err instanceof Error ? err.message : err);
    }
  }
  if (images.length === 0) {
    warnings.push({
      source: 'rule',
      category: 'no_photos',
      message: '商品写真が1枚もアップロードされていません。',
    });
  }

  // --- AIチェック(§24: 型番不一致・商品説明と写真の矛盾・禁止表現) ---
  if (images.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const descriptionEn = [data.aboutEn, data.appearanceEn, data.conditionDetailEn, data.includedItemsEn]
        .filter((v) => v.trim())
        .join('\n');
      const aiWarnings: PrecheckWarning[] = await precheckListingWithAi({
        images,
        brand: data.brand,
        model: data.model,
        title: data.title,
        descriptionEn,
      });
      for (const w of aiWarnings) {
        warnings.push({ source: 'ai', category: w.category, message: w.message });
      }
    } catch (err) {
      // NOTE(§102): rawエラーにSecretを含めない。AIチェックの失敗はルールベースの結果を止めない(§100相当)。
      console.error('[api/ai/prelisting-check] AI check failed', err instanceof Error ? err.message : err);
      warnings.push({
        source: 'rule',
        category: 'ai_check_unavailable',
        message: 'AIによる写真突き合わせチェックは実行できませんでした(この点は目視で確認してください)。',
      });
    }
  }

  return NextResponse.json({ warnings });
}
