import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateDescriptionDrafts } from '@/services/ai/generateDescription';

/**
 * §13(指示書「最新実装指示書」)/§45-46・§49: AI説明文下書き生成はすべてBackend経由で
 * Claude APIを利用する。ブラウザから直接Anthropicへ送らない(§42/§102)。
 * §100相当: AIが使えなくても手入力で続行できるよう、失敗時は明確なエラーを返し、
 * クライアント側は処理を止めない(手入力欄はそのまま残る)。
 */

const requestSchema = z.object({
  productType: z.string().trim().max(200).nullable(),
  confirmedAspects: z.record(z.string(), z.string()).default({}),
  conditionNotes: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'invalid request body' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { message: 'AI説明文生成は現在設定されていません(ANTHROPIC_API_KEY未設定)。' },
      { status: 501 },
    );
  }

  try {
    const drafts = await generateDescriptionDrafts(parsed.data);
    return NextResponse.json(drafts);
  } catch (err) {
    // NOTE(§42/§102): rawエラーにSecretを含めない。ログにはトークン等を出さない。
    console.error('[api/ai/generate-description] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: 'AI説明文生成に失敗しました。' }, { status: 502 });
  }
}
