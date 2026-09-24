import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getProductById } from '@/repositories/products';
import { getImagesForAnalysis } from '@/repositories/productImages';
import {
  createAiRun,
  createAiSuggestions,
  findSucceededRunByInputHash,
  suggestionsToProductAnalysis,
} from '@/repositories/aiRuns';
import { analyzeProduct } from '@/services/ai/analyzeProduct';
import { getAnthropicModel } from '@/services/ai/client';
import type { ProductAnalysis } from '@/types/ai';

/**
 * §34-36: 商品写真からブランド/型番/商品種別を推定するAI解析のBackendエンドポイント。
 * §102: 未認証では呼べない(/api/ai/translateとは異なり、これは商品IDに紐づくため)。
 * §85: 同一商品・同一写真構成(input_hash一致)であれば、Claudeを再度呼ばず
 * 既存のai_suggestionsを再利用する(force:trueで再実行を強制できる)。
 */

const requestSchema = z.object({
  productId: z.string().uuid(),
  note: z.string().max(2000).optional(),
  force: z.boolean().optional(),
});

function toSuggestionInputs(analysis: ProductAnalysis) {
  return [
    { fieldName: 'brand', suggestedValue: analysis.brand.value, confidence: analysis.brand.confidence, reason: analysis.brand.evidence },
    { fieldName: 'model', suggestedValue: analysis.model.value, confidence: analysis.model.confidence, reason: analysis.model.evidence },
    { fieldName: 'mpn', suggestedValue: analysis.mpn.value, confidence: analysis.mpn.confidence, reason: analysis.mpn.evidence },
    {
      fieldName: 'productType',
      suggestedValue: analysis.productType.value,
      confidence: analysis.productType.confidence,
      reason: analysis.productType.evidence,
    },
    { fieldName: 'visibleText', suggestedValue: analysis.visibleText, confidence: 1 },
    { fieldName: 'includedItems', suggestedValue: analysis.includedItems, confidence: 1 },
    { fieldName: 'unknownFields', suggestedValue: analysis.unknownFields, confidence: 1 },
  ];
}

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
  const { productId, note, force } = parsed.data;

  // RLS(products: same organization)により、他組織の商品なら null が返る
  const product = await getProductById(productId).catch(() => null);
  if (!product) {
    return NextResponse.json({ message: '商品が見つかりません。' }, { status: 404 });
  }

  let images;
  try {
    images = await getImagesForAnalysis(productId);
  } catch (err) {
    console.error('[api/ai/analyze-product] image fetch failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: '写真の取得に失敗しました。' }, { status: 500 });
  }
  if (images.length === 0) {
    return NextResponse.json(
      { message: '先に商品写真を1枚以上アップロードしてください。' },
      { status: 400 },
    );
  }

  const model = getAnthropicModel();
  const inputHash = createHash('sha256')
    .update(JSON.stringify({ productId, model, note: note ?? '', imageCount: images.length, images: images.map((i) => i.base64.length) }))
    .digest('hex');

  if (!force) {
    const cached = await findSucceededRunByInputHash('analyze_product', inputHash).catch(() => null);
    if (cached) {
      return NextResponse.json({
        analysis: suggestionsToProductAnalysis(cached.suggestions),
        cached: true,
        aiRunId: cached.run.id,
      });
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { message: 'AI解析は現在設定されていません(ANTHROPIC_API_KEY未設定)。' },
      { status: 501 },
    );
  }

  try {
    const result = await analyzeProduct({ images, note });

    const run = await createAiRun({
      productId,
      purpose: 'analyze_product',
      model,
      inputHash,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      status: 'SUCCEEDED',
      createdBy: profile.id,
    });
    await createAiSuggestions(run.id, productId, toSuggestionInputs(result.analysis));

    return NextResponse.json({ analysis: result.analysis, cached: false, aiRunId: run.id });
  } catch (err) {
    // §102: rawエラーにSecretを含めない
    console.error('[api/ai/analyze-product] failed', err instanceof Error ? err.message : err);
    try {
      await createAiRun({
        productId,
        purpose: 'analyze_product',
        model,
        inputHash,
        status: 'FAILED',
        createdBy: profile.id,
      });
    } catch {
      // ai_runsへの記録失敗はユーザー応答をブロックしない
    }
    return NextResponse.json({ message: 'AI解析に失敗しました。' }, { status: 502 });
  }
}
