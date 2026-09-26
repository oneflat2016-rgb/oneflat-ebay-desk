import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateTitleCandidates } from '@/services/ai/generateTitle';

/**
 * §12(指示書「最新実装指示書」): AIタイトル生成はすべてBackend経由でClaude APIを利用する。
 * ブラウザから直接Anthropicへ送らない(§42/§102)。
 * §100相当: AIが使えなくても手入力・ヒューリスティック生成で続行できるよう、
 * 失敗時は明確なエラーを返し、クライアント側(TitleSection)は処理を止めない。
 */

const requestSchema = z.object({
  brand: z.string().trim().max(200).nullable(),
  model: z.string().trim().max(200).nullable(),
  condition: z.string().trim().max(200).nullable(),
  keyAspects: z.record(z.string(), z.array(z.string())).default({}),
  keywords: z.string().trim().max(500).default(''),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'invalid request body' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { message: 'AIタイトル生成は現在設定されていません(ANTHROPIC_API_KEY未設定)。' },
      { status: 501 },
    );
  }

  try {
    const titles = await generateTitleCandidates(parsed.data);
    return NextResponse.json({ titles });
  } catch (err) {
    // NOTE(§42/§102): rawエラーにSecretを含めない。ログにはトークン等を出さない。
    console.error('[api/ai/generate-title] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: 'AIタイトル生成に失敗しました。' }, { status: 502 });
  }
}
