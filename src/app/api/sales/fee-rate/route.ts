import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getAverageFeeRate } from '@/repositories/salesHistory';

/**
 * §16-17(最新実装指示書, Phase5): 利益シミュレーションで使う「手数料率」の目安をDBから計算する。
 * ログイン済みなら誰でも参照可(閲覧専用の社内データ)。
 */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }

  try {
    const result = await getAverageFeeRate();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/sales/fee-rate] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: '手数料率の取得に失敗しました。' }, { status: 502 });
  }
}
