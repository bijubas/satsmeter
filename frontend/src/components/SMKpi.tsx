interface Props {
  label: string;
  value: string;
  unit: string;
  sub: string;
  accent: string;
}

/** SM-Kpi — card de KPI (projeção). */
export function SMKpi({ label, value, unit, sub, accent }: Props) {
  return (
    <div className="card kpi">
      <div className="kpi-head">
        <span className="dot" style={{ background: accent }} />
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value-row">
        <span className="kpi-value">{value}</span>
        <span className="kpi-unit">{unit}</span>
      </div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}
