import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { findSimilarSoldItems } from '@/repositories/salesHistory';
import { generatePriceSuggestion } from '@/services/ai/suggestPrice';

/**
 * §15(指示書「最新実装指示書」): AI価格提案のBackendエンドポイント。
 * §11(自社販売実績照合)のデータをまず取得し、それを根拠としてClaudeに価格を提案させる。
 * §25: あくまで提案であり、Publish同様に人間の最終判断をブロックしない。
 */

const requestSchema = z.object({
  brand: z.string().nullable(),
  model: z.string().nullable(),
  condition: z.string().nullable(),
  categoryName: z.string().nullable(),
});

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { message: 'AI機能(ANTHROPIC_API_KEY)が設定されていません。' },
      { status: 501 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: 'リクエストの形式が正しくありません。' }, { status: 400 });
  }

  try {
    const similarItems = await findSimilarSoldItems({
      brand: parsed.data.brand,
      model: parsed.data.model,
      categoryName: parsed.data.categoryName,
      limit: 10,
    });

    const comparableSales = similarItems
      .filter((item) => item.salePrice !== null)
      .map((item) => ({
        title: item.title,
        salePrice: item.salePrice as number,
        currency: item.currency,
      }));

    const suggestion = await generatePriceSuggestion({
      brand: parsed.data.brand,
      model: parsed.data.model,
      condition: parsed.data.condition,
      categoryName: parsed.data.categoryName,
      comparableSales,
    });

    return NextResponse.json({ suggestion, comparableSalesCount: comparableSales.length });
  } catch (err) {
    console.error('[api/ai/suggest-price] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: 'AI価格提案に失敗しました。' }, { status: 502 });
  }
}
