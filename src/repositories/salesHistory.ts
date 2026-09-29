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

// ============================================================
// §11(最新実装指示書, Phase4): 自社販売実績照合
// ============================================================

export interface SimilarSoldItem {
  orderItemId: string;
  sku: string | null;
  title: string | null;
  brand: string | null;
  model: string | null;
  quantity: number;
  salePrice: number | null;
  currency: string | null;
  creationDate: string | null;
  orderStatus: string | null;
}

export interface FindSimilarSoldItemsParams {
  brand?: string | null;
  model?: string | null;
  categoryName?: string | null;
  limit?: number;
}

/**
 * §11: 新しい商品を登録・出品するとき、brand/model(または無ければcategoryName)が
 * 近い過去の自社販売実績(実際に売れたorder_items)を検索する。
 * 値付けの参考情報として画面に出すだけで、Publish等の判断をブロックしない(§25と同じ考え方)。
 *
 * 検索の流れ:
 *   1. products をbrand/model(部分一致, 大文字小文字区別なし)で絞り込む
 *      (brand/modelどちらも無ければcategoryNameでlisting_draftsを絞り込む代替ルートを使う)
 *   2. 該当productのlistings(sku)を取得
 *   3. そのskuに一致するorder_items(実際に売れた明細)を、新しい順に返す
 */
export async function findSimilarSoldItems(
  params: FindSimilarSoldItemsParams,
): Promise<SimilarSoldItem[]> {
  const limit = params.limit ?? 10;
  const brand = params.brand?.trim() || null;
  const model = params.model?.trim() || null;
  const categoryName = params.categoryName?.trim() || null;

  if (!brand && !model && !categoryName) {
    return [];
  }

  const supabase = getSupabaseAdminClient();

  let skus: string[] = [];

  if (brand || model) {
    let productQuery = supabase.from('products').select('id, brand, model');
    if (brand && model) {
      productQuery = productQuery.or(`brand.ilike.%${brand}%,model.ilike.%${model}%`);
    } else if (brand) {
      productQuery = productQuery.ilike('brand', `%${brand}%`);
    } else if (model) {
      productQuery = productQuery.ilike('model', `%${model}%`);
    }
    const { data: products, error: productError } = await productQuery.limit(200);
    if (productError) throw productError;
    const productIds = (products ?? []).map((p) => p.id as string);

    if (productIds.length > 0) {
      const { data: listingRows, error: listingError } = await supabase
        .from('listings')
        .select('sku')
        .in('product_id', productIds);
      if (listingError) throw listingError;
      skus = Array.from(new Set((listingRows ?? []).map((l) => l.sku as string).filter(Boolean)));
    }
  } else if (categoryName) {
    // brand/modelが無い場合の代替: listing_drafts.category_nameが近いものから、
    // 紐づくproductのlistings(sku)を辿る。
    const { data: draftRows, error: draftError } = await supabase
      .from('listing_drafts')
      .select('product_id')
      .ilike('category_name', `%${categoryName}%`)
      .limit(200);
    if (draftError) throw draftError;
    const productIds = Array.from(
      new Set((draftRows ?? []).map((d) => d.product_id as string).filter(Boolean)),
    );
    if (productIds.length > 0) {
      const { data: listingRows, error: listingError } = await supabase
        .from('listings')
        .select('sku')
        .in('product_id', productIds);
      if (listingError) throw listingError;
      skus = Array.from(new Set((listingRows ?? []).map((l) => l.sku as string).filter(Boolean)));
    }
  }

  if (skus.length === 0) {
    return [];
  }

  const { data: itemRows, error: itemError } = await supabase
    .from('order_items')
    .select(
      `id, sku, quantity, sale_price, currency,
       order:orders ( order_status, creation_date ),
       listing:listings ( product:products ( brand, model ), listing_draft:listing_drafts ( title ) )`,
    )
    .in('sku', skus)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (itemError) throw itemError;

  return (itemRows ?? []).map((row): SimilarSoldItem => {
    const order = firstOf(row.order) as
      | { order_status: string | null; creation_date: string | null }
      | undefined;
    const listing = firstOf(row.listing) as
      | { product?: unknown; listing_draft?: unknown }
      | undefined;
    const product = listing ? (firstOf(listing.product) as { brand?: string | null; model?: string | null } | undefined) : undefined;
    const draft = listing ? (firstOf(listing.listing_draft) as { title?: string | null } | undefined) : undefined;

    return {
      orderItemId: row.id as string,
      sku: (row.sku as string | null) ?? null,
      title: draft?.title ?? null,
      brand: product?.brand ?? null,
      model: product?.model ?? null,
      quantity: (row.quantity as number | null) ?? 1,
      salePrice: row.sale_price === null || row.sale_price === undefined ? null : Number(row.sale_price),
      currency: (row.currency as string | null) ?? null,
      creationDate: order?.creation_date ?? null,
      orderStatus: order?.order_status ?? null,
    };
  });
}
