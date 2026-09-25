/**
 * §14: SKU採番ロジックを差し替え可能にするための抽象化。
 *
 * 背景(2026-09-25の方針追加): 将来、仕入・注文・利益管理機能をこのアプリへ統合する予定があり、
 * その際にSKUの採番形式(現状: OF-YYMMDD-連番)を仕入ロットや別のルールに合わせて
 * 差し替える可能性が高い。採番ロジックをrepositories/products.tsから切り離し、
 * この1ファイル(と`getActiveSkuStrategy`の差し替え)だけで済むようにしておく。
 * 呼び出し元(products.ts, actions.ts, UI)は一切変更不要。
 */

export interface SkuGenerationContext {
  organizationId: string;
  /** 指定したprefixで始まる既存SKUの件数を返す(採番の重複回避に使う)。DBアクセスは呼び出し元(products.ts)に任せる。 */
  countExistingWithPrefix: (prefix: string) => Promise<number>;
}

export interface SkuStrategy {
  /** ai_runs等と同様、後からどの形式で採番したか追跡できるよう名前を持たせる。 */
  name: string;
  generate(ctx: SkuGenerationContext): Promise<string>;
}

/**
 * 既定の採番形式(§14): OF-YYMMDD-連番(例: OF-260924-0001)。
 * TODO: 現状は「その日のSKU件数+1」のため、同時登録が重なった場合に採番が
 * 衝突する可能性がある(低頻度利用のPhase1では許容)。将来的にはDBのシーケンスや
 * advisory lockで排他制御する。
 */
export const dateSequenceSkuStrategy: SkuStrategy = {
  name: 'date-sequence-v1',
  async generate(ctx) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `OF-${yy}${mm}${dd}-`;

    const count = await ctx.countExistingWithPrefix(prefix);
    const next = count + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  },
};

/**
 * 現在有効なSKU採番戦略。
 * TODO(将来の仕入・注文・利益管理統合時): 別途渡される設計に合わせて、ここを
 * 新しいSkuStrategy実装に差し替える(例: 仕入ロットID/仕入元を含む採番など)。
 * products.ts / actions.ts / UIコンポーネントは変更不要な設計にしてある。
 */
export function getActiveSkuStrategy(): SkuStrategy {
  return dateSequenceSkuStrategy;
}

/**
 * §出品時は必ずSKUを設定する(2026-09-25の方針追加)。
 * eBay Inventory API連携(§110 step10以降のcreateOrReplaceInventoryItem/createOffer)は、
 * 空文字・空白のみのSKUでの呼び出しを必ず拒否すること。ここに検証ロジックを集約し、
 * 呼び出し側で個別に条件分岐を書かないようにする。
 */
export function assertValidSku(sku: string | null | undefined): asserts sku is string {
  if (!sku || !sku.trim()) {
    throw new Error('SKU is required to publish a listing (a product must have a non-empty sku)');
  }
}
