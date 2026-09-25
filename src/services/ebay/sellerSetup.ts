import { getEbayUserAccessToken } from './userToken';
import { getFulfillmentPolicies, getPaymentPolicies, getReturnPolicies } from './account';
import { getInventoryLocations } from './inventoryLocation';
import type { EbayBusinessPolicy, EbayInventoryLocation } from '@/types/ebay';

/**
 * §110 step10: 出品に必要な「出品者側セットアップ情報」をまとめて取得する。
 * Business Policiesは3種類バラバラに失敗しうる(例: 支払いポリシーだけ未作成)ため、
 * 個別にcatchしてwarningsへ積み、UIには取得できた分だけ渡す(§117-4: ダミーで埋めない)。
 */
export interface SellerSetupData {
  fulfillmentPolicies: EbayBusinessPolicy[];
  paymentPolicies: EbayBusinessPolicy[];
  returnPolicies: EbayBusinessPolicy[];
  inventoryLocations: EbayInventoryLocation[];
  warnings: string[];
}

async function safe<T>(label: string, warnings: string[], fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    warnings.push(`${label}の取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export async function getSellerSetupData(
  organizationId: string,
  marketplaceId: string,
): Promise<SellerSetupData> {
  // §102: ここで初めてUser Access Tokenを取得する。未連携ならここで例外(呼び出し元が401/409扱いする)。
  const accessToken = await getEbayUserAccessToken(organizationId);

  const warnings: string[] = [];
  const [fulfillmentPolicies, paymentPolicies, returnPolicies, inventoryLocations] = await Promise.all([
    safe('配送ポリシー(Fulfillment Policy)', warnings, () => getFulfillmentPolicies(accessToken, marketplaceId)),
    safe('支払いポリシー(Payment Policy)', warnings, () => getPaymentPolicies(accessToken, marketplaceId)),
    safe('返品ポリシー(Return Policy)', warnings, () => getReturnPolicies(accessToken, marketplaceId)),
    safe('保管場所(Inventory Location)', warnings, () => getInventoryLocations(accessToken)),
  ]);

  return { fulfillmentPolicies, paymentPolicies, returnPolicies, inventoryLocations, warnings };
}
