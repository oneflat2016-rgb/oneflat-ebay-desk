'use client';

import { useEffect, useState } from 'react';

/**
 * §16-17(最新実装指示書, Phase5): 利益シミュレーション。
 * 原価(円)・想定送料(USD)・為替レートを入力し、eBay手数料の目安(自社の実績があれば
 * その実績率、無ければ一般的な目安率13%)を差し引いた利益をその場で計算表示する。
 * §25と同じ考え方: あくまで目安であり、何も自動で確定しない(価格欄も変更しない)。
 * 原価(costPriceJpy)だけはproducts.cost_priceに保存され(§14)、送料・為替レートは
 * この画面内だけの一時的な試算値(DB保存はしない)。
 */

const GENERAL_FEE_RATE_FALLBACK = 0.13; // eBay最終価値手数料の一般的な目安(実績が無い場合のみ使用)
const DEFAULT_EXCHANGE_RATE = 150; // 円/USD。実際のレートに応じて画面で編集可能

export function ProfitSimulationSection({
  price,
  quantity,
  costPriceJpy,
  onCostPriceChange,
}: {
  price: string;
  quantity: number;
  costPriceJpy: string;
  onCostPriceChange: (value: string) => void;
}) {
  const [shippingCostUsd, setShippingCostUsd] = useState('');
  const [exchangeRate, setExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATE));
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [feeRateBasedOnOrders, setFeeRateBasedOnOrders] = useState(0);
  const [feeRateLoading, setFeeRateLoading] = useState(false);
  const [feeRateError, setFeeRateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFeeRateLoading(true);
    fetch('/api/sales/fee-rate')
      .then(async (res) => {
        if (!res.ok) throw new Error('手数料率の取得に失敗しました。');
        return res.json() as Promise<{ rate: number | null; basedOnOrders: number }>;
      })
      .then((data) => {
        if (cancelled) return;
        setFeeRate(data.rate);
        setFeeRateBasedOnOrders(data.basedOnOrders);
      })
      .catch((err) => {
        if (cancelled) return;
        setFeeRateError(err instanceof Error ? err.message : '手数料率を取得できませんでした。');
      })
      .finally(() => {
        if (!cancelled) setFeeRateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const priceNum = Number(price);
  const costJpyNum = Number(costPriceJpy);
  const shippingNum = Number(shippingCostUsd);
  const rateNum = Number(exchangeRate);

  const canCalculate =
    Number.isFinite(priceNum) &&
    priceNum > 0 &&
    costPriceJpy.trim() !== '' &&
    Number.isFinite(costJpyNum) &&
    Number.isFinite(rateNum) &&
    rateNum > 0;

  const effectiveFeeRate = feeRate ?? GENERAL_FEE_RATE_FALLBACK;

  let result: {
    revenueUsd: number;
    feeUsd: number;
    shippingTotalUsd: number;
    costTotalUsd: number;
    profitUsd: number;
    profitMarginPct: number;
  } | null = null;

  if (canCalculate) {
    const revenueUsd = priceNum * quantity;
    const feeUsd = revenueUsd * effectiveFeeRate;
    const shippingTotalUsd = (Number.isFinite(shippingNum) ? shippingNum : 0) * quantity;
    const costTotalUsd = (costJpyNum / rateNum) * quantity;
    const profitUsd = revenueUsd - feeUsd - shippingTotalUsd - costTotalUsd;
    const profitMarginPct = revenueUsd > 0 ? (profitUsd / revenueUsd) * 100 : 0;
    result = { revenueUsd, feeUsd, shippingTotalUsd, costTotalUsd, profitUsd, profitMarginPct };
  }

  return (
    <section className="card">
      <div className="legend-row">
        <h2 style={{ fontSize: '1.05rem' }}>11. 利益シミュレーション(§16-17)</h2>
        <span className="hint">原価・送料・為替レートから、手数料込みの想定利益をその場で試算(目安・任意)</span>
      </div>
      <p className="subnote">
        eBay手数料は
        {feeRateLoading
          ? '読み込み中です。'
          : feeRate !== null
            ? `自社の過去の実績(${feeRateBasedOnOrders}件)から算出した約${(feeRate * 100).toFixed(1)}%を使っています。`
            : `自社の実績がまだ無いため、一般的な目安の${(GENERAL_FEE_RATE_FALLBACK * 100).toFixed(0)}%を使っています。`}
        {feeRateError && <span style={{ color: 'var(--danger)' }}> ({feeRateError})</span>}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="subnote">原価(円・仕入れ値)</span>
          <input
            type="number"
            inputMode="decimal"
            value={costPriceJpy}
            onChange={(e) => onCostPriceChange(e.target.value)}
            placeholder="例: 3000"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="subnote">想定送料(USD・任意)</span>
          <input
            type="number"
            inputMode="decimal"
            value={shippingCostUsd}
            onChange={(e) => setShippingCostUsd(e.target.value)}
            placeholder="例: 15"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="subnote">為替レート(円/USD)</span>
          <input
            type="number"
            inputMode="decimal"
            value={exchangeRate}
            onChange={(e) => setExchangeRate(e.target.value)}
          />
        </label>
      </div>

      {!canCalculate ? (
        <p className="subnote" style={{ marginTop: 12 }}>
          価格(Pricingセクション)と原価(円)を入力すると、利益の目安が表示されます。
        </p>
      ) : (
        result && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
              想定利益: USD {result.profitUsd.toFixed(2)}
              <span className="subnote" style={{ marginLeft: 8, fontWeight: 400 }}>
                (利益率 約{result.profitMarginPct.toFixed(1)}%、数量{quantity}個ぶん)
              </span>
            </p>
            <p className="subnote" style={{ margin: 0 }}>
              内訳: 売上 USD {result.revenueUsd.toFixed(2)} − 手数料目安 USD {result.feeUsd.toFixed(2)} − 送料 USD{' '}
              {result.shippingTotalUsd.toFixed(2)} − 原価 USD {result.costTotalUsd.toFixed(2)}
            </p>
          </div>
        )
      )}
    </section>
  );
}
