import * as listingsRepo from '@/repositories/listings';
import type { ListingOfferUpdateDetail } from '@/repositories/listings';
import { getEbayUserAccessToken } from '@/services/ebay/userToken';
import { getOffer } from '@/services/ebay/inventory';

/**
 * §110 step12(2026-09-26): 価格改定・在庫同期など、eBay Offerを更新する機能で
 * 共通して必要になる事前チェック・説明文の解決処理をまとめたヘルパー。
 * (元々priceActions.tsにのみ書いていたが、quantityActions.tsでも全く同じ処理が
 * 必要になったため切り出した。今後、Offer更新を伴う機能を追加する際もここを使う想定)
 *
 * 通常のServer Actionファイル('use server'指定)は関数のみをexportできる制約があるため、
 * このファイル自体には 'use server' を付けず、priceActions.ts/quantityActions.tsといった
 * Server Actionファイルからサーバー専用ヘルパーとしてimportして使う(クライアント
 * コンポーネントから直接importしないこと)。
 */
export interface ResolvedOfferUpdateContext {
  detail: ListingOfferUpdateDetail;
  accessToken: string;
  /** DB・eBay側いずれかから解決済みの説明文HTML(必ず非nullで返す)。 */
  descriptionHtml: string;
}

export type ResolveOfferUpdateResult =
  | { ok: true; context: ResolvedOfferUpdateContext }
  | { ok: false; error: string };

export async function resolveOfferUpdateContext(
  listingId: string,
  organizationId: string,
): Promise<ResolveOfferUpdateResult> {
  const detail = await listingsRepo.getListingForOfferUpdate(listingId);
  if (!detail) {
    return { ok: false, error: '対象のListingが見つかりませんでした。' };
  }
  if (detail.status !== 'ACTIVE') {
    return { ok: false, error: '出品中(ACTIVE)のListingのみ変更できます。' };
  }
  if (!detail.ebayOfferId) {
    return { ok: false, error: 'eBay Offer IDが見つかりません。' };
  }

  const missing: string[] = [];
  if (!detail.categoryId) missing.push('カテゴリー');
  if (!detail.merchantLocationKey) missing.push('保管場所');
  if (!detail.paymentPolicyId) missing.push('支払いポリシー');
  if (!detail.fulfillmentPolicyId) missing.push('配送ポリシー');
  if (!detail.returnPolicyId) missing.push('返品ポリシー');
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Offer更新に必要な情報が不足しているため、安全のため更新を中止しました: ${missing.join(' / ')}`,
    };
  }

  const accessToken = await getEbayUserAccessToken(organizationId);

  // 「既存下書きを開き直してPublishし直す」導線がまだ未実装のため、2026-09-26の修正より前に
  // PublishされたListingはlisting_drafts.description_htmlが空のままのことがある。
  // その場合はeBay側に現在登録されている説明文をGET /offerで取得して代わりに使い、
  // 取得できたらついでにDBへも保存しておく(次回以降はDB側の値をそのまま使える)。
  let descriptionHtml = detail.descriptionHtml;
  if (!descriptionHtml) {
    const existingOffer = await getOffer(accessToken, detail.ebayOfferId);
    descriptionHtml = existingOffer.listingDescription;
    if (descriptionHtml && detail.listingDraftId) {
      await listingsRepo.updateDraftDescriptionHtml(detail.listingDraftId, descriptionHtml);
    }
  }
  if (!descriptionHtml) {
    return {
      ok: false,
      error: 'Offer更新に必要な説明文が見つかりませんでした(DB・eBay側どちらにも無いため、安全のため更新を中止しました)。',
    };
  }

  return { ok: true, context: { detail, accessToken, descriptionHtml } };
}
