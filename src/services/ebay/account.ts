import type { EbayBusinessPolicy, EbayInventoryLocation } from '@/types/ebay';

/**
 * TODO(§59-60, §65): 実装対象。eBay Account API。
 * - Payment/Fulfillment/Return Business Policyの取得(§59-60)
 * - Inventory Locationの取得/設定(§65, Phase1では主要発送元1か所)
 */
export async function listPaymentPolicies(): Promise<EbayBusinessPolicy[]> {
  throw new Error('listPaymentPolicies is not implemented yet (§60)');
}

export async function listFulfillmentPolicies(): Promise<EbayBusinessPolicy[]> {
  throw new Error('listFulfillmentPolicies is not implemented yet (§60)');
}

export async function listReturnPolicies(): Promise<EbayBusinessPolicy[]> {
  throw new Error('listReturnPolicies is not implemented yet (§60)');
}

export async function listInventoryLocations(): Promise<EbayInventoryLocation[]> {
  throw new Error('listInventoryLocations is not implemented yet (§65)');
}
