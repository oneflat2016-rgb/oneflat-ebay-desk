/**
 * TODO(Phase1-STEP3以降): 実装対象。
 * products / product_images テーブルのCRUD。
 * SKU生成(例: OF-260924-0001, §14)、商品複製(§79, listing_draftを起点にコピー)、
 * 検索(§78: SKU/Brand/Model/商品名/eBay Listing ID/状態/登録者)。
 * DB処理をUIコンポーネントから直接呼ばせず、必ずこの層を経由する(§95)。
 */
export interface ProductRecord {
  id: string;
  organizationId: string;
  sku: string;
  brand: string | null;
  model: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export async function createProduct(): Promise<ProductRecord> {
  throw new Error('createProduct is not implemented yet');
}

export async function getProductById(_id: string): Promise<ProductRecord | null> {
  throw new Error('getProductById is not implemented yet');
}

export async function searchProducts(_query: string): Promise<ProductRecord[]> {
  throw new Error('searchProducts is not implemented yet (§78)');
}

/**
 * §81: 楽観的排他制御。古いversionからの更新は拒否し、
 * 呼び出し元(UI)へ「他の社員がこの商品を更新しました」を表示させる。
 */
export async function updateProductWithVersionCheck(_params: {
  id: string;
  expectedVersion: number;
  patch: Partial<ProductRecord>;
}): Promise<{ ok: true; record: ProductRecord } | { ok: false; reason: 'version_conflict' }> {
  throw new Error('updateProductWithVersionCheck is not implemented yet (§81)');
}
