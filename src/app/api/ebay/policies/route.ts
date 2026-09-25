import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getSellerSetupData } from '@/services/ebay/sellerSetup';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { createFulfillmentPolicy, createPaymentPolicy, createReturnPolicy } from '@/services/ebay/account';

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

/**
 * §110 step10: Business Policiesの新規作成(eBay Sandboxの管理画面が不安定/未提供の
 * ケースへの回避策)。§29: eBayアカウントへの書き込みを伴うため、ADMINのみ実行可能。
 * body: { kind: 'FULFILLMENT'|'PAYMENT'|'RETURN', name: string, handlingTimeDays?, returnPeriodDays? }
 */
export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }
  if (profile.role !== 'ADMIN') {
    return NextResponse.json({ message: 'ポリシーの登録はADMINのみ実行できます。' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'リクエスト内容が不正です。' }, { status: 400 });
  }

  const kind = String(body.kind ?? '');
  const name = String(body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ message: '名前は必須です。' }, { status: 400 });
  }
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US';

  try {
    const accessToken = await getEbayUserAccessToken(profile.organizationId);
    if (kind === 'FULFILLMENT') {
      const handlingTimeDays = Number(body.handlingTimeDays ?? 3) || 3;
      await createFulfillmentPolicy(accessToken, { name, marketplaceId, handlingTimeDays });
    } else if (kind === 'PAYMENT') {
      await createPaymentPolicy(accessToken, { name, marketplaceId });
    } else if (kind === 'RETURN') {
      const returnPeriodDays = Number(body.returnPeriodDays ?? 30) || 30;
      await createReturnPolicy(accessToken, { name, marketplaceId, returnPeriodDays });
    } else {
      return NextResponse.json({ message: 'kindが不正です。' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    console.error('[api/ebay/policies POST] failed', message);
    if (message.includes('eBayアカウントが連携されていません')) {
      return NextResponse.json({ message }, { status: 409 });
    }
    return NextResponse.json({ message }, { status: 502 });
  }
}
