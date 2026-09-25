import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { createInventoryLocation } from '@/services/ebay/inventoryLocation';

/**
 * §110 step10: Inventory Location(保管場所)の新規登録。
 * §29: eBayアカウントへの書き込みを伴うため、ADMINのみ実行可能(連携そのものと同じ方針)。
 */
export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }
  if (profile.role !== 'ADMIN') {
    return NextResponse.json({ message: '保管場所の登録はADMINのみ実行できます。' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'リクエスト内容が不正です。' }, { status: 400 });
  }

  const merchantLocationKey = String(body.merchantLocationKey ?? '').trim();
  const name = String(body.name ?? '').trim();
  const addressLine1 = String(body.addressLine1 ?? '').trim();
  const city = String(body.city ?? '').trim();
  const stateOrProvince = String(body.stateOrProvince ?? '').trim();
  const postalCode = String(body.postalCode ?? '').trim();
  const country = String(body.country ?? '').trim().toUpperCase();

  if (!merchantLocationKey || !name || !addressLine1 || !city || !postalCode || !country) {
    return NextResponse.json({ message: '必須項目が入力されていません。' }, { status: 400 });
  }

  try {
    const accessToken = await getEbayUserAccessToken(profile.organizationId);
    await createInventoryLocation(accessToken, {
      merchantLocationKey,
      name,
      addressLine1,
      city,
      stateOrProvince,
      postalCode,
      country,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    console.error('[api/ebay/inventory-locations] failed', message);
    if (message.includes('eBayアカウントが連携されていません')) {
      return NextResponse.json({ message }, { status: 409 });
    }
    return NextResponse.json({ message: '保管場所の登録に失敗しました。' }, { status: 502 });
  }
}
