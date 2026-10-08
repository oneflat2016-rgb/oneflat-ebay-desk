import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { getItemViewWatchCounts } from '@/services/ebay/trading';
import { listPublishedListings } from '@/repositories/listings';
import { recordTrafficSnapshots } from '@/repositories/traffic';
import { recordSyncJobFailure, recordSyncJobSuccess } from '@/repositories/syncJobs';

/**
 * §34(最新実装指示書, Phase6): View/Watch分析の同期エンドポイント。
 * eBay Trading API(GetItem)から出品中(ACTIVE)の各Listingの
 * View数・Watch数を取得し、traffic_snapshotsへ追記する。
 * §29と同じ方針で、ADMIN/LISTERのみ実行可能(閲覧専用Roleは不可)。
 *
 * 注文同期(orders)と違い「前回以降の差分」という概念が無く、毎回
 * 「今出品中の全件の現在値」を取得する設計(cursorは使わない)。
 */
export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }
  if (profile.role !== 'ADMIN' && profile.role !== 'LISTER') {
    return NextResponse.json({ message: 'View/Watchの同期はADMIN/LISTERのみ実行できます。' }, { status: 403 });
  }

  const startedAt = new Date().toISOString();
  try {
    const listings = await listPublishedListings();
    const activeWithEbayId = listings.filter((l) => l.status === 'ACTIVE' && l.ebayListingId);
    if (activeWithEbayId.length === 0) {
      await recordSyncJobSuccess('traffic', { startedAt, cursor: null, resultJson: { snapshotsRecorded: 0 } });
      return NextResponse.json({ snapshotsRecorded: 0, failedCount: 0 });
    }

    const accessToken = await getEbayUserAccessToken(profile.organizationId);
    const counts = await getItemViewWatchCounts(
      accessToken,
      activeWithEbayId.map((l) => l.ebayListingId as string),
    );

    const snapshots = activeWithEbayId
      .map((l) => {
        const count = counts.get(l.ebayListingId as string);
        if (!count) return null; // GetItem失敗分はスナップショットに残さない(失敗件数としてのみ数える)
        return { listingId: l.id, viewItemCount: count.viewItemCount, watchCount: count.watchCount };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    await recordTrafficSnapshots(snapshots);

    const failedCount = activeWithEbayId.length - snapshots.length;
    await recordSyncJobSuccess('traffic', {
      startedAt,
      cursor: null,
      resultJson: { snapshotsRecorded: snapshots.length, failedCount },
    });

    return NextResponse.json({ snapshotsRecorded: snapshots.length, failedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/ebay/sync/traffic] failed', message);
    await recordSyncJobFailure('traffic', { startedAt, errorJson: { message } }).catch(() => {});
    return NextResponse.json({ message: `View/Watchの同期に失敗しました: ${message}` }, { status: 502 });
  }
}
