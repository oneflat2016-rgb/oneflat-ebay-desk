import { getEbayApiBaseUrl } from './auth';
import type { EbayPublishResult } from '@/types/ebay';
import { assertValidSku } from '@/lib/sku/skuStrategy';

/**
 * §66-71, §76(§110 step11): eBay Sell Inventory API。
 * User Access Token必須(出品者本人のInventoryのため、Application Access Tokenでは不可)。
 *
 * publishListing()の呼び出し順序(呼び出し元 = Server Action側で実施):
 *   1. Validation(SKU必須チェックを含む。2026-09-25の方針: 出品時は必ずSKUを
 *      設定する。SKUが空ならこの時点でエラーとし、以降のAPI呼び出しへ進まない)
 *   2. 画像準備(repositories/productImages.tsのgetImageUrlsForEbay。
 *      2026-09-25の設計判断によりMedia API(EPS)は経由しない。inventory.ts自体は変更なし)
 *   3. createOrReplaceInventoryItem
 *   4. createOffer
 *   5. publishOffer
 *   6. listingId保存
 *   7. audit_log書き込み
 *   8. status = PUBLISHEDへ変更
 *
 * §70: Publish開始時に status = PUBLISHING へ変更し、ボタンを無効化。
 * サーバー側でも同一draftからの二重Publishをロックする(repositories/listings.tsの
 * lockDraftForPublishing)。
 * §71: 途中で失敗しても成功済みID/状態を保存し、再試行時は可能な限り
 * 途中から再開する(全部やり直さない)。現状の実装は「createOrReplaceInventoryItemと
 * createOfferは何度呼んでも同じ結果になる(冪等)」ため、再試行時は単純に最初から
 * publishListingをやり直せば良い設計にしてある(offerIdだけ再作成を避けたい場合は
 * 別途Offer検索APIを使う拡張の余地があるが、Phase1では簡略化する)。
 * §76: createOrReplaceInventoryItemは部分PATCHではなく置換動作。
 * 2026-09-25の設計判断: このアプリがInventory Itemの唯一の書き込み元であり
 * (eBay側の管理画面から直接編集されることを想定しない、Phase1の運用方針)、
 * 送信するpayloadはこのアプリが把握している全項目を含むため、更新前にGETで
 * 既存値を取得してマージする処理は行わない(将来、外部からの編集を許容する
 * 場合はこの前提が崩れるため、その時点で見直す)。
 *
 * 将来の仕入・注文・利益管理機能統合に向けて(2026-09-25の方針追加):
 * SKUはeBayのInventory Item識別子であると同時に、将来的に仕入記録・注文・
 * 利益計算とも突き合わせるキーになる想定。そのため出品(Publish)の入口である
 * この2つの関数は、SKUが空/未設定の状態で絶対に呼び出されないことを
 * assertValidSku()で保証する(採番形式そのものは lib/sku/skuStrategy.ts 側で
 * 差し替え可能にしてある)。
 */
export interface InventoryItemPayload {
  sku: string;
  availabilityQuantity: number;
  conditionEnum: string;
  title: string;
  descriptionHtml: string;
  aspects: Record<string, string[]>;
  imageUrls: string[];
}

/**
 * eBay Sell Inventory APIのaspectsは `{ [aspectName]: string[] }` の形をそのまま使うため、
 * 変換処理はほぼ不要。ただし空配列のAspectは送らない(eBay側で400になることがあるため)。
 */
function toEbayAspects(aspects: Record<string, string[]>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [name, values] of Object.entries(aspects)) {
    if (values && values.length > 0) result[name] = values;
  }
  return result;
}

export async function createOrReplaceInventoryItem(
  accessToken: string,
  payload: InventoryItemPayload,
): Promise<void> {
  assertValidSku(payload.sku);

  const body = {
    availability: {
      shipToLocationAvailability: { quantity: payload.availabilityQuantity },
    },
    condition: payload.conditionEnum,
    product: {
      title: payload.title,
      description: payload.descriptionHtml,
      aspects: toEbayAspects(payload.aspects),
      imageUrls: payload.imageUrls,
    },
  };

  const res = await fetch(
    `${getEbayApiBaseUrl()}/sell/inventory/v1/inventory_item/${encodeURIComponent(payload.sku)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        // §76: eBay Sell Inventory APIはContent-Language(送信するproduct情報の言語)に加えて
        // Accept-Language(レスポンスの言語)も必須。片方だけだと errorId 25709
        // ("Invalid value for header Accept-Language")になる(2026-09-25 Sandbox実機確認済み)。
        'Content-Language': 'en-US',
        'Accept-Language': 'en-US',
      },
      body: JSON.stringify(body),
    },
  );

  // §76: PUT /inventory_item は成功時 204 No Content。
  if (res.status === 204 || res.ok) return;
  const text = await res.text().catch(() => '');
  throw new Error(`eBay Inventory API(inventory_item)の作成/更新に失敗しました (${res.status}): ${text}`);
}

export interface CreateOfferParams {
  sku: string;
  categoryId: string;
  price: number;
  currency: string;
  quantity: number;
  merchantLocationKey: string;
  paymentPolicyId: string;
  fulfillmentPolicyId: string;
  returnPolicyId: string;
  marketplaceId: string;
}

export async function createOffer(
  accessToken: string,
  params: CreateOfferParams,
): Promise<{ offerId: string }> {
  assertValidSku(params.sku);

  const body = {
    sku: params.sku,
    marketplaceId: params.marketplaceId,
    format: 'FIXED_PRICE',
    availableQuantity: params.quantity,
    categoryId: params.categoryId,
    listingPolicies: {
      paymentPolicyId: params.paymentPolicyId,
      fulfillmentPolicyId: params.fulfillmentPolicyId,
      returnPolicyId: params.returnPolicyId,
    },
    pricingSummary: {
      price: { value: params.price.toFixed(2), currency: params.currency },
    },
    merchantLocationKey: params.merchantLocationKey,
  };

  const res = await fetch(`${getEbayApiBaseUrl()}/sell/inventory/v1/offer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-US',
      'Accept-Language': 'en-US',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // §71: 同一SKUに対して既にOfferが存在する場合(25002)、再試行時はそのOfferIdを
    // 再利用できるようにする(全部やり直しにしない = 部分再開)。
    if (res.status === 400 && text.includes('25002')) {
      const existing = await findExistingOfferId(accessToken, params.sku, params.marketplaceId);
      if (existing) return { offerId: existing };
    }
    throw new Error(`eBay Inventory API(offer)の作成に失敗しました (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { offerId: string };
  return { offerId: json.offerId };
}

/**
 * §71: Offer作成が「既に存在する」エラーで失敗した場合の再開用ヘルパー。
 * GET /sell/inventory/v1/offer?sku=...&marketplace_id=... でSKUに紐づく
 * 既存Offerを検索する。
 */
async function findExistingOfferId(
  accessToken: string,
  sku: string,
  marketplaceId: string,
): Promise<string | null> {
  const res = await fetch(
    `${getEbayApiBaseUrl()}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${encodeURIComponent(marketplaceId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { offers?: { offerId: string }[] };
  return json.offers?.[0]?.offerId ?? null;
}

export async function publishOffer(
  accessToken: string,
  offerId: string,
  sku: string,
): Promise<EbayPublishResult> {
  const res = await fetch(
    `${getEbayApiBaseUrl()}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`eBay Inventory API(offer publish)に失敗しました (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { listingId: string };
  return { listingId: json.listingId, offerId, sku };
}
