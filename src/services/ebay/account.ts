import { getEbayApiBaseUrl } from './auth';
import type { EbayBusinessPolicy, EbayBusinessPolicyType } from '@/types/ebay';

/**
 * §110 step10: eBay Sell Account API(Business Policies)。
 * User Access Token必須(出品者本人のポリシーのため、Application Access Tokenでは不可)。
 * §note: eBay側で「Business Policies」プログラムへのopt-inが済んでいないと、
 * これらのエンドポイントはエラー(例: 20403 Business policy is not enabled)を返す。
 * その場合はUI側でその旨を案内する(§117-4: アプリ側でダミーの選択肢を作らない)。
 */

interface RawPolicyBase {
  marketplaceId: string;
  name: string;
}

async function fetchPolicyList<TRaw extends RawPolicyBase>(
  accessToken: string,
  marketplaceId: string,
  path: string,
  itemsKey: string,
): Promise<TRaw[]> {
  const res = await fetch(
    `${getEbayApiBaseUrl()}/sell/account/v1/${path}?marketplace_id=${encodeURIComponent(marketplaceId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay Account API(${path})が失敗しました (${res.status}): ${body}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  return (json[itemsKey] as TRaw[] | undefined) ?? [];
}

export async function getFulfillmentPolicies(
  accessToken: string,
  marketplaceId: string,
): Promise<EbayBusinessPolicy[]> {
  const raw = await fetchPolicyList<RawPolicyBase & { fulfillmentPolicyId: string }>(
    accessToken,
    marketplaceId,
    'fulfillment_policy',
    'fulfillmentPolicies',
  );
  return raw.map((p) => toPolicy('FULFILLMENT', p.fulfillmentPolicyId, p));
}

export async function getPaymentPolicies(
  accessToken: string,
  marketplaceId: string,
): Promise<EbayBusinessPolicy[]> {
  const raw = await fetchPolicyList<RawPolicyBase & { paymentPolicyId: string }>(
    accessToken,
    marketplaceId,
    'payment_policy',
    'paymentPolicies',
  );
  return raw.map((p) => toPolicy('PAYMENT', p.paymentPolicyId, p));
}

export async function getReturnPolicies(
  accessToken: string,
  marketplaceId: string,
): Promise<EbayBusinessPolicy[]> {
  const raw = await fetchPolicyList<RawPolicyBase & { returnPolicyId: string }>(
    accessToken,
    marketplaceId,
    'return_policy',
    'returnPolicies',
  );
  return raw.map((p) => toPolicy('RETURN', p.returnPolicyId, p));
}

function toPolicy(type: EbayBusinessPolicyType, policyId: string, raw: RawPolicyBase): EbayBusinessPolicy {
  return {
    type,
    policyId,
    name: raw.name,
    marketplaceId: raw.marketplaceId,
  };
}
