interface Props {
  title: string;
  color: string;
  fillId: string;
  unit: string;
  valueLabel: string;
  sub: string;
  points: number[];
}

// mapeia valores -> pontos do SVG (igual ao design: W=300, H=110, P=6)
function poly(arr: number[]): string[] {
  const W = 300, H = 110, P = 6;
  const max = Math.max(...arr) || 1;
  const n = arr.length;
  return arr.map((v, i) => {
    const x = P + (n <= 1 ? 0 : i / (n - 1)) * (W - 2 * P);
    const y = H - P - (v / max) * (H - 2 * P);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
}

/** SM-Line — série no tempo (dados reais). */
export function SMLine({ title, color, fillId, unit, valueLabel, sub, points }: Props) {
  const arr = points.length ? points : [0, 0];
  const W = 300, H = 110, P = 6;
  const pts = poly(arr);
  const [lastX, lastY] = pts[pts.length - 1].split(',');
  const area = `${P},${H - P} ${pts.join(' ')} ${W - P},${H - P}`;

  return (
    <div className="card line">
      <div className="line-head">
        <div>
          <div className="line-title">{title}</div>
          <div className="line-value-row">
            <span className="line-value">{valueLabel}</span>
            <span className="line-unit">{unit}</span>
          </div>
        </div>
        <span className="line-sub">{sub}</span>
      </div>
      <svg viewBox="0 0 300 110" preserveAspectRatio="none">
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.20" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${fillId})`} />
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={lastX} cy={lastY} r="3.5" fill={color} stroke="#fff" strokeWidth="2" />
      </svg>
    </div>
  );
}
