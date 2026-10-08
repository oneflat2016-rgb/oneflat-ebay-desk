'use server';

import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import * as listingsRepo from '@/repositories/listings';
import { recordPriceChange } from '@/repositories/priceHistory';
import { updateOffer } from '@/services/ebay/inventory';
import { resolveOfferUpdateContext } from './offerUpdateHelpers';

/**
 * §110 step12(2026-09-26): 出品済みListing一覧画面からの価格改定。
 * eBay Sell Inventory APIの `PUT /offer/{offerId}` は置換動作なので、価格だけでなく
 * カテゴリー・保管場所・各種ポリシー・説明文HTMLもあわせて送る必要がある
 * (services/ebay/inventory.tsのupdateOffer参照)。共通の事前チェック・説明文解決は
 * offerUpdateHelpers.tsのresolveOfferUpdateContextにまとめてある。
 */
export interface UpdateListingPriceResult {
  ok: boolean;
  error?: string;
}

export async function updateListingPrice(
  listingId: string,
  newPriceInput: string,
): Promise<UpdateListingPriceResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, error: 'ログインが必要です。' };
  }

  const newPrice = Number(newPriceInput);
  if (!newPriceInput || Number.isNaN(newPrice) || newPrice <= 0) {
    return { ok: false, error: '価格は0より大きい数値で入力してください。' };
  }

  const resolved = await resolveOfferUpdateContext(listingId, profile.organizationId);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  const { detail, accessToken, descriptionHtml } = resolved.context;

  try {
    await updateOffer(accessToken, detail.ebayOfferId as string, {
      sku: detail.sku,
      categoryId: detail.categoryId as string,
      price: newPrice,
      currency: detail.currency ?? 'USD',
      quantity: detail.quantity ?? 1,
      merchantLocationKey: detail.merchantLocationKey as string,
      paymentPolicyId: detail.paymentPolicyId as string,
      fulfillmentPolicyId: detail.fulfillmentPolicyId as string,
      returnPolicyId: detail.returnPolicyId as string,
      marketplaceId: detail.marketplaceId,
      listingDescriptionHtml: descriptionHtml,
    });

    if (detail.listingDraftId) {
      await listingsRepo.updateDraftPriceOnly(detail.listingDraftId, newPrice);
    }

    // §33: 値下げ履歴に記録する(値段が変わっていない場合はrecordPriceChange内でスキップされる)。
    const oldPrice = detail.price !== null ? Number(detail.price) : null;
    if (oldPrice !== null) {
      await recordPriceChange(listingId, oldPrice, newPrice, detail.currency ?? 'USD', profile.id);
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました。';
    console.error('[updateListingPrice] failed', message);
    return { ok: false, error: message };
  }
}
