import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getConditionPoliciesForCategory } from '@/services/ebay/metadata';
import type { EbayConditionPolicy } from '@/types/ebay';

/**
 * §43(§110 step8): eBay Metadata APIによるカテゴリー別Condition一覧取得。
 * §102: 未認証では呼べない。
 * marketplace_idの扱いはcategories/suggest・aspects(step6-7)と同じ方針
 * (ebay_accountsができるstep9以降まではEBAY_MARKETPLACE_ID環境変数を使う)。
 */
export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get('categoryId')?.trim() ?? '';
  if (!categoryId) {
    return NextResponse.json({ message: 'categoryIdが必要です。' }, { status: 400 });
  }

  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    return NextResponse.json(
      { message: 'eBay連携は現在設定されていません(EBAY_CLIENT_ID/SECRET未設定)。' },
      { status: 501 },
    );
  }

  const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US';

  try {
    const conditions: EbayConditionPolicy[] = await getConditionPoliciesForCategory({
      marketplaceId,
      categoryId,
    });
    return NextResponse.json({ conditions });
  } catch (err) {
    // §102: rawエラーにSecretを含めない
    console.error('[api/ebay/conditions] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: 'Condition一覧の取得に失敗しました。' }, { status: 502 });
  }
}
