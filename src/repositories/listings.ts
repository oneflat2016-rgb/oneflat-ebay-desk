import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * listing_drafts / listing_aspect_values のCRUD(Phase1-STEP3, §110 step3)。
 * §80: 本当のdebounce自動保存はまだ未実装(現状は「保存」ボタンによる手動保存)。
 * §89-90: チェックリストのDB保存(inspected_by/at)は未実装(checklist用テーブルが
 * まだ無いため、Phase1では引き続きクライアント内stateのみ)。
 * §70: Publish開始時のロック処理(lockDraftForPublishing)はeBay Inventory API連携
 * (step10以降)と合わせて実装する。
 */

export interface ListingDraftRecord {
  id: string;
  productId: string;
  marketplaceId: string;
  categoryTreeId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  conditionEnum: string | null;
  title: string | null;
  status: 'DRAFT' | 'READY' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ListingDraftPatch {
  categoryTreeId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  conditionEnum?: string | null;
  title?: string | null;
  updatedBy?: string;
}

function fromRow(row: Record<string, unknown>): ListingDraftRecord {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    marketplaceId: row.marketplace_id as string,
    categoryTreeId: (row.category_tree_id as string | null) ?? null,
    categoryId: (row.category_id as string | null) ?? null,
    categoryName: (row.category_name as string | null) ?? null,
    conditionEnum: (row.condition_enum as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    status: row.status as ListingDraftRecord['status'],
    createdBy: row.created_by as string,
    updatedBy: (row.updated_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    version: row.version as number,
  };
}

function patchToRow(patch: ListingDraftPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('categoryTreeId' in patch) row.category_tree_id = patch.categoryTreeId;
  if ('categoryId' in patch) row.category_id = patch.categoryId;
  if ('categoryName' in patch) row.category_name = patch.categoryName;
  if ('conditionEnum' in patch) row.condition_enum = patch.conditionEnum;
  if ('title' in patch) row.title = patch.title;
  if ('updatedBy' in patch) row.updated_by = patch.updatedBy;
  return row;
}

export async function createDraftForProduct(params: {
  productId: string;
  createdBy: string;
  patch: ListingDraftPatch;
}): Promise<ListingDraftRecord> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listing_drafts')
    .insert({
      product_id: params.productId,
      created_by: params.createdBy,
      ...patchToRow(params.patch),
    })
    .select('*')
    .single();

  if (error) throw error;
  return fromRow(data);
}

export async function getDraftById(id: string): Promise<ListingDraftRecord | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listing_drafts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

/**
 * §81: 楽観的排他制御。listing_draftsにも同じ仕組みを適用する。
 */
export async function updateDraftWithVersionCheck(params: {
  id: string;
  expectedVersion: number;
  patch: ListingDraftPatch;
}): Promise<{ ok: true; record: ListingDraftRecord } | { ok: false; reason: 'version_conflict' }> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listing_drafts')
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

/**
 * Item Specifics(現状はGENRE_FIELDS由来の固定項目, §40でeBay Aspectに置き換え予定)を
 * listing_aspect_values に保存する。空値は削除、それ以外はupsertする。
 * source='human'固定(AIによる自動入力が入るのはstep6以降)。
 */
export async function upsertAspectValues(
  draftId: string,
  specifics: Record<string, string>,
): Promise<void> {
  const supabase = getSupabaseServerClient();

  const toUpsert = Object.entries(specifics).filter(([, value]) => value && value.trim() !== '');
  const toDelete = Object.entries(specifics)
    .filter(([, value]) => !value || value.trim() === '')
    .map(([key]) => key);

  if (toUpsert.length > 0) {
    const rows = toUpsert.map(([aspectName, value]) => ({
      listing_draft_id: draftId,
      aspect_name: aspectName,
      value_json: { value },
      source: 'human',
      confirmed: true,
    }));
    const { error } = await supabase
      .from('listing_aspect_values')
      .upsert(rows, { onConflict: 'listing_draft_id,aspect_name' });
    if (error) throw error;
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('listing_aspect_values')
      .delete()
      .eq('listing_draft_id', draftId)
      .in('aspect_name', toDelete);
    if (error) throw error;
  }
}

export async function getAspectValuesForDraft(
  draftId: string,
): Promise<Record<string, string>> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listing_aspect_values')
    .select('aspect_name, value_json')
    .eq('listing_draft_id', draftId);
  if (error) throw error;

  const result: Record<string, string> = {};
  for (const row of data ?? []) {
    const valueJson = row.value_json as { value?: string } | null;
    if (valueJson?.value) result[row.aspect_name as string] = valueJson.value;
  }
  return result;
}

export async function lockDraftForPublishing(_draftId: string): Promise<boolean> {
  throw new Error('lockDraftForPublishing is not implemented yet (§70)');
}
