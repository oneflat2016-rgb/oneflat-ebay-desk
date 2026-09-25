import { getEbayApiBaseUrl } from './auth';
import type { EbayInventoryLocation } from '@/types/ebay';

/**
 * §110 step10: eBay Sell Inventory API(location)。
 * User Access Token必須。出品(InventoryItem/Offer作成、step11以降)には
 * 最低1件のENABLEDなLocationが必須なため、ここで一覧取得・新規作成ができるようにする。
 */

interface RawLocationResponse {
  merchantLocationKey: string;
  name?: string;
  merchantLocationStatus?: string;
  location?: {
    address?: {
      city?: string;
    };
  };
}

export async function getInventoryLocations(accessToken: string): Promise<EbayInventoryLocation[]> {
  const res = await fetch(`${getEbayApiBaseUrl()}/sell/inventory/v1/location?limit=100`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay Inventory Location APIが失敗しました (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { locations?: RawLocationResponse[] };
  const raw = json.locations ?? [];
  return raw.map((l) => ({
    merchantLocationKey: l.merchantLocationKey,
    name: l.name ?? null,
    locationStatus: l.merchantLocationStatus ?? 'UNKNOWN',
    city: l.location?.address?.city ?? null,
  }));
}

export interface CreateInventoryLocationInput {
  merchantLocationKey: string;
  name: string;
  addressLine1: string;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2(例: "US", "JP") */
  country: string;
}

/**
 * §110 step10: 保管場所(倉庫/自宅発送元)の新規登録。ADMINのみ実行可能(呼び出し元でチェック)。
 * eBay側は成功時204 No Contentを返す。
 */
export async function createInventoryLocation(
  accessToken: string,
  input: CreateInventoryLocationInput,
): Promise<void> {
  const res = await fetch(
    `${getEbayApiBaseUrl()}/sell/inventory/v1/location/${encodeURIComponent(input.merchantLocationKey)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: input.name,
        location: {
          address: {
            addressLine1: input.addressLine1,
            city: input.city,
            stateOrProvince: input.stateOrProvince,
            postalCode: input.postalCode,
            country: input.country,
          },
        },
        locationTypes: ['WAREHOUSE'],
        merchantLocationStatus: 'ENABLED',
      }),
    },
  );
  if (!res.ok && res.status !== 204) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay保管場所の作成に失敗しました (${res.status}): ${body}`);
  }
}
