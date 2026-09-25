'use client';

/**
 * §110 step11: eBay Offer作成に必須の価格・数量・通貨を入力するセクション。
 * §117-4: 通貨はeBayマーケットプレイス(EBAY_US = USD)に合わせて固定候補のみとし、
 * アプリが勝手なレートで換算するようなことはしない(将来他マーケットプレイス対応時に
 * このセクションの選択肢を増やす)。
 */
const CURRENCY_OPTIONS = ['USD', 'JPY', 'GBP', 'AUD', 'EUR'];

export function PricingSection({
  price,
  quantity,
  currency,
  onChange,
}: {
  price: string;
  quantity: number;
  currency: string;
  onChange: (patch: { price?: string; quantity?: number; currency?: string }) => void;
}) {
  return (
    <section className="card">
      <div className="legend-row">
        <h2>価格・数量(eBay Offerに必須)</h2>
        <span className="hint">§66-67</span>
      </div>
      <p className="subnote">
        eBayへ実際に出品(Publish)する際の販売価格・在庫数量です。通貨はeBayの出品対象
        マーケットプレイス(現状はEBAY_US固定)に合わせて選んでください(通常はUSD)。
      </p>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="f-price">価格(Price)</label>
          <input
            type="number"
            id="f-price"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => onChange({ price: e.target.value })}
            placeholder="例: 120.00"
          />
        </div>
        <div className="field">
          <label htmlFor="f-currency">通貨(Currency)</label>
          <select id="f-currency" value={currency} onChange={(e) => onChange({ currency: e.target.value })}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-quantity">数量(Quantity)</label>
          <input
            type="number"
            id="f-quantity"
            inputMode="numeric"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange({ quantity: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1 });
            }}
          />
        </div>
      </div>
    </section>
  );
}
