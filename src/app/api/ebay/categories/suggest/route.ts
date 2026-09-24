import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { suggestCategories } from '@/services/ebay/taxonomy';
import type { EbayCategorySuggestion } from '@/types/ebay';

/**
 * §37-38(§110 step6): eBay Taxonomy APIによるカテゴリー候補取得。
 * §102: 未認証では呼べない。
 * marketplace_idは今のところebay_accounts(§9のOAuth連携, step9で実装)がまだ無いため、
 * 環境変数EBAY_MARKETPLACE_ID(既定 EBAY_US)を使う。ADMINがeBayアカウントを連携した後は
 * そのアカウントのmarketplace_idを優先する予定(TODO §110 step9以降)。
 */
export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return NextResponse.json({ message: '検索キーワード(q)が必要です。' }, { status: 400 });
  }

  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    return NextResponse.json(
      { message: 'eBay連携は現在設定されていません(EBAY_CLIENT_ID/SECRET未設定)。' },
      { status: 501 },
    );
  }

  const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US';

  try {
    const suggestions: EbayCategorySuggestion[] = await suggestCategories({ marketplaceId, query: q });
    return NextResponse.json({ suggestions });
  } catch (err) {
    // §102: rawエラーにSecretを含めない
    console.error('[api/ebay/categories/suggest] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: 'カテゴリー候補の取得に失敗しました。' }, { status: 502 });
  }
}
