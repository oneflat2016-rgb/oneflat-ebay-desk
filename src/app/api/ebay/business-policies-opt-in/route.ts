import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { optInToBusinessPolicies } from '@/services/ebay/account';

/**
 * §110 step10: Business Policies(Selling Policy Management)プログラムへの加入。
 * §29: eBayアカウント側の設定を変更する操作のため、ADMINのみ実行可能。
 */
export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }
  if (profile.role !== 'ADMIN') {
    return NextResponse.json({ message: 'Business Policiesへの加入はADMINのみ実行できます。' }, { status: 403 });
  }

  try {
    const accessToken = await getEbayUserAccessToken(profile.organizationId);
    await optInToBusinessPolicies(accessToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    console.error('[api/ebay/business-policies-opt-in] failed', message);
    if (message.includes('eBayアカウントが連携されていません')) {
      return NextResponse.json({ message }, { status: 409 });
    }
    return NextResponse.json({ message }, { status: 502 });
  }
}
