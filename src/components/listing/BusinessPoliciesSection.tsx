'use client';

import { useCallback, useEffect, useState } from 'react';
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
  const [showCreateLocation, setShowCreateLocation] = useState(false);

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
        <h2>9. eBay Business Policies・保管場所(§110 step10)</h2>
        <span className="hint">出品者アカウント単位の設定</span>
      </div>
      <p className="subnote">
        配送・支払い・返品ポリシー、および商品の発送元(保管場所)は、いずれもADMINが連携したeBayアカウント側の設定から選びます。
        アプリ側で新しいポリシーは作成できません(ポリシー自体はeBayの「Business Policies」画面で管理してください)。
      </p>

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
              {isAdmin && data.warnings.some((w) => w.includes('not eligible for Business Policy')) && (
                <BusinessPolicyOptIn onDone={() => setReloadKey((k) => k + 1)} />
              )}
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

            {isAdmin && (
              <>
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 8 }}
                  onClick={() => setShowCreateLocation((v) => !v)}
                >
                  {showCreateLocation ? '閉じる' : '＋ 新しい保管場所を登録'}
                </button>
                {showCreateLocation && (
                  <CreateLocationForm
                    onCreated={() => {
                      setShowCreateLocation(false);
                      setReloadKey((k) => k + 1);
                    }}
                  />
                )}
              </>
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
          このアカウントでは{label}が見つかりませんでした。eBayの「Business Policies」設定で作成してください。
        </p>
      ) : (
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">選択してください</option>
          {policies.map((p) => (
            <option key={p.policyId} value={p.policyId}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function BusinessPolicyOptIn({ onDone }: { onDone: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/ebay/business-policies-opt-in', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <p className="subnote">
        このeBayアカウントはまだ「Business Policies」プログラムに加入していないため、配送/支払い/返品ポリシーが1件も表示されません。
        下のボタンで加入手続きができます(eBayのアカウント設定画面から行うのと同じ操作です)。
      </p>
      <button type="button" className="btn primary" disabled={submitting} onClick={handleClick}>
        {submitting ? '加入しています…' : 'Business Policiesに加入する'}
      </button>
      {error && (
        <p className="subnote" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function CreateLocationForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    merchantLocationKey: '',
    name: '',
    addressLine1: '',
    city: '',
    stateOrProvince: '',
    postalCode: '',
    country: 'JP',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/ebay/inventory-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <p className="subnote">
        通常はONEFLATの発送拠点を1件登録すれば十分です。Location Key(半角英数字、他と重複しないID)は
        「oneflat-main」のような分かりやすいものにしてください。
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <div className="field">
          <label htmlFor="loc-key">Location Key(ID・半角英数字)</label>
          <input
            id="loc-key"
            value={form.merchantLocationKey}
            onChange={(e) => update('merchantLocationKey', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loc-name">名称</label>
          <input id="loc-name" value={form.name} onChange={(e) => update('name', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="loc-address1">住所(番地まで)</label>
          <input
            id="loc-address1"
            value={form.addressLine1}
            onChange={(e) => update('addressLine1', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loc-city">市区町村</label>
          <input id="loc-city" value={form.city} onChange={(e) => update('city', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="loc-state">都道府県</label>
          <input
            id="loc-state"
            value={form.stateOrProvince}
            onChange={(e) => update('stateOrProvince', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loc-postal">郵便番号</label>
          <input id="loc-postal" value={form.postalCode} onChange={(e) => update('postalCode', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="loc-country">国コード(ISO、例: JP)</label>
          <input id="loc-country" value={form.country} onChange={(e) => update('country', e.target.value)} />
        </div>
      </div>
      {error && (
        <p className="subnote" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      <button type="button" className="btn primary" disabled={submitting} onClick={handleSubmit}>
        {submitting ? '登録しています…' : '登録する'}
      </button>
    </div>
  );
}
