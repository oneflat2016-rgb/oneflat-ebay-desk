import { getEbayApiBaseUrl } from './auth';
import type { EbayOrder, EbayOrderLineItem } from '@/types/ebay';

/**
 * §10(最新実装指示書)/Phase2 §21-22(§53): eBay Sell Fulfillment API。
 * 注文情報の取得(同期の永続化自体はrepositories/orders.tsが行う。§54: eBay APIを
 * 過去履歴DB代わりにせず、取得結果を必ずONEFLAT DBへ保存する)。
 * User Access Token必須(出品者本人の注文のため)。
 *
 * §85相当: 全期間を毎回取得すると重いため、呼び出し元が保持するcursor
 * (前回同期時点のcreationdate)を渡せば、それ以降の注文だけを取得する。
 */

const PAGE_LIMIT = 50;
const MAX_PAGES = 20; // 安全弁: 1回の同期で最大1000件まで(§43相当: 無制限ループを避ける)

export async function fetchRecentOrders(
  accessToken: string,
  params: { creationDateFrom?: string } = {},
): Promise<EbayOrder[]> {
  const orders: EbayOrder[] = [];
  const baseUrl = getEbayApiBaseUrl();

  const filters: string[] = [];
  if (params.creationDateFrom) {
    // eBayのcreationdateフィルタは範囲指定([from..to])。toを省略すると「以降すべて」の意味になる。
    filters.push(`creationdate:[${params.creationDateFrom}..]`);
  }

  let url =
    `${baseUrl}/sell/fulfillment/v1/order?limit=${PAGE_LIMIT}` +
    (filters.length ? `&filter=${encodeURIComponent(filters.join(','))}` : '') +
    '&sort=creationdate';

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`eBay Fulfillment API error (${res.status}): ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as EbayOrdersResponse;
    for (const raw of json.orders ?? []) {
      orders.push(normalizeOrder(raw));
    }
    url = json.next ?? '';
  }

  return orders;
}

// --- eBayレスポンスの生のJSON形状(必要な部分だけ) ---
interface EbayOrdersResponse {
  orders?: RawEbayOrder[];
  next?: string | null;
}

interface RawEbayOrder {
  orderId?: string;
  orderFulfillmentStatus?: string;
  creationDate?: string;
  pricingSummary?: { total?: { value?: string; currency?: string } };
  fulfillmentStartInstructions?: Array<{
    shippingStep?: { shipTo?: { contactAddress?: { countryCode?: string } } };
  }>;
  lineItems?: Array<{
    lineItemId?: string;
    sku?: string;
    quantity?: number;
    lineItemCost?: { value?: string; currency?: string };
    deliveryCost?: { shippingCost?: { value?: string } };
  }>;
}

function normalizeOrder(raw: RawEbayOrder): EbayOrder {
  const lineItems: EbayOrderLineItem[] = (raw.lineItems ?? []).map((li) => ({
    ebayLineItemId: li.lineItemId ?? '',
    sku: li.sku ?? null,
    quantity: typeof li.quantity === 'number' ? li.quantity : 1,
    sellingPriceValue: li.lineItemCost?.value ? Number(li.lineItemCost.value) : null,
    sellingPriceCurrency: li.lineItemCost?.currency ?? null,
    deliveryCostValue: li.deliveryCost?.shippingCost?.value ? Number(li.deliveryCost.shippingCost.value) : null,
  }));

  return {
    ebayOrderId: raw.orderId ?? '',
    buyerCountry: raw.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress?.countryCode ?? null,
    orderStatus: raw.orderFulfillmentStatus ?? null,
    creationDate: raw.creationDate ?? null,
    totalAmountValue: raw.pricingSummary?.total?.value ? Number(raw.pricingSummary.total.value) : null,
    totalAmountCurrency: raw.pricingSummary?.total?.currency ?? null,
    lineItems,
    raw,
  };
}
