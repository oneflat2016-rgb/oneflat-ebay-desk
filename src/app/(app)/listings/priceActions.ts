'use server';

import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import * as listingsRepo from '@/repositories/listings';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { updateOffer, getOffer } from '@/services/ebay/inventory';

/**
 * §110 step12(2026-09-26): 出品済みListing一覧画面からの価格改定。
 * eBay Sell Inventory APIの `PUT /offer/{offerId}` は置換動作なので、価格だけでなく
 * カテゴリー・保管場所・各種ポリシー・説明文HTMLもあわせて送る必要がある
 * (services/ebay/inventory.tsのupdateOffer参照)。これらが1つでも欠けている状態で
 * PUTすると、その項目がeBay側で消えてしまう恐れがあるため、事前に全項目が
 * 揃っているか検証し、1つでも欠けていれば更新せずエラーを返す。
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

  const detail = await listingsRepo.getListingForOfferUpdate(listingId);
  if (!detail) {
    return { ok: false, error: '対象のListingが見つかりませんでした。' };
  }
  if (detail.status !== 'ACTIVE') {
    return { ok: false, error: '出品中(ACTIVE)のListingのみ価格を変更できます。' };
  }
  if (!detail.ebayOfferId) {
    return { ok: false, error: 'eBay Offer IDが見つかりません。' };
  }

  const missing: string[] = [];
  if (!detail.categoryId) missing.push('カテゴリー');
  if (!detail.merchantLocationKey) missing.push('保管場所');
  if (!detail.paymentPolicyId) missing.push('支払いポリシー');
  if (!detail.fulfillmentPolicyId) missing.push('配送ポリシー');
  if (!detail.returnPolicyId) missing.push('返品ポリシー');
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Offer更新に必要な情報が不足しているため、安全のため更新を中止しました: ${missing.join(' / ')}`,
    };
  }

  try {
    const accessToken = await getEbayUserAccessToken(profile.organizationId);

    // 2026-09-26追加の修正: 「既存下書きを開き直してPublishし直す」導線がまだ未実装のため、
    // 2026-09-26より前にPublishされたListingはlisting_drafts.description_htmlが空のまま。
    // その場合はeBay側に現在登録されている説明文をGET /offerで取得して代わりに使い、
    // 取得できたらついでにDBへも保存しておく(次回以降はDB側の値をそのまま使える)。
    let descriptionHtml = detail.descriptionHtml;
    if (!descriptionHtml) {
      const existingOffer = await getOffer(accessToken, detail.ebayOfferId);
      descriptionHtml = existingOffer.listingDescription;
      if (descriptionHtml && detail.listingDraftId) {
        await listingsRepo.updateDraftDescriptionHtml(detail.listingDraftId, descriptionHtml);
      }
    }
    if (!descriptionHtml) {
      return {
        ok: false,
        error:
          'Offer更新に必要な説明文が見つかりませんでした(DB・eBay側どちらにも無いため、安全のため更新を中止しました)。',
      };
    }

    await updateOffer(accessToken, detail.ebayOfferId, {
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

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました。';
    console.error('[updateListingPrice] failed', message);
    return { ok: false, error: message };
  }
}
