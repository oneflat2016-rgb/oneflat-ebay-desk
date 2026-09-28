import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { fetchRecentOrders } from '@/services/ebay/fulfillment';
import { upsertOrdersFromEbay } from '@/repositories/orders';
import { getLastSuccessfulCursor, recordSyncJobFailure, recordSyncJobSuccess } from '@/repositories/syncJobs';

/**
 * §10(最新実装指示書)/Phase2 §21-22(§53): eBay Fulfillment APIから注文を取得し、
 * ONEFLAT DB(orders/order_items)へ保存する同期エンドポイント。
 * §29: 注文データへのアクセスのため、ADMIN/LISTERのみ実行可能(閲覧専用Roleは不可)。
 */
export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }
  if (profile.role !== 'ADMIN' && profile.role !== 'LISTER') {
    return NextResponse.json({ message: '注文の同期はADMIN/LISTERのみ実行できます。' }, { status: 403 });
  }

  const startedAt = new Date().toISOString();
  try {
    const accessToken = await getEbayUserAccessToken(profile.organizationId);
    const cursor = await getLastSuccessfulCursor('orders');
    const orders = await fetchRecentOrders(accessToken, { creationDateFrom: cursor ?? undefined });
    const result = await upsertOrdersFromEbay(orders);

    await recordSyncJobSuccess('orders', {
      startedAt,
      cursor: result.latestCreationDate ?? cursor,
      resultJson: result,
    });

    return NextResponse.json({
      ordersUpserted: result.ordersUpserted,
      itemsUpserted: result.itemsUpserted,
    });
  } catch (err) {
    // NOTE(§102): rawエラーにSecretを含めない
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/ebay/sync/orders] failed', message);
    await recordSyncJobFailure('orders', { startedAt, errorJson: { message } }).catch(() => {});
    return NextResponse.json({ message: `注文の同期に失敗しました: ${message}` }, { status: 502 });
  }
}
