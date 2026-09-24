'use client';

import { CONDITION_OPTIONS, type ConditionValue } from '@/types/listing';

/**
 * TODO(§43): 固定Condition一覧はREMOVE予定。
 * eBay Metadata API の getItemConditionPolicies(categoryId)から
 * カテゴリーごとの利用可能Condition一覧を動的取得する方式に置き換える。
 */
export function ConditionSection({
  condition,
  onChange,
}: {
  condition: ConditionValue;
  onChange: (value: ConditionValue) => void;
}) {
  return (
    <section className="card">
      <div className="legend-row">
        <h2>2. eBayの状態(Item Condition)</h2>
        <span className="hint">出品フォーム用・任意</span>
      </div>
      <p className="subnote">
        お客様に実際にお届けする商品の状態を選びます。eBayの出品フォームにある「Condition」の区分と同じものです。
      </p>
      <div className="pill-group">
        {CONDITION_OPTIONS.map((opt) => (
          <label className="pill" key={opt.value}>
            <input
              type="radio"
              name="condition"
              value={opt.value}
              checked={condition === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <span>{opt.labelJa}</span>
          </label>
        ))}
      </div>
      <p className="subnote">
        TODO(§43): カテゴリー確定後にeBay Metadata APIから取得した一覧に置き換える。
      </p>
    </section>
  );
}
