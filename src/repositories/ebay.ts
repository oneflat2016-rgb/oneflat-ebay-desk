/**
 * TODO(§20, §29): 実装対象。
 * ebay_accounts / ebay_category_cache / ebay_aspect_cache のCRUD。
 * §20注記: キャッシュは正本ではない。常にeBay APIレスポンスで
 * 更新し、古いキャッシュに依存した挙動を作らない。
 */
export async function getEbayAccountForOrganization(_organizationId: string) {
  throw new Error('getEbayAccountForOrganization is not implemented yet');
}

export async function upsertCategoryCache(): Promise<void> {
  throw new Error('upsertCategoryCache is not implemented yet');
}

export async function upsertAspectCache(): Promise<void> {
  throw new Error('upsertAspectCache is not implemented yet');
}
