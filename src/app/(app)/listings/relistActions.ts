'use server';

import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import * as listingsRepo from '@/repositories/listings';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { publishOffer } from '@/services/ebay/inventory';

/**
 * §110 step12(2026-09-26): 出品済みListing一覧画面からの再出品。
 * 終了済み(ENDED)のListingのOfferに対してpublishOfferをもう一度呼ぶだけで再出品できる
 * (repositories/listings.tsのgetListingForRelistのコメント参照)。
 * 成功したら、新しいeBay Listing IDで`listings`テーブルに別レコードを作成する
 * (古いENDEDレコードは出品終了の履歴としてそのまま残す)。
 */
export interface RelistListingResult {
  ok: boolean;
  listingId?: string;
  error?: string;
}

export async function relistListing(listingId: string): Promise<RelistListingResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, error: 'ログインが必要です。' };
  }

  const listing = await listingsRepo.getListingForRelist(listingId);
  if (!listing) {
    return { ok: false, error: '対象のListingが見つかりませんでした。' };
  }
  if (listing.status !== 'ENDED') {
    return { ok: false, error: '終了済み(ENDED)のListingのみ再出品できます。' };
  }
  if (!listing.ebayOfferId) {
    return { ok: false, error: 'eBay Offer IDが見つかりません。' };
  }
  if (!listing.listingDraftId) {
    return { ok: false, error: '下書き情報が見つからないため、安全のため再出品を中止しました。' };
  }

  try {
    const accessToken = await getEbayUserAccessToken(profile.organizationId);
    const result = await publishOffer(accessToken, listing.ebayOfferId, listing.sku);

    await listingsRepo.createPublishedListing({
      productId: listing.productId,
      listingDraftId: listing.listingDraftId,
      sku: listing.sku,
      ebayListingId: result.listingId,
      ebayOfferId: result.offerId,
      marketplaceId: listing.marketplaceId,
      categoryId: listing.categoryId,
      createdBy: profile.id,
    });

    return { ok: true, listingId: result.listingId };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました。';
    console.error('[relistListing] failed', message);
    return { ok: false, error: message };
  }
}
