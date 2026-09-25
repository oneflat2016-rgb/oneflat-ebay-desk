'use client';

import type { TemplateColors } from '@/types/listing';

const PRESETS: { name: string; border: string; accent: string }[] = [
  { name: '定番(黒×イエロー)', border: '#000000', accent: '#FFF100' },
  { name: 'ビタミンオレンジ', border: '#1B1B1B', accent: '#FF7A1F' },
  { name: 'エレクトリックブルー', border: '#101B2E', accent: '#3D8BFF' },
  { name: 'ビビッドピンク', border: '#2B0F1A', accent: '#FF3D8B' },
  { name: 'トロピカルグリーン', border: '#12261A', accent: '#2ED47A' },
  { name: 'モノクロ', border: '#000000', accent: '#CCCCCC' },
];

/**
 * TODO(§51): 商品登録画面からは外し、管理画面「説明文テンプレート」へ移動する。
 * Phase1-STEP1時点では見た目を変えないため、いったんこの位置に残している。
 */
export function ColorTemplateSection({
  colors,
  onChange,
}: {
  colors: TemplateColors;
  onChange: (colors: TemplateColors) => void;
}) {
  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div className="legend-row">
        <h2 style={{ fontSize: '1.05rem' }}>テンプレートの配色</h2>
        <span className="hint">TODO: 将来は管理画面へ移動(§51)</span>
      </div>
      <p className="subnote" style={{ margin: '0 0 12px' }}>
        見出し下のアクセントラインと枠線の色です。
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            onClick={() => onChange({ border: preset.border, accent: preset.accent })}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: preset.accent,
                display: 'inline-block',
                border: '1px solid rgba(0,0,0,.15)',
              }}
            />
            {preset.name}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field">
          <label htmlFor="color-border">枠線・見出し</label>
          <input
            type="color"
            id="color-border"
            value={colors.border}
            onChange={(e) => onChange({ ...colors, border: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="color-accent">アクセントライン</label>
          <input
            type="color"
            id="color-accent"
            value={colors.accent}
            onChange={(e) => onChange({ ...colors, accent: e.target.value })}
          />
        </div>
        <button
          type="button"
          className="btn ghost"
          onClick={() => onChange({ border: '#000000', accent: '#fff100' })}
        >
          初期の配色(黒×イエロー)に戻す
        </button>
      </div>
    </section>
  );
}
