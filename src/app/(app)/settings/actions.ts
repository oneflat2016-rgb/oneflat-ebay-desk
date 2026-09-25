'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { disconnectEbayAccount } from '@/repositories/ebayAccounts';

/**
 * §9(§110 step9): eBayアカウント連携の解除。ADMINのみ実行できる。
 * Refresh Tokenを削除するだけで、eBay側のアプリ許可自体はeBay側の設定画面で
 * 別途取り消す必要がある(このアプリからは取り消せない旨を画面に案内する)。
 */
export async function disconnectEbayAccountAction(): Promise<void> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'ADMIN') return;

  try {
    await disconnectEbayAccount(profile.organizationId);
  } catch (err) {
    console.error('[disconnectEbayAccountAction] failed', err instanceof Error ? err.message : err);
  }
  revalidatePath('/settings');
}
