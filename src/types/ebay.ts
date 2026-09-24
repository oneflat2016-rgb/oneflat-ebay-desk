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

export interface EbayAspectDefinition {
  aspectName: string;
  usage: EbayAspectUsage;
  required: boolean;
  dataType: EbayAspectDataType;
  cardinality: EbayAspectCardinality;
  allowedValues: string[] | null;
  expectedRequiredByDate: string | null;
}

export interface EbayConditionPolicy {
  conditionId: string;
  conditionEnum: string;
  conditionDescription: string;
}

export interface EbayBusinessPolicy {
  policyId: string;
  name: string;
  description?: string;
}

export interface EbayMarketplaceId {
  value: 'EBAY_US' | 'EBAY_UK' | 'EBAY_AU' | string;
}

export interface EbayInventoryLocation {
  merchantLocationKey: string;
  name: string;
}

export interface EbayPublishResult {
  listingId: string;
  offerId: string;
  sku: string;
}
