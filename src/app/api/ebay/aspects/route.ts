import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getItemAspectsForCategory } from '@/services/ebay/taxonomy';
import type { EbayAspectDefinition } from '@/types/ebay';

/**
 * §39-42(§110 step7): eBay Taxonomy APIによるItem Specifics(Aspect)定義取得。
 * §102: 未認証では呼べない。
 * marketplace_idの扱いはcategories/suggest(step6)と同じ方針
 * (ebay_accountsができるstep9以降まではEBAY_MARKETPLACE_ID環境変数を使う)。
 */
export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const categoryTreeId = searchParams.get('categoryTreeId')?.trim() ?? '';
  const categoryId = searchParams.get('categoryId')?.trim() ?? '';
  if (!categoryTreeId || !categoryId) {
    return NextResponse.json(
      { message: 'categoryTreeId / categoryIdが必要です。' },
      { status: 400 },
    );
  }

  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    return NextResponse.json(
      { message: 'eBay連携は現在設定されていません(EBAY_CLIENT_ID/SECRET未設定)。' },
      { status: 501 },
    );
  }

  const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US';

  try {
    const aspects: EbayAspectDefinition[] = await getItemAspectsForCategory({
      marketplaceId,
      categoryTreeId,
      categoryId,
    });
    return NextResponse.json({ aspects });
  } catch (err) {
    // §102: rawエラーにSecretを含めない
    console.error('[api/ebay/aspects] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: '商品仕様(Item Specifics)の取得に失敗しました。' }, { status: 502 });
  }
}
