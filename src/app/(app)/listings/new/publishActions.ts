'use server';

import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import * as productsRepo from '@/repositories/products';
import * as listingsRepo from '@/repositories/listings';
import * as productImagesRepo from '@/repositories/productImages';
import * as auditRepo from '@/repositories/audit';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { createOrReplaceInventoryItem, createOffer, publishOffer } from '@/services/ebay/inventory';
import { assertValidSku } from '@/lib/sku/skuStrategy';
import { mapConditionIdToEnum } from '@/lib/ebay/conditionEnumMap';
import { buildDescriptionHtml } from '@/lib/listing/templateHtml';
import type { ListingFormState } from '@/types/listing';
import type { SaveListingIdentity } from './actions';

/**
 * §66-71, §76(§110 step11): 出品下書きを実際にeBayへPublishする。
 * §67, §70: 以下の順序を厳守する。
 *   1. Validation(必須項目 + SKU)
 *   2. status=PUBLISHINGへロック(二重出品防止)
 *   3. 画像準備(署名付きURL)
 *   4. createOrReplaceInventoryItem
 *   5. createOffer
 *   6. publishOffer
 *   7. listings テーブルへ保存 + listing_drafts.status=PUBLISHED
 *   8. audit_log書き込み(失敗してもPublish自体は成功扱いにする。§102: 監査ログの
 *      書き込み失敗でユーザー操作全体を失敗させると、逆に「何が起きたか分からない」
 *      状態を招くため)
 *
 * 呼び出し元(UI)は、事前に saveListingDraft を呼んでidentity.productId/draftIdが
 * 確定していることを前提とする(まだ一度も保存していない下書きはPublishできない)。
 */
export interface PublishListingResult {
  ok: boolean;
  listingId?: string;
  offerId?: string;
  sku?: string;
  error?: string;
}

const REQUIRED_FIELD_LABELS: { key: keyof ListingFormState; label: string }[] = [
  { key: 'title', label: 'タイトル' },
];

export async function publishListingToEbay(
  identity: SaveListingIdentity,
  state: ListingFormState,
): Promise<PublishListingResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, error: 'ログインが必要です。' };
  }

  if (!identity.productId || !identity.draftId) {
    return { ok: false, error: '先に「保存」を押して下書きを保存してください。' };
  }

  // §1: Validation ------------------------------------------------------
  const missing: string[] = [];
  for (const { key, label } of REQUIRED_FIELD_LABELS) {
    if (!state[key]) missing.push(label);
  }
  if (!state.categoryId) missing.push('カテゴリー(eBay Taxonomy検索で選択)');
  if (!state.ebayConditionId) missing.push('Condition(eBay Metadata APIから選択)');
  if (!state.merchantLocationKey) missing.push('保管場所(Inventory Location)');
  if (!state.paymentPolicyId) missing.push('支払いポリシー');
  if (!state.fulfillmentPolicyId) missing.push('配送ポリシー');
  if (!state.returnPolicyId) missing.push('返品ポリシー');

  const priceValue = Number(state.price);
  if (!state.price || Number.isNaN(priceValue) || priceValue <= 0) {
    missing.push('価格(0より大きい数値)');
  }
  if (!Number.isInteger(state.quantity) || state.quantity < 1) {
    missing.push('数量(1以上の整数)');
  }

  if (missing.length > 0) {
    return { ok: false, error: `以下の項目が未入力/未選択です: ${missing.join(' / ')}` };
  }

  const product = await productsRepo.getProductById(identity.productId);
  if (!product) {
    return { ok: false, error: '商品が見つかりませんでした。ページを再読み込みしてください。' };
  }
  try {
    assertValidSku(product.sku);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'SKUが不正です。' };
  }

  let conditionEnum: string;
  try {
    conditionEnum = mapConditionIdToEnum(state.ebayConditionId as string);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Conditionの変換に失敗しました。' };
  }

  // §2: ロック(二重出品防止) --------------------------------------------
  const locked = await listingsRepo.lockDraftForPublishing(identity.draftId);
  if (!locked) {
    return {
      ok: false,
      error: 'この下書きは既にPublish処理中、または公開済みです。ページを再読み込みして状態を確認してください。',
    };
  }

  try {
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US';
    const accessToken = await getEbayUserAccessToken(profile.organizationId);

    // §3: 画像準備 ----------------------------------------------------
    const imageUrls = await productImagesRepo.getImageUrlsForEbay(identity.productId);
    if (imageUrls.length === 0) {
      throw new Error('商品写真が1枚も登録されていません。eBayへの出品には最低1枚の写真が必要です。');
    }

    const descriptionHtml = buildDescriptionHtml(state, false);

    // §4: Inventory Item -----------------------------------------------
    await createOrReplaceInventoryItem(accessToken, {
      sku: product.sku,
      availabilityQuantity: state.quantity,
      conditionEnum,
      title: state.title,
      descriptionHtml,
      aspects: state.aspectValues,
      imageUrls,
    });

    // §5: Offer ----------------------------------------------------------
    const { offerId } = await createOffer(accessToken, {
      sku: product.sku,
      categoryId: state.categoryId as string,
      price: priceValue,
      currency: state.currency || 'USD',
      quantity: state.quantity,
      merchantLocationKey: state.merchantLocationKey as string,
      paymentPolicyId: state.paymentPolicyId as string,
      fulfillmentPolicyId: state.fulfillmentPolicyId as string,
      returnPolicyId: state.returnPolicyId as string,
      marketplaceId,
    });

    // §6: Publish ----------------------------------------------------------
    const result = await publishOffer(accessToken, offerId, product.sku);

    // §7: 保存 ----------------------------------------------------------
    await listingsRepo.createPublishedListing({
      productId: identity.productId,
      listingDraftId: identity.draftId,
      sku: product.sku,
      ebayListingId: result.listingId,
      ebayOfferId: result.offerId,
      marketplaceId,
      categoryId: state.categoryId,
      createdBy: profile.id,
    });
    await listingsRepo.markDraftPublished(identity.draftId);

    // §8: 監査ログ(失敗してもPublish自体は成功として扱う) -----------------
    try {
      await auditRepo.writeAuditLog({
        organizationId: profile.organizationId,
        userId: profile.id,
        entityType: 'listing',
        entityId: identity.draftId,
        action: 'PUBLISH',
        afterJson: { listingId: result.listingId, offerId: result.offerId, sku: product.sku },
      });
    } catch (auditErr) {
      console.error('[publishListingToEbay] audit log failed', auditErr);
    }

    return { ok: true, listingId: result.listingId, offerId: result.offerId, sku: product.sku };
  } catch (err) {
    // §71: 失敗時はstatusをFAILEDへ戻し、再試行できるようにする。
    await listingsRepo.markDraftPublishFailed(identity.draftId).catch(() => undefined);
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました。';
    console.error('[publishListingToEbay] failed', message);
    return { ok: false, error: message };
  }
}
