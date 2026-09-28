import { getEbayApiBaseUrl } from './auth';
import type { EbayFinanceTransaction } from '@/types/ebay';

/**
 * §10(最新実装指示書)/Phase2 §23(§53): eBay Sell Finances API。
 * 売上・各種販売手数料の取引情報の取得(永続化はrepositories/orders.tsの
 * upsertFinanceTransactionsが行う。§54)。
 * User Access Token必須。
 */

const PAGE_LIMIT = 50;
const MAX_PAGES = 20; // 安全弁(§43相当)

export async function fetchRecentTransactions(
  accessToken: string,
  params: { transactionDateFrom?: string } = {},
): Promise<EbayFinanceTransaction[]> {
  const results: EbayFinanceTransaction[] = [];
  const baseUrl = getEbayApiBaseUrl();

  const filters: string[] = [];
  if (params.transactionDateFrom) {
    filters.push(`transactionDate:[${params.transactionDateFrom}..]`);
  }

  let url =
    `${baseUrl}/sell/finances/v1/transaction?limit=${PAGE_LIMIT}` +
    (filters.length ? `&filter=${encodeURIComponent(filters.join(','))}` : '');

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`eBay Finances API error (${res.status}): ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as EbayTransactionsResponse;
    for (const raw of json.transactions ?? []) {
      results.push(...normalizeTransaction(raw));
    }
    url = json.next ?? '';
  }

  return results;
}

// --- eBayレスポンスの生のJSON形状(必要な部分だけ) ---
interface EbayTransactionsResponse {
  transactions?: RawEbayTransaction[];
  next?: string | null;
}

interface RawEbayTransaction {
  transactionId?: string;
  orderId?: string;
  transactionType?: string;
  transactionDate?: string;
  amount?: { value?: string; currency?: string };
  orderLineItems?: Array<{
    marketplaceFees?: Array<{ feeType?: string; amount?: { value?: string; currency?: string } }>;
  }>;
}

/**
 * 1つのtransactionから、トップレベルの取引額1件 + 手数料明細(marketplaceFees)を
 * それぞれ別レコードとして展開する。手数料明細のIDは`${transactionId}:fee:${feeType}`
 * として一意化する(finance_transactions.ebay_transaction_idはunique制約あり)。
 */
function normalizeTransaction(raw: RawEbayTransaction): EbayFinanceTransaction[] {
  const out: EbayFinanceTransaction[] = [];
  if (raw.transactionId) {
    out.push({
      ebayTransactionId: raw.transactionId,
      ebayOrderId: raw.orderId ?? null,
      transactionType: raw.transactionType ?? null,
      amountValue: raw.amount?.value ? Number(raw.amount.value) : null,
      amountCurrency: raw.amount?.currency ?? null,
      feeType: null,
      transactionDate: raw.transactionDate ?? null,
      raw,
    });
  }

  for (const lineItem of raw.orderLineItems ?? []) {
    for (const fee of lineItem.marketplaceFees ?? []) {
      if (!raw.transactionId || !fee.feeType) continue;
      out.push({
        ebayTransactionId: `${raw.transactionId}:fee:${fee.feeType}`,
        ebayOrderId: raw.orderId ?? null,
        transactionType: 'MARKETPLACE_FEE',
        amountValue: fee.amount?.value ? Number(fee.amount.value) : null,
        amountCurrency: fee.amount?.currency ?? null,
        feeType: fee.feeType,
        transactionDate: raw.transactionDate ?? null,
        raw: fee,
      });
    }
  }

  return out;
}
