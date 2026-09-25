/**
 * §98: eBayから返る重要データの型定義。anyを多用しない。
 * §5: eBayを正本にするデータ(Category/Aspect/Condition/Business Policies/
 * Marketplace情報/Listing ID/Offer ID)はここに型を置く。
 */

export interface EbayCategory {
  categoryTreeId: string;
  categoryId: string;
  categoryName: string;
  parentCategoryId: string | null;
  leaf: boolean;
}

export interface EbayCategorySuggestion {
  category: EbayCategory;
  relevancy: number; // eBayが返す順序をそのまま使う(§37)
}

export type EbayAspectDataType = 'STRING' | 'NUMBER' | 'DATE' | 'STRING_ARRAY';
export type EbayAspectUsage = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';
export type EbayAspectCardinality = 'SINGLE' | 'MULTI';

export type EbayAspectMode = 'FREE_TEXT' | 'SELECTION_ONLY';

export interface EbayAspectDefinition {
  aspectName: string;
  usage: EbayAspectUsage;
  required: boolean;
  dataType: EbayAspectDataType;
  cardinality: EbayAspectCardinality;
  /**
   * §42: SELECTION_ONLYの場合はallowedValuesから選ばせる(自由入力させない)。
   * FREE_TEXTの場合、allowedValuesはよく使われる値の候補(入力補助)に過ぎない。
   */
  aspectMode: EbayAspectMode | null;
  allowedValues: string[] | null;
  expectedRequiredByDate: string | null;
}

/**
 * §43(§110 step8): eBay Metadata API(get_item_condition_policies)が
 * 選択済みカテゴリーに対して返す、実際に使用可能なCondition一覧。
 * conditionIdはeBayのレガシーな数値ID(例: 1000=New, 3000=Used等)で、
 * カテゴリーによって使用可能な値が異なる(§117-4: Claudeやアプリ側で独自定義しない)。
 */
export interface EbayConditionPolicy {
  conditionId: string;
  conditionDescription: string;
}

/**
 * §110 step10: eBay Sell Account API(fulfillment_policy/payment_policy/return_policy)
 * が返すBusiness Policy一覧。§117-4と同様、名前やIDをアプリ側で作らず必ずeBayの応答を使う。
 * このAPIを呼ぶにはADMINが§9で連携済みであること(User Access Token)が前提(Application
 * Access Tokenでは取得できない、出品者本人のデータのため)。
 */
export type EbayBusinessPolicyType = 'FULFILLMENT' | 'PAYMENT' | 'RETURN';

export interface EbayBusinessPolicy {
  type: EbayBusinessPolicyType;
  policyId: string;
  name: string;
  marketplaceId: string;
}

export interface EbayMarketplaceId {
  value: 'EBAY_US' | 'EBAY_UK' | 'EBAY_AU' | string;
}

/**
 * §110 step10: eBay Inventory API(location)が返す出荷元情報。
 * 出品(Inventory Item/Offer作成)には最低1件のENABLEDなLocationが必須。
 */
export interface EbayInventoryLocation {
  merchantLocationKey: string;
  name: string | null;
  locationStatus: string;
  city: string | null;
}

export interface EbayPublishResult {
  listingId: string;
  offerId: string;
  sku: string;
}
