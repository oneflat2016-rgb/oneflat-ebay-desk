import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { fetchRecentTransactions } from '@/services/ebay/finances';
import { upsertFinanceTransactions } from '@/repositories/orders';
import { getLastSuccessfulCursor, recordSyncJobFailure, recordSyncJobSuccess } from '@/repositories/syncJobs';

/**
 * §10(最新実装指示書)/Phase2 §23(§53): eBay Finances APIから取引(売上・手数料)を取得し、
 * ONEFLAT DB(finance_transactions)へ保存する同期エンドポイント。
 */
export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }
  if (profile.role !== 'ADMIN' && profile.role !== 'LISTER') {
    return NextResponse.json({ message: '取引の同期はADMIN/LISTERのみ実行できます。' }, { status: 403 });
  }

  const startedAt = new Date().toISOString();
  try {
    const accessToken = await getEbayUserAccessToken(profile.organizationId);
    const cursor = await getLastSuccessfulCursor('finances');
    const transactions = await fetchRecentTransactions(accessToken, { transactionDateFrom: cursor ?? undefined });
    const result = await upsertFinanceTransactions(transactions);

    await recordSyncJobSuccess('finances', {
      startedAt,
      cursor: result.latestTransactionDate ?? cursor,
      resultJson: result,
    });

    return NextResponse.json({ transactionsUpserted: result.transactionsUpserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/ebay/sync/finances] failed', message);
    await recordSyncJobFailure('finances', { startedAt, errorJson: { message } }).catch(() => {});
    return NextResponse.json({ message: `取引の同期に失敗しました: ${message}` }, { status: 502 });
  }
}
