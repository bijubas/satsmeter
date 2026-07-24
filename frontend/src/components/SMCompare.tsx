import type { Assumptions } from '../types';
import type { Projecao } from '../projection';
import { fmtInt, fmtBRL } from '../format';

interface SliderCfg {
  key: keyof Assumptions;
  label: string;
  min: number;
  max: number;
  step: number;
  display: (a: Assumptions) => string;
}

const SLIDERS: SliderCfg[] = [
  { key: 'casas', label: 'Casas', min: 1, max: 500, step: 1, display: (a) => fmtInt(a.casas) },
  { key: 'dias', label: 'Período', min: 1, max: 365, step: 1, display: (a) => a.dias + ' dias' },
  { key: 'cotacao', label: 'Cotação BTC', min: 100000, max: 800000, step: 5000, display: (a) => fmtBRL(a.cotacao, 0) },
  { key: 'custoBoleto', label: 'Custo boleto', min: 0, max: 12, step: 0.1, display: (a) => fmtBRL(a.custoBoleto, 2) },
  { key: 'pspMensal', label: 'Mensalidade PSP', min: 0, max: 600, step: 10, display: (a) => fmtBRL(a.pspMensal, 0) },
];

interface Props {
  assumptions: Assumptions;
  proj: Projecao;
  onChange: (key: keyof Assumptions, value: number) => void;
}

/** SM-Compare — o gráfico do pitch: sliders ao vivo + barras comparativas + callout. */
export function SMCompare({ assumptions, proj, onChange }: Props) {
  return (
    <div className="card compare">
      <div className="cmp-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="cmp-eyebrow">O gráfico do pitch</span>
          <span className="cmp-title">Custo de processar o volume: boleto × PSP × Lightning</span>
        </div>
        <span className="cmp-volume">{proj.volumeLabel}</span>
      </div>

      <div className="sliders">
        {SLIDERS.map((s) => (
          <label className="slider" key={s.key}>
            <span className="slider-top">
              <span className="slider-label">{s.label}</span>
              <span className="slider-value">{s.display(assumptions)}</span>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={assumptions[s.key]}
              onChange={(e) => onChange(s.key, parseFloat(e.target.value))}
            />
          </label>
        ))}
      </div>

      <div className="rails">
        {proj.rows.map((r) => (
          <div key={r.name}>
            <div className="rail-top">
              <span className="rail-name-wrap">
                <span className="rail-name">{r.name}</span>
                <span className="rail-desc">{r.desc}</span>
              </span>
              <span className="rail-amount" style={{ color: r.amountColor }}>{r.amount}</span>
            </div>
            <div className="rail-track">
              <div className="rail-fill" style={{ width: r.pct + '%', background: r.color }} />
            </div>
          </div>
        ))}
      </div>

      <div className="callout">
        <span className="callout-pct">{proj.econPct}</span>
        <span className="callout-text">{proj.econLabel}</span>
      </div>
    </div>
  );
}
