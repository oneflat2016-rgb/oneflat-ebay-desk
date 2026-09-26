'use server';

import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import * as listingsRepo from '@/repositories/listings';
import { updateOffer } from '@/services/ebay/inventory';
import { resolveOfferUpdateContext } from './offerUpdateHelpers';

/**
 * §110 step12(2026-09-26): 出品済みListing一覧画面からの在庫同期(数量変更)。
 * priceActions.tsの価格改定と同じ設計(eBay Offerの `PUT /offer/{offerId}` は置換動作)。
 * 共通の事前チェック・説明文解決はofferUpdateHelpers.tsのresolveOfferUpdateContextを使う。
 * 数量は0(在庫切れとして表示したい場合)も許可する。
 */
export interface UpdateListingQuantityResult {
  ok: boolean;
  error?: string;
}

export async function updateListingQuantity(
  listingId: string,
  newQuantityInput: string,
): Promise<UpdateListingQuantityResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, error: 'ログインが必要です。' };
  }

  const newQuantity = Number(newQuantityInput);
  if (newQuantityInput === '' || !Number.isInteger(newQuantity) || newQuantity < 0) {
    return { ok: false, error: '数量は0以上の整数で入力してください。' };
  }

  const resolved = await resolveOfferUpdateContext(listingId, profile.organizationId);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  const { detail, accessToken, descriptionHtml } = resolved.context;

  if (!detail.price) {
    return { ok: false, error: '現在の価格が取得できないため、安全のため更新を中止しました。' };
  }

  try {
    await updateOffer(accessToken, detail.ebayOfferId as string, {
      sku: detail.sku,
      categoryId: detail.categoryId as string,
      price: Number(detail.price),
      currency: detail.currency ?? 'USD',
      quantity: newQuantity,
      merchantLocationKey: detail.merchantLocationKey as string,
      paymentPolicyId: detail.paymentPolicyId as string,
      fulfillmentPolicyId: detail.fulfillmentPolicyId as string,
      returnPolicyId: detail.returnPolicyId as string,
      marketplaceId: detail.marketplaceId,
      listingDescriptionHtml: descriptionHtml,
    });

    if (detail.listingDraftId) {
      await listingsRepo.updateDraftQuantityOnly(detail.listingDraftId, newQuantity);
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました。';
    console.error('[updateListingQuantity] failed', message);
    return { ok: false, error: message };
  }
}
