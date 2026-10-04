import { NextResponse } from 'next/server';
import { z } from 'zod';
import { translateAspectNamesToJa } from '@/services/ai/translateAspectNames';

/**
 * 2026-10-04: 商品仕様(Item Specifics)の項目名のうち、固定の対訳辞書
 * (src/lib/listing/aspectNameJa.ts)に無いものだけをAIへまとめて送り、
 * 表示用の日本語訳を取得する。eBayへ送信するデータそのものには一切影響しない
 * (§117-2: 送信する項目名・候補値はeBayのレスポンスのまま)。
 * §100: AIが使えない/失敗した場合は英語表示のみにフォールバックするだけで、
 * フォームの入力・保存・出品は止めない。
 */
const requestSchema = z.object({
  names: z.array(z.string().min(1)).min(1).max(60),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'invalid request body' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { message: 'AI翻訳は現在設定されていません(ANTHROPIC_API_KEY未設定)。' },
      { status: 501 },
    );
  }

  try {
    const translations = await translateAspectNamesToJa(parsed.data.names);
    return NextResponse.json({ translations });
  } catch (err) {
    console.error('[api/ai/translate-aspect-names] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: '項目名の日本語訳取得に失敗しました。' }, { status: 502 });
  }
}
