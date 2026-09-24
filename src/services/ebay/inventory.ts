import type { EbayPublishResult } from '@/types/ebay';

/**
 * TODO(§66-71, §76): 実装対象。eBay Inventory API。
 * publishListing()は以下の順序を厳守する(§67, §70二重出品防止):
 *   1. Validation
 *   2. 画像準備(services/ebay/media.ts)
 *   3. createOrReplaceInventoryItem
 *   4. createOffer
 *   5. publishOffer
 *   6. listingId保存
 *   7. audit_log書き込み
 *   8. status = ACTIVEへ変更
 *
 * §70: Publish開始時に status = PUBLISHING へ変更し、ボタンを無効化。
 * サーバー側でも同一draftからの二重Publishをロックする。
 * §71: 途中で失敗しても成功済みID/状態を保存し、再試行時は可能な限り
 * 途中から再開する(全部やり直さない)。
 * §76: createOrReplaceInventoryItemは部分PATCHではなく置換動作。
 * 更新前に既存値を取得し、必要情報を保持したまま送信する。
 */
export interface InventoryItemPayload {
  sku: string;
  availabilityQuantity: number;
  conditionEnum: string;
  title: string;
  descriptionHtml: string;
  aspects: Record<string, string[]>;
  imageUrls: string[];
}

export async function createOrReplaceInventoryItem(
  _payload: InventoryItemPayload,
): Promise<void> {
  throw new Error('createOrReplaceInventoryItem is not implemented yet (§68, §76)');
}

export async function createOffer(_params: {
  sku: string;
  categoryId: string;
  price: number;
  currency: string;
  merchantLocationKey: string;
  paymentPolicyId: string;
  fulfillmentPolicyId: string;
  returnPolicyId: string;
}): Promise<{ offerId: string }> {
  throw new Error('createOffer is not implemented yet (§66-67)');
}

export async function publishOffer(_offerId: string): Promise<EbayPublishResult> {
  throw new Error('publishOffer is not implemented yet (§66-67)');
}
