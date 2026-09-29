import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { findSimilarSoldItems } from '@/repositories/salesHistory';

/**
 * §11(最新実装指示書, Phase4): 自社販売実績照合のBackendエンドポイント。
 * ログインしていれば誰でも参照可能(閲覧専用の社内データのため、
 * §10のsyncエンドポイントよりRole制限はゆるくしてある)。
 */

const requestSchema = z.object({
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: 'リクエストの形式が正しくありません。' }, { status: 400 });
  }

  try {
    const items = await findSimilarSoldItems({
      brand: parsed.data.brand ?? null,
      model: parsed.data.model ?? null,
      categoryName: parsed.data.categoryName ?? null,
      limit: 10,
    });
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[api/sales/similar] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: '類似販売実績の検索に失敗しました。' }, { status: 502 });
  }
}
