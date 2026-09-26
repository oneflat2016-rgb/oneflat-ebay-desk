import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { EbayAspectDefinition } from '@/types/ebay';

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
  /** §43(§110 step8): eBay Metadata APIが返す実際のconditionId(数値ID) */
  conditionId: string | null;
  conditionEnum: string | null;
  /** §110 step10: eBay Sell Account API / Inventory API由来のBusiness Policies・保管場所 */
  fulfillmentPolicyId: string | null;
  paymentPolicyId: string | null;
  returnPolicyId: string | null;
  merchantLocationKey: string | null;
  title: string | null;
  descriptionHtml: string | null;
  /** §110 step11: eBay Offerの必須項目。DBはnumeric/textだが、JS側はstringで保持する。 */
  price: string | null;
  currency: string | null;
  quantity: number;
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
  conditionId?: string | null;
  conditionEnum?: string | null;
  fulfillmentPolicyId?: string | null;
  paymentPolicyId?: string | null;
  returnPolicyId?: string | null;
  merchantLocationKey?: string | null;
  title?: string | null;
  descriptionHtml?: string | null;
  price?: string | null;
  currency?: string | null;
  quantity?: number;
  status?: ListingDraftRecord['status'];
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
    conditionId: (row.condition_id as string | null) ?? null,
    conditionEnum: (row.condition_enum as string | null) ?? null,
    fulfillmentPolicyId: (row.fulfillment_policy_id as string | null) ?? null,
    paymentPolicyId: (row.payment_policy_id as string | null) ?? null,
    returnPolicyId: (row.return_policy_id as string | null) ?? null,
    merchantLocationKey: (row.merchant_location_key as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    descriptionHtml: (row.description_html as string | null) ?? null,
    price: row.price === null || row.price === undefined ? null : String(row.price),
    currency: (row.currency as string | null) ?? null,
    quantity: (row.quantity as number | null) ?? 1,
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
  if ('conditionId' in patch) row.condition_id = patch.conditionId;
  if ('conditionEnum' in patch) row.condition_enum = patch.conditionEnum;
  if ('fulfillmentPolicyId' in patch) row.fulfillment_policy_id = patch.fulfillmentPolicyId;
  if ('paymentPolicyId' in patch) row.payment_policy_id = patch.paymentPolicyId;
  if ('returnPolicyId' in patch) row.return_policy_id = patch.returnPolicyId;
  if ('merchantLocationKey' in patch) row.merchant_location_key = patch.merchantLocationKey;
  if ('title' in patch) row.title = patch.title;
  if ('descriptionHtml' in patch) row.description_html = patch.descriptionHtml;
  if ('price' in patch) {
    const p = patch.price;
    row.price = p === null || p === undefined || p.trim() === '' ? null : Number(p);
  }
  if ('currency' in patch) row.currency = patch.currency;
  if ('quantity' in patch) row.quantity = patch.quantity;
  if ('status' in patch) row.status = patch.status;
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

/**
 * §39-42(§110 step7): eBay Taxonomy API由来のItem Specifics(Aspect)を
 * listing_aspect_values に保存する。旧GENRE_FIELDS由来の upsertAspectValues とは
 * value_jsonの形が異なる({value: string} ではなく {values: string[]}, MULTI対応)ため、
 * aspect_nameが被らない限り同じテーブルに共存できる(§117-2: eBay由来の値のみ保存)。
 * 入力が空の項目は削除する(空文字列だけを保持しない)。
 */
export async function upsertEbayAspectValues(
  draftId: string,
  aspects: EbayAspectDefinition[],
  values: Record<string, string[]>,
): Promise<void> {
  const supabase = getSupabaseServerClient();

  const toUpsert: { aspect: EbayAspectDefinition; values: string[] }[] = [];
  const toDelete: string[] = [];

  for (const aspect of aspects) {
    const v = (values[aspect.aspectName] ?? []).map((s) => s.trim()).filter(Boolean);
    if (v.length > 0) {
      toUpsert.push({ aspect, values: v });
    } else {
      toDelete.push(aspect.aspectName);
    }
  }

  if (toUpsert.length > 0) {
    const rows = toUpsert.map(({ aspect, values: v }) => ({
      listing_draft_id: draftId,
      aspect_name: aspect.aspectName,
      value_json: { values: v },
      required: aspect.required,
      usage: aspect.usage,
      data_type: aspect.dataType,
      cardinality: aspect.cardinality,
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

export async function getEbayAspectValuesForDraft(
  draftId: string,
): Promise<Record<string, string[]>> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listing_aspect_values')
    .select('aspect_name, value_json')
    .eq('listing_draft_id', draftId);
  if (error) throw error;

  const result: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const valueJson = row.value_json as { values?: string[] } | null;
    if (valueJson?.values && valueJson.values.length > 0) {
      result[row.aspect_name as string] = valueJson.values;
    }
  }
  return result;
}

/**
 * §70(§110 step11): Publish開始時に status を PUBLISHING へ変更し、二重出品を防ぐ。
 * DRAFT/READY/FAILEDからのみ遷移を許可する(既にPUBLISHING/PUBLISHEDのdraftからの
 * 同時Publishはここで弾かれる = サーバー側ロック)。
 * 戻り値: trueならロック取得成功、falseならすでに他のPublish処理が進行中/完了済み。
 */
export async function lockDraftForPublishing(draftId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listing_drafts')
    .update({ status: 'PUBLISHING', updated_at: new Date().toISOString() })
    .eq('id', draftId)
    .in('status', ['DRAFT', 'READY', 'FAILED'])
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/**
 * §71: Publish処理が失敗した場合、statusをFAILEDへ戻す(次回再試行できるようにする)。
 * §70でPUBLISHINGへロックした後、途中で例外が起きた場合に呼び出し元がこれを呼ぶ。
 */
export async function markDraftPublishFailed(draftId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('listing_drafts')
    .update({ status: 'FAILED', updated_at: new Date().toISOString() })
    .eq('id', draftId);
  if (error) throw error;
}

/**
 * §66-71: Publish成功後、statusをPUBLISHEDへ変更する。
 */
export async function markDraftPublished(draftId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('listing_drafts')
    .update({ status: 'PUBLISHED', updated_at: new Date().toISOString() })
    .eq('id', draftId);
  if (error) throw error;
}

/**
 * §18(§110 step11): Publish成功後の記録を`listings`テーブル(公開後の正本)へ保存する。
 * listing_drafts自体はあくまで「下書き」であり、公開済みListing ID/Offer IDは
 * こちらの別テーブルで管理する(schema.sqlのコメント §18参照)。
 */
export async function createPublishedListing(params: {
  productId: string;
  listingDraftId: string;
  sku: string;
  ebayListingId: string;
  ebayOfferId: string;
  marketplaceId: string;
  categoryId: string | null;
  createdBy: string;
}): Promise<{ id: string }> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listings')
    .insert({
      product_id: params.productId,
      listing_draft_id: params.listingDraftId,
      sku: params.sku,
      ebay_listing_id: params.ebayListingId,
      ebay_offer_id: params.ebayOfferId,
      marketplace_id: params.marketplaceId,
      category_id: params.categoryId,
      status: 'ACTIVE',
      published_at: new Date().toISOString(),
      created_by: params.createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

/**
 * §110 step12(2026-09-26): 出品済みListing一覧画面(まずは一覧表示のみ)。
 * listings(公開後の正本)を軸に、表示用のタイトル・価格・数量は
 * listing_drafts(§18のコメントの通り、公開時点の入力内容がそのまま残る)から取得する。
 * organization単位の絞り込みは明示的なfilterを書かず、schema.sqlのRLSポリシー
 * (「listings: same organization」= products経由でorganization_idを突き合わせる)に
 * 任せる(getSupabaseServerClient()はログイン中ユーザーのセッションを使うクライアントの
 * ため、RLSが常に効く。管理者クライアント(service_role)はここでは使わない)。
 */
export interface PublishedListingListItem {
  id: string;
  productId: string;
  sku: string;
  title: string | null;
  price: string | null;
  currency: string | null;
  quantity: number | null;
  ebayListingId: string | null;
  ebayOfferId: string | null;
  marketplaceId: string;
  status: 'ACTIVE' | 'ENDED' | 'SOLD_OUT' | 'ERROR';
  publishedAt: string | null;
  endedAt: string | null;
  soldAt: string | null;
}

export async function listPublishedListings(): Promise<PublishedListingListItem[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listings')
    .select(
      `id, product_id, sku, ebay_listing_id, ebay_offer_id, marketplace_id, status,
       published_at, ended_at, sold_at,
       listing_draft:listing_drafts ( title, price, currency, quantity )`,
    )
    .order('published_at', { ascending: false, nullsFirst: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    // Supabase-jsの型は1件のFK関係でも配列/オブジェクトいずれの形でも返しうるため、
    // 念のため両対応にしておく。
    const draftRaw = row.listing_draft as
      | { title: string | null; price: number | string | null; currency: string | null; quantity: number | null }
      | { title: string | null; price: number | string | null; currency: string | null; quantity: number | null }[]
      | null;
    const draft = Array.isArray(draftRaw) ? draftRaw[0] : draftRaw;

    return {
      id: row.id as string,
      productId: row.product_id as string,
      sku: row.sku as string,
      title: draft?.title ?? null,
      price: draft?.price === null || draft?.price === undefined ? null : String(draft.price),
      currency: draft?.currency ?? null,
      quantity: draft?.quantity ?? null,
      ebayListingId: (row.ebay_listing_id as string | null) ?? null,
      ebayOfferId: (row.ebay_offer_id as string | null) ?? null,
      marketplaceId: row.marketplace_id as string,
      status: row.status as PublishedListingListItem['status'],
      publishedAt: (row.published_at as string | null) ?? null,
      endedAt: (row.ended_at as string | null) ?? null,
      soldAt: (row.sold_at as string | null) ?? null,
    };
  });
}

/**
 * §110 step12(2026-09-26追加): 価格改定機能。
 * eBay Offerを更新(PUT)するには、価格以外にもcategoryId・保管場所・各種ポリシー・
 * 説明文HTMLといった、Publish時にlistingsとlisting_draftsへ分散して保存した項目が
 * すべて揃っている必要がある(services/ebay/inventory.tsのupdateOfferは置換動作のため、
 * 一部だけ送ると欠けた項目がeBay側で消えてしまう)。そのためここで両テーブルを結合して
 * 1回で取得する。
 */
export interface ListingOfferUpdateDetail {
  id: string;
  listingDraftId: string | null;
  sku: string;
  status: 'ACTIVE' | 'ENDED' | 'SOLD_OUT' | 'ERROR';
  ebayOfferId: string | null;
  marketplaceId: string;
  categoryId: string | null;
  price: string | null;
  currency: string | null;
  quantity: number | null;
  merchantLocationKey: string | null;
  paymentPolicyId: string | null;
  fulfillmentPolicyId: string | null;
  returnPolicyId: string | null;
  descriptionHtml: string | null;
}

export async function getListingForOfferUpdate(listingId: string): Promise<ListingOfferUpdateDetail | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listings')
    .select(
      `id, listing_draft_id, sku, status, ebay_offer_id, marketplace_id, category_id,
       listing_draft:listing_drafts ( price, currency, quantity, merchant_location_key,
         payment_policy_id, fulfillment_policy_id, return_policy_id, description_html )`,
    )
    .eq('id', listingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  type DraftJoin = {
    price: number | string | null;
    currency: string | null;
    quantity: number | null;
    merchant_location_key: string | null;
    payment_policy_id: string | null;
    fulfillment_policy_id: string | null;
    return_policy_id: string | null;
    description_html: string | null;
  };
  const draftRaw = data.listing_draft as DraftJoin | DraftJoin[] | null;
  const draft = Array.isArray(draftRaw) ? draftRaw[0] : draftRaw;

  return {
    id: data.id as string,
    listingDraftId: (data.listing_draft_id as string | null) ?? null,
    sku: data.sku as string,
    status: data.status as ListingOfferUpdateDetail['status'],
    ebayOfferId: (data.ebay_offer_id as string | null) ?? null,
    marketplaceId: data.marketplace_id as string,
    categoryId: (data.category_id as string | null) ?? null,
    price: draft?.price === null || draft?.price === undefined ? null : String(draft.price),
    currency: draft?.currency ?? null,
    quantity: draft?.quantity ?? null,
    merchantLocationKey: draft?.merchant_location_key ?? null,
    paymentPolicyId: draft?.payment_policy_id ?? null,
    fulfillmentPolicyId: draft?.fulfillment_policy_id ?? null,
    returnPolicyId: draft?.return_policy_id ?? null,
    descriptionHtml: draft?.description_html ?? null,
  };
}

/**
 * 価格改定成功後、listing_drafts.priceを新しい値へ更新しておく
 * (次回この画面を開いたときに表示される価格・次回のPublish/Offer更新の基準値を最新にする)。
 */
export async function updateDraftPriceOnly(listingDraftId: string, price: number): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('listing_drafts')
    .update({ price, updated_at: new Date().toISOString() })
    .eq('id', listingDraftId);
  if (error) throw error;
}

/**
 * §110 step12(2026-09-26追加): 在庫同期機能。
 * 数量改定成功後、listing_drafts.quantityを新しい値へ更新しておく(updateDraftPriceOnlyと同じ考え方)。
 */
export async function updateDraftQuantityOnly(listingDraftId: string, quantity: number): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('listing_drafts')
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq('id', listingDraftId);
  if (error) throw error;
}

/**
 * §110 step12(2026-09-26追加): End Item(出品終了)機能。
 * 取り消せない操作のため、Offer更新(価格改定・在庫同期)より必要な情報は少ない
 * (ebayOfferIdとstatusのみ)。専用の軽量な取得関数にしておく。
 */
export interface ListingForEnd {
  id: string;
  ebayOfferId: string | null;
  status: 'ACTIVE' | 'ENDED' | 'SOLD_OUT' | 'ERROR';
}

export async function getListingForEnd(listingId: string): Promise<ListingForEnd | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('listings')
    .select('id, ebay_offer_id, status')
    .eq('id', listingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    ebayOfferId: (data.ebay_offer_id as string | null) ?? null,
    status: data.status as ListingForEnd['status'],
  };
}

/**
 * withdrawOffer成功後、listings.statusをENDEDへ変更し、ended_atを記録する。
 */
export async function markListingEnded(listingId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('listings')
    .update({ status: 'ENDED', ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', listingId)
    .eq('status', 'ACTIVE'); // 二重終了防止(既にENDEDならこの条件で更新されない)
  if (error) throw error;
}

/**
 * §110 step12(2026-09-26追加の修正): Publish時に組み立てた説明文HTML(buildDescriptionHtml)を
 * listing_drafts.description_htmlへ保存する。
 * これまでPublish処理はeBayへ渡すためだけにHTMLをその場で組み立てており、DBへは
 * 保存していなかった(§80の自動保存が「保存」ボタンの押下時にしかdraftPatchを送らず、
 * そのdraftPatchにdescriptionHtmlが含まれていなかったため)。
 * その結果、価格改定機能(getListingForOfferUpdate)が「説明文が空」と判定して
 * 更新を安全側で中止してしまう不具合があった。Publish/再Publishのたびにここで
 * 保存しておくことで、次回以降のOffer更新(価格改定・在庫同期など)で説明文を
 * 正しく参照できるようにする。
 */
export async function updateDraftDescriptionHtml(listingDraftId: string, descriptionHtml: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('listing_drafts')
    .update({ description_html: descriptionHtml, updated_at: new Date().toISOString() })
    .eq('id', listingDraftId);
  if (error) throw error;
}
