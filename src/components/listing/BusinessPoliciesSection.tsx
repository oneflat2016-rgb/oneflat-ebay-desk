'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EbayBusinessPolicy, EbayInventoryLocation } from '@/types/ebay';

/**
 * §110 step10: eBay Sell Account API(Business Policies)+ Inventory API(保管場所)。
 * カテゴリーとは独立(出品者アカウント単位の情報)なので、フォーム表示時に一度だけ取得する。
 * §117-4: 選択肢は必ずeBayの応答から作る(アプリ側でダミーの選択肢を作らない)。
 */

interface SellerSetupResponse {
  fulfillmentPolicies: EbayBusinessPolicy[];
  paymentPolicies: EbayBusinessPolicy[];
  returnPolicies: EbayBusinessPolicy[];
  inventoryLocations: EbayInventoryLocation[];
  warnings: string[];
}

const emptyData: SellerSetupResponse = {
  fulfillmentPolicies: [],
  paymentPolicies: [],
  returnPolicies: [],
  inventoryLocations: [],
  warnings: [],
};

export function BusinessPoliciesSection({
  fulfillmentPolicyId,
  paymentPolicyId,
  returnPolicyId,
  merchantLocationKey,
  isAdmin,
  onChange,
}: {
  fulfillmentPolicyId: string | null;
  paymentPolicyId: string | null;
  returnPolicyId: string | null;
  merchantLocationKey: string | null;
  isAdmin: boolean;
  onChange: (patch: {
    fulfillmentPolicyId?: string | null;
    paymentPolicyId?: string | null;
    returnPolicyId?: string | null;
    merchantLocationKey?: string | null;
  }) => void;
}) {
  const [data, setData] = useState<SellerSetupResponse>(emptyData);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // §110 step11の運用改善(2026-09-25追加): このアプリからeBayへ書き込む値は
  // 必ず商品(下書き)ごとに明示選択させる方針(§117-4)だが、実際の運用では
  // ONEFLATが各種類ごとに1件しかポリシー/保管場所を持たないことが多いため、
  // 「候補が1件しかない」場合に限り、未選択の欄へ自動的にその1件を選択する
  // (=eBay側の設定をそのまま拾う)。候補が2件以上ある場合は誤った推測を避け、
  // 引き続き手動選択のままにする。propsの最新値はrefで参照する(loadはuseCallbackで
  // 一度だけ生成されるため、クロージャ内で直接propsを参照すると古い値のままになる)。
  const latest = useRef({
    fulfillmentPolicyId,
    paymentPolicyId,
    returnPolicyId,
    merchantLocationKey,
    onChange,
  });
  useEffect(() => {
    latest.current = { fulfillmentPolicyId, paymentPolicyId, returnPolicyId, merchantLocationKey, onChange };
  });

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage('');
    fetch('/api/ebay/policies')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<SellerSetupResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);

        const current = latest.current;
        const autoPatch: Parameters<typeof current.onChange>[0] = {};
        // 候補が1件、または複数でもeBay側で「既定」のものが1件あれば自動選択する。
        // すでに選択済みでも、eBay側から消えているIDなら選択し直す(同期)。
        const pick = (list: EbayBusinessPolicy[], currentId: string | null) => {
          const stillValid = currentId && list.some((p) => p.policyId === currentId);
          if (stillValid) return undefined;
          const defaults = list.filter((p) => p.isDefault);
          const chosen = list.length === 1 ? list[0] : defaults.length === 1 ? defaults[0] : undefined;
          if (chosen) return chosen.policyId;
          return currentId ? null : undefined; // 消えたIDは解除
        };
        const f = pick(json.fulfillmentPolicies, current.fulfillmentPolicyId);
        if (f !== undefined) autoPatch.fulfillmentPolicyId = f;
        const pay = pick(json.paymentPolicies, current.paymentPolicyId);
        if (pay !== undefined) autoPatch.paymentPolicyId = pay;
        const r = pick(json.returnPolicies, current.returnPolicyId);
        if (r !== undefined) autoPatch.returnPolicyId = r;
        const enabled = json.inventoryLocations.filter((l) => l.locationStatus === 'ENABLED');
        const locValid =
          current.merchantLocationKey &&
          json.inventoryLocations.some((l) => l.merchantLocationKey === current.merchantLocationKey);
        if (!locValid) {
          const chosenLoc =
            json.inventoryLocations.length === 1 ? json.inventoryLocations[0] : enabled.length === 1 ? enabled[0] : undefined;
          if (chosenLoc) autoPatch.merchantLocationKey = chosenLoc.merchantLocationKey;
          else if (current.merchantLocationKey) autoPatch.merchantLocationKey = null;
        }
        if (Object.keys(autoPatch).length > 0) {
          current.onChange(autoPatch);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setData(emptyData);
        setErrorMessage(err instanceof Error ? err.message : '取得に失敗しました。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load, reloadKey]);

  return (
    <section className="card" id="business-policies-section">
      <div className="legend-row">
        <h2>7. eBay Business Policies・保管場所(§110 step10)</h2>
        <span className="hint">出品者アカウント単位の設定</span>
      </div>
      <p className="subnote">
        配送・支払い・返品ポリシー、および発送元(保管場所)は、eBayのセラーハブに登録済みの内容をそのまま読み込みます。
        このアプリからの新規登録はできません(追加・変更はeBayのセラーハブで行い、下の「eBayと同期」を押してください)。
        候補が1件だけの場合、または複数でもeBayで「既定」に設定されたものがある場合は、自動で選択されます。
      </p>
      <button type="button" className="btn" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
        {loading ? '同期中…' : 'eBayと同期'}
      </button>

      {loading ? (
        <p className="subnote">読み込んでいます…</p>
      ) : errorMessage ? (
        <p className="subnote" style={{ color: 'var(--danger)' }}>
          {errorMessage}
          {errorMessage.includes('連携されていません') && (
            <>
              {' '}
              <a href="/settings">/settings</a> からADMINが連携してください。
            </>
          )}
        </p>
      ) : (
        <>
          {data.warnings.length > 0 && (
            <>
              <ul className="subnote" style={{ color: 'var(--danger)' }}>
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          )}

          <PolicySelect
            label="配送ポリシー(Fulfillment Policy)"
            policies={data.fulfillmentPolicies}
            value={fulfillmentPolicyId}
            onChange={(v) => onChange({ fulfillmentPolicyId: v })}
          />
          <PolicySelect
            label="支払いポリシー(Payment Policy)"
            policies={data.paymentPolicies}
            value={paymentPolicyId}
            onChange={(v) => onChange({ paymentPolicyId: v })}
          />
          <PolicySelect
            label="返品ポリシー(Return Policy)"
            policies={data.returnPolicies}
            value={returnPolicyId}
            onChange={(v) => onChange({ returnPolicyId: v })}
          />

          <div className="field">
            <label htmlFor="merchant-location">発送元(Inventory Location)</label>
            {data.inventoryLocations.length === 0 ? (
              <p className="subnote">登録済みの保管場所がありません。</p>
            ) : (
              <select
                id="merchant-location"
                value={merchantLocationKey ?? ''}
                onChange={(e) => onChange({ merchantLocationKey: e.target.value || null })}
              >
                <option value="">選択してください</option>
                {data.inventoryLocations.map((loc) => (
                  <option key={loc.merchantLocationKey} value={loc.merchantLocationKey}>
                    {(loc.name ?? loc.merchantLocationKey) +
                      (loc.city ? `(${loc.city})` : '') +
                      (loc.locationStatus !== 'ENABLED' ? ` [${loc.locationStatus}]` : '')}
                  </option>
                ))}
              </select>
            )}

          </div>
        </>
      )}
    </section>
  );
}

function PolicySelect({
  label,
  policies,
  value,
  onChange,
}: {
  label: string;
  policies: EbayBusinessPolicy[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const id = `policy-${label}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {policies.length === 0 ? (
        <p className="subnote">
          このアカウントでは{label}が見つかりませんでした。eBayのセラーハブ(Business Policies)で作成してから「eBayと同期」を押してください。
        </p>
      ) : (
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">選択してください</option>
          {policies.map((p) => (
            <option key={p.policyId} value={p.policyId}>
              {p.name + (p.isDefault ? '(eBayの既定)' : '')}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
