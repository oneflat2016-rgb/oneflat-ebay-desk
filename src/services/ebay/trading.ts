import { XMLParser } from 'fast-xml-parser';
import { getEbayEnv } from './auth';

/**
 * §34(最新実装指示書, Phase6): View/Watch分析。
 *
 * eBayのSell REST APIにはView/Watch件数を取得するエンドポイントが無いため、
 * legacyのTrading API(GetItem)を使う(§117-5相当: eBayが提供しない情報は
 * 作らず、取得できるAPIが別系統でもそれを使う)。Trading APIはXMLベースだが、
 * 認証はSell REST API同様のOAuth User Access Tokenがそのまま使える
 * (X-EBAY-API-IAF-TOKENヘッダ)ため、§9で取得済みのUser Access Tokenを
 * そのまま流用する(Trading API専用の追加認可は不要)。
 *
 * ItemID(数値の商品ID)は、Publish成功時にeBayから返るlegacy ItemId
 * (listings.ebay_listing_id)と同一の値。
 */

function getTradingApiEndpoint(): string {
  return getEbayEnv() === 'production'
    ? 'https://api.ebay.com/ws/api.dll'
    : 'https://api.sandbox.ebay.com/ws/api.dll';
}

export interface ItemViewWatchCount {
  itemId: string;
  viewItemCount: number | null;
  watchCount: number | null;
}

interface GetItemXmlResponse {
  GetItemResponse?: {
    Ack?: string;
    Errors?: { ShortMessage?: string; LongMessage?: string } | { ShortMessage?: string; LongMessage?: string }[];
    Item?: {
      ItemID?: string | number;
      ListingDetails?: { ViewItemCount?: string | number };
      WatchCount?: string | number;
    };
  };
}

const parser = new XMLParser({ ignoreAttributes: true });

function buildGetItemRequestXml(itemId: string): string {
  // ViewItemCount・WatchCountはIncludeWatchCountと合わせてItemIDsOutputSelectorで明示的に指定する
  // (指定しないとWatchCountが返らないことがあるため)。
  return `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <IncludeWatchCount>true</IncludeWatchCount>
  <OutputSelector>ItemID</OutputSelector>
  <OutputSelector>ListingDetails.ViewItemCount</OutputSelector>
  <OutputSelector>WatchCount</OutputSelector>
</GetItemRequest>`;
}

/**
 * 1件のeBay Item(legacy ItemID)について、View数・Watch数を取得する。
 * eBay側がエラーを返した場合(権限不足・ItemID不正など)は例外をthrowする。
 */
export async function getItemViewWatchCount(accessToken: string, itemId: string): Promise<ItemViewWatchCount> {
  const res = await fetch(getTradingApiEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'X-EBAY-API-IAF-TOKEN': accessToken,
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-CALL-NAME': 'GetItem',
      'X-EBAY-API-SITEID': '0', // US
    },
    body: buildGetItemRequestXml(itemId),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`eBay Trading API(GetItem)がHTTP ${res.status}を返しました: ${text.slice(0, 300)}`);
  }

  const parsed = parser.parse(text) as GetItemXmlResponse;
  const body = parsed.GetItemResponse;
  if (!body) {
    throw new Error('eBay Trading API(GetItem)の応答を解釈できませんでした。');
  }

  if (body.Ack !== 'Success' && body.Ack !== 'Warning') {
    const errors = Array.isArray(body.Errors) ? body.Errors : body.Errors ? [body.Errors] : [];
    const message = errors.map((e) => e.LongMessage ?? e.ShortMessage).filter(Boolean).join(' / ') || '不明なエラー';
    throw new Error(`eBay Trading API(GetItem)がエラーを返しました: ${message}`);
  }

  const item = body.Item;
  const viewCountRaw = item?.ListingDetails?.ViewItemCount;
  const watchCountRaw = item?.WatchCount;

  return {
    itemId,
    viewItemCount: viewCountRaw !== undefined && viewCountRaw !== null ? Number(viewCountRaw) : null,
    watchCount: watchCountRaw !== undefined && watchCountRaw !== null ? Number(watchCountRaw) : null,
  };
}

/**
 * 複数Itemについて順番に取得する(Trading APIは1回のGetItemにつき1ItemIDのみのため)。
 * 1件失敗しても他の件数取得を止めないよう、失敗したItemはnullを入れて結果に残す
 * (呼び出し元で「取得できなかった」ことを表示に出せるようにする)。
 */
export async function getItemViewWatchCounts(
  accessToken: string,
  itemIds: string[],
): Promise<Map<string, ItemViewWatchCount | null>> {
  const result = new Map<string, ItemViewWatchCount | null>();
  for (const itemId of itemIds) {
    try {
      result.set(itemId, await getItemViewWatchCount(accessToken, itemId));
    } catch (err) {
      console.error('[getItemViewWatchCounts] failed for', itemId, err instanceof Error ? err.message : err);
      result.set(itemId, null);
    }
  }
  return result;
}
