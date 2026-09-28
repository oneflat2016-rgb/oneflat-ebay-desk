import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * §10(最新実装指示書): ONEFLAT販売履歴データベースの読み取り側。
 * orders/order_items(§10のsyncOrdersで蓄積)に、listings/listing_drafts(商品タイトル)、
 * finance_transactions(手数料合計)を突き合わせて一覧化する。
 * §29: service_role(admin client)を使用。呼び出し元(ページ)でログイン確認のみ行う
 * (閲覧専用の社内データのため、Role制限はsyncよりゆるくして良い)。
 */

export interface SalesHistoryItem {
  orderItemId: string;
  ebayOrderId: string;
  sku: string | null;
  title: string | null;
  quantity: number;
  salePrice: number | null;
  currency: string | null;
  shippingAmount: number | null;
  orderStatus: string | null;
  creationDate: string | null;
  buyerCountry: string | null;
  totalFees: number | null; // その注文全体の手数料合計(明細単位の按分はしていない)
}

export async function listSalesHistory(limit = 200): Promise<SalesHistoryItem[]> {
  const supabase = getSupabaseAdminClient();

  const { data: itemRows, error: itemError } = await supabase
    .from('order_items')
    .select(
      `id, sku, quantity, sale_price, currency, shipping_amount,
       order:orders ( ebay_order_id, order_status, creation_date, buyer_country ),
       listing:listings ( listing_draft:listing_drafts ( title ) )`,
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (itemError) throw itemError;

  const rows = itemRows ?? [];
  const ebayOrderIds = Array.from(
    new Set(
      rows
        .map((row) => firstOf(row.order)?.ebay_order_id as string | undefined)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const feesByOrderId = new Map<string, number>();
  if (ebayOrderIds.length > 0) {
    const { data: feeRows, error: feeError } = await supabase
      .from('finance_transactions')
      .select('ebay_order_id, amount')
      .eq('transaction_type', 'MARKETPLACE_FEE')
      .in('ebay_order_id', ebayOrderIds);
    if (feeError) throw feeError;
    for (const fee of feeRows ?? []) {
      const orderId = fee.ebay_order_id as string | null;
      if (!orderId) continue;
      const amount = fee.amount === null ? 0 : Number(fee.amount);
      feesByOrderId.set(orderId, (feesByOrderId.get(orderId) ?? 0) + amount);
    }
  }

  return rows.map((row): SalesHistoryItem => {
    const order = firstOf(row.order) as
      | { ebay_order_id: string; order_status: string | null; creation_date: string | null; buyer_country: string | null }
      | undefined;
    const listing = firstOf(row.listing) as { listing_draft?: unknown } | undefined;
    const draft = listing ? firstOf(listing.listing_draft) : undefined;
    const title = (draft as { title?: string | null } | undefined)?.title ?? null;

    return {
      orderItemId: row.id as string,
      ebayOrderId: order?.ebay_order_id ?? '',
      sku: (row.sku as string | null) ?? null,
      title,
      quantity: (row.quantity as number | null) ?? 1,
      salePrice: row.sale_price === null || row.sale_price === undefined ? null : Number(row.sale_price),
      currency: (row.currency as string | null) ?? null,
      shippingAmount:
        row.shipping_amount === null || row.shipping_amount === undefined ? null : Number(row.shipping_amount),
      orderStatus: order?.order_status ?? null,
      creationDate: order?.creation_date ?? null,
      buyerCountry: order?.buyer_country ?? null,
      totalFees: order?.ebay_order_id ? feesByOrderId.get(order.ebay_order_id) ?? null : null,
    };
  });
}

/**
 * Supabase-jsの型は1件のFK関係でも配列/オブジェクトいずれの形でも返しうるため、
 * 念のため両対応にする(既存repositories/listings.tsと同じ理由)。
 */
function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}
