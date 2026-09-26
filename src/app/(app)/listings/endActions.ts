'use server';

import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import * as listingsRepo from '@/repositories/listings';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { withdrawOffer } from '@/services/ebay/inventory';

/**
 * §110 step12(2026-09-26): 出品済みListing一覧画面からのEnd Item(出品終了)。
 * eBay Sell Inventory APIの `POST /offer/{offerId}/withdraw` で出品を取り下げる。
 * 取り消せない操作のため、確認はUI側(EndListingButton.tsx)で行い、
 * ここでは既にENDED済みでないかをサーバー側でも再確認する(§70と同じ二重実行防止の考え方)。
 */
export interface EndListingResult {
  ok: boolean;
  error?: string;
}

export async function endListing(listingId: string): Promise<EndListingResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, error: 'ログインが必要です。' };
  }

  const listing = await listingsRepo.getListingForEnd(listingId);
  if (!listing) {
    return { ok: false, error: '対象のListingが見つかりませんでした。' };
  }
  if (listing.status !== 'ACTIVE') {
    return { ok: false, error: 'この出品は既に終了しているか、出品中ではありません。' };
  }
  if (!listing.ebayOfferId) {
    return { ok: false, error: 'eBay Offer IDが見つかりません。' };
  }

  try {
    const accessToken = await getEbayUserAccessToken(profile.organizationId);
    await withdrawOffer(accessToken, listing.ebayOfferId);
    await listingsRepo.markListingEnded(listingId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました。';
    console.error('[endListing] failed', message);
    return { ok: false, error: message };
  }
}
