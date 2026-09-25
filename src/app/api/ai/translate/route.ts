import { NextResponse } from 'next/server';
import { z } from 'zod';
import { translateJaToEn } from '@/services/ai/translate';

/**
 * §46: 日→英翻訳はすべてBackend経由でClaude APIを利用する。
 * ブラウザから直接Anthropicへ送らない(§102)。
 * MyMemory等の無料翻訳APIフォールバックは廃止(§46)。
 * §100: AIが使えなくても手入力で続行できるよう、失敗時は明確なエラーを返し、
 * クライアント側(BilingualSection)は手入力継続を促すのみで処理を止めない。
 */

const requestSchema = z.object({
  text: z.string().min(1).max(4000),
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
    const text = await translateJaToEn(parsed.data.text);
    return NextResponse.json({ text });
  } catch (err) {
    // NOTE(§102): rawエラーにSecretを含めない。ログにはトークン等を出さない。
    console.error('[api/ai/translate] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: '翻訳に失敗しました。' }, { status: 502 });
  }
}
