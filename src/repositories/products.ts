import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * products / product_images テーブルのCRUD(Phase1-STEP3, §110 step3)。
 * DB処理をUIコンポーネントから直接呼ばせず、必ずこの層を経由する(§95)。
 * RLS(§29)はSupabaseの匿名キー+ユーザーセッションで自動的に効くため、
 * ここではgetSupabaseServerClient()(anon key)のみを使い、service_roleは使わない。
 *
 * TODO(Phase1後続): 商品複製(§79, listing_draftを起点にコピー)、
 * 検索(§78: SKU/Brand/Model/商品名/eBay Listing ID/状態/登録者)は未実装。
 */

export interface ProductRecord {
  id: string;
  organizationId: string;
  sku: string;
  brand: string | null;
  model: string | null;
  aboutJa: string | null;
  aboutEn: string | null;
  appearanceJa: string | null;
  appearanceEn: string | null;
  conditionNotesJa: string | null;
  conditionNotesEn: string | null;
  includedItemsJa: string | null;
  includedItemsEn: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ProductPatch {
  brand?: string | null;
  model?: string | null;
  aboutJa?: string | null;
  aboutEn?: string | null;
  appearanceJa?: string | null;
  appearanceEn?: string | null;
  conditionNotesJa?: string | null;
  conditionNotesEn?: string | null;
  includedItemsJa?: string | null;
  includedItemsEn?: string | null;
}

// DBの行(snake_case) <-> アプリ内表現(camelCase)の変換
function fromRow(row: Record<string, unknown>): ProductRecord {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    sku: row.sku as string,
    brand: (row.brand as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    aboutJa: (row.about_ja as string | null) ?? null,
    aboutEn: (row.about_en as string | null) ?? null,
    appearanceJa: (row.appearance_ja as string | null) ?? null,
    appearanceEn: (row.appearance_en as string | null) ?? null,
    conditionNotesJa: (row.condition_notes_ja as string | null) ?? null,
    conditionNotesEn: (row.condition_notes_en as string | null) ?? null,
    includedItemsJa: (row.included_items_ja as string | null) ?? null,
    includedItemsEn: (row.included_items_en as string | null) ?? null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    version: row.version as number,
  };
}

function patchToRow(patch: ProductPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('brand' in patch) row.brand = patch.brand;
  if ('model' in patch) row.model = patch.model;
  if ('aboutJa' in patch) row.about_ja = patch.aboutJa;
  if ('aboutEn' in patch) row.about_en = patch.aboutEn;
  if ('appearanceJa' in patch) row.appearance_ja = patch.appearanceJa;
  if ('appearanceEn' in patch) row.appearance_en = patch.appearanceEn;
  if ('conditionNotesJa' in patch) row.condition_notes_ja = patch.conditionNotesJa;
  if ('conditionNotesEn' in patch) row.condition_notes_en = patch.conditionNotesEn;
  if ('includedItemsJa' in patch) row.included_items_ja = patch.includedItemsJa;
  if ('includedItemsEn' in patch) row.included_items_en = patch.includedItemsEn;
  return row;
}

/**
 * §14のSKU採番規則(例: OF-260924-0001 = OF-YYMMDD-連番)。
 * TODO: 現状は「その日のSKU件数+1」のため、同時登録が重なった場合に
 * 採番が衝突する可能性がある(低頻度利用のPhase1では許容)。
 * 将来的にはDBのシーケンスやadvisory lockで排他制御する。
 */
export async function generateNextSku(organizationId: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `OF-${yy}${mm}${dd}-`;

  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .like('sku', `${prefix}%`);

  if (error) throw error;

  const next = (count ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export async function createProduct(params: {
  organizationId: string;
  sku: string;
  createdBy: string;
  patch: ProductPatch;
}): Promise<ProductRecord> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('products')
    .insert({
      organization_id: params.organizationId,
      sku: params.sku,
      created_by: params.createdBy,
      ...patchToRow(params.patch),
    })
    .select('*')
    .single();

  if (error) throw error;
  return fromRow(data);
}

export async function getProductById(id: string): Promise<ProductRecord | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

export async function searchProducts(_query: string): Promise<ProductRecord[]> {
  throw new Error('searchProducts is not implemented yet (§78)');
}

/**
 * §81: 楽観的排他制御。古いversionからの更新は拒否し、
 * 呼び出し元(UI)へ「他の社員がこの商品を更新しました」を表示させる。
 */
export async function updateProductWithVersionCheck(params: {
  id: string;
  expectedVersion: number;
  patch: ProductPatch;
}): Promise<{ ok: true; record: ProductRecord } | { ok: false; reason: 'version_conflict' }> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('products')
    .update({
      ...patchToRow(params.patch),
      version: params.expectedVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('version', params.expectedVersion)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: 'version_conflict' };
  return { ok: true, record: fromRow(data) };
}
