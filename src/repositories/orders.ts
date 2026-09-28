import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { EbayFinanceTransaction, EbayOrder } from '@/types/ebay';

/**
 * §10(最新実装指示書)/Phase2 §21-23(§54): orders / order_items / finance_transactions
 * のCRUD。eBay APIを過去履歴DB代わりにせず、取得結果を必ずONEFLAT DBへ保存する。
 *
 * §29: orders/order_items/finance_transactions/sync_jobsはRLSポリシー未設定
 * (現時点で1組織1eBayアカウント運用のため。supabase/orders_sync_setup.sql参照)。
 * そのため必ずservice_role(admin client)を使い、呼び出し元のRoute Handlerで
 * ADMIN/LISTER Roleチェックを行った上で呼ぶこと。
 */

export interface UpsertOrdersResult {
  ordersUpserted: number;
  itemsUpserted: number;
  latestCreationDate: string | null;
}

export async function upsertOrdersFromEbay(orders: EbayOrder[]): Promise<UpsertOrdersResult> {
  if (orders.length === 0) {
    return { ordersUpserted: 0, itemsUpserted: 0, latestCreationDate: null };
  }
  const supabase = getSupabaseAdminClient();

  let itemsUpserted = 0;
  let latestCreationDate: string | null = null;

  for (const order of orders) {
    if (!order.ebayOrderId) continue;

    const { data: orderRow, error: orderError } = await supabase
      .from('orders')
      .upsert(
        {
          ebay_order_id: order.ebayOrderId,
          buyer_country: order.buyerCountry,
          order_status: order.orderStatus,
          creation_date: order.creationDate,
          total_amount: order.totalAmountValue,
          currency: order.totalAmountCurrency,
          raw_json: order.raw,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'ebay_order_id' },
      )
      .select('id')
      .single();
    if (orderError) throw orderError;
    const orderId = orderRow.id as string;

    if (order.creationDate && (!latestCreationDate || order.creationDate > latestCreationDate)) {
      latestCreationDate = order.creationDate;
    }

    if (order.lineItems.length === 0) continue;

    // §10: 注文明細のSKUから、対応する出品(listings)/商品(products)を引いて紐づける。
    const skus = order.lineItems.map((li) => li.sku).filter((sku): sku is string => Boolean(sku));
    const listingsBySku = new Map<string, { id: string; product_id: string }>();
    if (skus.length > 0) {
      const { data: listingRows, error: listingError } = await supabase
        .from('listings')
        .select('id, product_id, sku')
        .in('sku', skus);
      if (listingError) throw listingError;
      for (const row of listingRows ?? []) {
        listingsBySku.set(row.sku as string, { id: row.id as string, product_id: row.product_id as string });
      }
    }

    const itemRows = order.lineItems
      .filter((li) => li.ebayLineItemId)
      .map((li) => {
        const matched = li.sku ? listingsBySku.get(li.sku) : undefined;
        return {
          order_id: orderId,
          ebay_line_item_id: li.ebayLineItemId,
          listing_id: matched?.id ?? null,
          product_id: matched?.product_id ?? null,
          sku: li.sku,
          quantity: li.quantity,
          sale_price: li.sellingPriceValue,
          currency: li.sellingPriceCurrency,
          shipping_amount: li.deliveryCostValue,
        };
      });

    if (itemRows.length > 0) {
      const { error: itemsError } = await supabase
        .from('order_items')
        .upsert(itemRows, { onConflict: 'order_id,ebay_line_item_id' });
      if (itemsError) throw itemsError;
      itemsUpserted += itemRows.length;

      // §10: 販売が確認できた出品は listings.sold_at を記録する(未設定の場合のみ、初回販売日として)。
      const matchedListingIds = itemRows.map((r) => r.listing_id).filter((id): id is string => Boolean(id));
      if (matchedListingIds.length > 0 && order.creationDate) {
        const { data: listingsToUpdate } = await supabase
          .from('listings')
          .select('id, sold_at')
          .in('id', matchedListingIds)
          .is('sold_at', null);
        const idsNeedingUpdate = (listingsToUpdate ?? []).map((r) => r.id as string);
        if (idsNeedingUpdate.length > 0) {
          await supabase.from('listings').update({ sold_at: order.creationDate }).in('id', idsNeedingUpdate);
        }
      }
    }
  }

  return { ordersUpserted: orders.length, itemsUpserted, latestCreationDate };
}

export interface UpsertTransactionsResult {
  transactionsUpserted: number;
  latestTransactionDate: string | null;
}

export async function upsertFinanceTransactions(
  transactions: EbayFinanceTransaction[],
): Promise<UpsertTransactionsResult> {
  if (transactions.length === 0) {
    return { transactionsUpserted: 0, latestTransactionDate: null };
  }
  const supabase = getSupabaseAdminClient();

  let latestTransactionDate: string | null = null;
  const rows = transactions.map((t) => {
    if (t.transactionDate && (!latestTransactionDate || t.transactionDate > latestTransactionDate)) {
      latestTransactionDate = t.transactionDate;
    }
    return {
      ebay_transaction_id: t.ebayTransactionId,
      ebay_order_id: t.ebayOrderId,
      transaction_type: t.transactionType,
      amount: t.amountValue,
      currency: t.amountCurrency,
      fee_type: t.feeType,
      raw_json: t.raw,
      transaction_date: t.transactionDate,
    };
  });

  const { error } = await supabase.from('finance_transactions').upsert(rows, { onConflict: 'ebay_transaction_id' });
  if (error) throw error;

  return { transactionsUpserted: rows.length, latestTransactionDate };
}
