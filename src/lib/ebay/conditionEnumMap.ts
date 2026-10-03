/**
 * §110 step11: eBay Metadata API(get_item_condition_policies, §110 step8)が返す
 * conditionId(レガシーな数値ID、例: "3000")を、eBay Sell Inventory APIの
 * InventoryItem.condition が要求するConditionEnum文字列(例: "USED_EXCELLENT")へ
 * 変換するためのマッピング。
 *
 * §117-4: eBayの値をアプリ側で独自定義しないという方針との整合性メモ:
 * この変換テーブル自体はeBay公式ドキュメントで公開されている固定の対応表であり
 * (Metadata APIのconditionIdとSell Inventory APIのConditionEnumは別々のAPIが
 * 同じ「状態」概念を別形式で表現しているだけ)、アプリが値の意味を創作している
 * わけではない。ただし将来カテゴリー追加等でeBay側に新しいconditionIdが
 * 追加された場合はこの表の更新が必要になるため、未知のIDは推測で変換せず
 * エラーにする(mapConditionIdToEnum参照)。
 */
const CONDITION_ID_TO_ENUM: Record<string, string> = {
  '1000': 'NEW',
  '1500': 'NEW_OTHER',
  '1750': 'NEW_WITH_DEFECTS',
  '2000': 'CERTIFIED_REFURBISHED',
  '2010': 'EXCELLENT_REFURBISHED',
  '2020': 'VERY_GOOD_REFURBISHED',
  '2030': 'GOOD_REFURBISHED',
  '2500': 'SELLER_REFURBISHED',
  '2750': 'LIKE_NEW',
  '3000': 'USED_EXCELLENT',
  '4000': 'USED_VERY_GOOD',
  '5000': 'USED_GOOD',
  '6000': 'USED_ACCEPTABLE',
  '7000': 'FOR_PARTS_OR_NOT_WORKING',
};

export function mapConditionIdToEnum(conditionId: string): string {
  const mapped = CONDITION_ID_TO_ENUM[conditionId];
  if (!mapped) {
    throw new Error(
      `eBayのconditionId(${conditionId})に対応するConditionEnumが未登録です。src/lib/ebay/conditionEnumMap.tsの対応表を確認してください。`,
    );
  }
  return mapped;
}

/**
 * 2026-10-03: 本番実商品テストで発見した「Conditionの入力欄が2つある」問題への対応。
 *
 * これまでは、実際にeBayへ送るCondition(DynamicConditionSection・eBay Metadata API由来)
 * と、タイトル候補生成だけに使う固定6択のCondition(旧ConditionSection)を、
 * それぞれ別々に選ぶ必要があった。
 *
 * ここでは、eBayのConditionEnum(mapConditionIdToEnumの戻り値)から、タイトル候補生成用の
 * 6択(ConditionValue)へ変換する。これにより、ユーザーがeBayのCondition一覧から選んだ
 * 内容だけで両方をまかなえるようにし、旧ConditionSectionの手動選択をなくす。
 */
const CONDITION_ENUM_TO_TITLE_VALUE: Record<string, import('@/types/listing').ConditionValue> = {
  NEW: 'New',
  NEW_OTHER: 'New – Open Box',
  NEW_WITH_DEFECTS: 'New – Open Box',
  CERTIFIED_REFURBISHED: 'Used – Excellent',
  EXCELLENT_REFURBISHED: 'Used – Excellent',
  VERY_GOOD_REFURBISHED: 'Used – Good',
  GOOD_REFURBISHED: 'Used – Good',
  SELLER_REFURBISHED: 'Used – Good',
  LIKE_NEW: 'Used – Excellent',
  USED_EXCELLENT: 'Used – Excellent',
  USED_VERY_GOOD: 'Used – Good',
  USED_GOOD: 'Used – Good',
  USED_ACCEPTABLE: 'Used – Fair',
  FOR_PARTS_OR_NOT_WORKING: 'For Parts / Not Working',
};

/**
 * eBayのconditionId(Metadata API)から、タイトル候補生成用のConditionValueを求める。
 * 未登録のIDや変換に失敗した場合はnullを返す(呼び出し側はnullなら何もしない=
 * 直前の値を維持する)。
 */
export function mapConditionIdToTitleValue(conditionId: string): import('@/types/listing').ConditionValue | null {
  const enumValue = CONDITION_ID_TO_ENUM[conditionId];
  if (!enumValue) return null;
  return CONDITION_ENUM_TO_TITLE_VALUE[enumValue] ?? null;
}
