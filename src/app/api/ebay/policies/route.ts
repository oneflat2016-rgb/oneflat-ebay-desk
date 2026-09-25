import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getSellerSetupData } from '@/services/ebay/sellerSetup';

/**
 * §110 step10: Business Policies(配送/支払い/返品)+ Inventory Locationの一覧取得。
 * §102: 未認証では呼べない(ADMIN限定ではない。LISTER/CREATORも出品下書き作成時に
 * 選択肢として必要なため、閲覧はorganizationメンバー全員に許可する)。
 */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }

  const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US';

  try {
    const data = await getSellerSetupData(profile.organizationId, marketplaceId);
    return NextResponse.json(data);
  } catch (err) {
    // §102: rawエラーにSecret/Refresh Tokenを含めない
    const message = err instanceof Error ? err.message : '不明なエラー';
    console.error('[api/ebay/policies] failed', message);
    if (message.includes('eBayアカウントが連携されていません')) {
      return NextResponse.json({ message }, { status: 409 });
    }
    return NextResponse.json({ message: 'Business Policies/保管場所の取得に失敗しました。' }, { status: 502 });
  }
}
