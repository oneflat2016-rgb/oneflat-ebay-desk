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

/**
 * §110 step10: Business Policiesプログラム(Selling Policy Management)への加入。
 * eBayアカウントがまだ加入していないと fulfillment_policy/payment_policy/return_policy は
 * 20403(User is not eligible for Business Policy)を返すため、そのときはADMINにこの
 * エンドポイントを叩いてもらう(eBay側の管理画面からの加入と同等の操作)。
 * 既に加入済みの場合は`errorId: 20401(already opted in)`のようなエラーになるが、
 * これは実質成功として扱ってよい(呼び出し元でメッセージを出し分ける)。
 */
export async function optInToBusinessPolicies(accessToken: string): Promise<void> {
  const res = await fetch(`${getEbayApiBaseUrl()}/sell/account/v1/program/opt_in`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ programType: 'SELLING_POLICY_MANAGEMENT' }),
  });
  if (res.status === 204 || res.ok) {
    return;
  }
  const body = await res.text().catch(() => '');
  if (body.includes('already opted in') || body.includes('20401')) {
    return;
  }
  throw new Error(`Business Policiesプログラムへの加入に失敗しました (${res.status}): ${body}`);
}

/**
 * §110 step10: Business Policiesの新規作成。
 * eBay Sandboxの管理画面(Web UI)自体が不安定/未提供のことがあるため、
 * このアプリからAPI経由で最低限の内容(1件ずつ)を作成できるようにしてある。
 * カテゴリー区分は出品予定商品(古物・中古工具等、車両以外)に合わせ、
 * 常に "ALL_EXCLUDING_MOTORS_VEHICLES" 固定とする(§117-4寄りだが、
 * ONEFLATが車両を扱わない前提のため許容。車両を扱う場合は別途対応)。
 */
const DEFAULT_CATEGORY_TYPES = [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' as const }];

async function createPolicy(
  accessToken: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${getEbayApiBaseUrl()}/sell/account/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`eBay Account API(${path})の作成に失敗しました (${res.status}): ${text}`);
  }
}

export async function createFulfillmentPolicy(
  accessToken: string,
  params: { name: string; marketplaceId: string; handlingTimeDays: number },
): Promise<void> {
  await createPolicy(accessToken, 'fulfillment_policy', {
    name: params.name,
    marketplaceId: params.marketplaceId,
    categoryTypes: DEFAULT_CATEGORY_TYPES,
    handlingTime: { value: params.handlingTimeDays, unit: 'DAY' },
    shippingOptions: [
      {
        optionType: 'DOMESTIC',
        costType: 'FLAT_RATE',
        shippingServices: [
          {
            sortOrder: 1,
            shippingCarrierCode: 'USPS',
            shippingServiceCode: 'USPSPriority',
            shippingCost: { value: '0.00', currency: 'USD' },
            freeShipping: true,
          },
        ],
      },
    ],
  });
}

export async function createPaymentPolicy(
  accessToken: string,
  params: { name: string; marketplaceId: string },
): Promise<void> {
  await createPolicy(accessToken, 'payment_policy', {
    name: params.name,
    marketplaceId: params.marketplaceId,
    categoryTypes: DEFAULT_CATEGORY_TYPES,
    // EBAY_US等のManaged Payments対象マーケットプレイスではpaymentMethodsは不要
    // (eBay側が支払い方法一式を自動的に提供する)。
  });
}

export async function createReturnPolicy(
  accessToken: string,
  params: { name: string; marketplaceId: string; returnPeriodDays: number },
): Promise<void> {
  await createPolicy(accessToken, 'return_policy', {
    name: params.name,
    marketplaceId: params.marketplaceId,
    categoryTypes: DEFAULT_CATEGORY_TYPES,
    returnsAccepted: true,
    returnPeriod: { value: params.returnPeriodDays, unit: 'DAY' },
    returnShippingCostPayer: 'BUYER',
    refundMethod: 'MONEY_BACK',
  });
}
