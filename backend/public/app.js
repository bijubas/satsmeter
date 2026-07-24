/* SatsMeter — dashboard 1b "Pitch hero".
 *
 * Dois domínios de dados, integrados na mesma tela:
 *  1) PROJEÇÃO (client-side, sliders ao vivo)  -> Compare + 4 KPIs.
 *     Espelha renderVals() do design (fonte de verdade); atualiza sem round-trip.
 *  2) REAL (WebSocket /ws, do ESP32/simulador)  -> 2 séries + Extrato + badge "ao vivo".
 *     Cresce em tempo real conforme as leituras/liquidações chegam do backend.
 */

// ---------- formatação (pt-BR, igual ao design) ----------
const nf = (d = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtInt = (n) => nf(0).format(Math.round(n));
const fmtBRL = (n, d = 2) => 'R$ ' + nf(d).format(n);
const fmtSatsC = (n) => {
  if (n >= 1e6) return nf(2).format(n / 1e6) + ' M';
  if (n >= 1e3) return nf(1).format(n / 1e3) + ' k';
  return fmtInt(n);
};

// ---------- projeção (espelho fiel de renderVals) ----------
const assumptions = {
  cotacao: 380000, casas: 50, dias: 30, whLiq: 100, kwhDia: 8, precoKwh: 0.8,
  custoBoleto: 3.5, pspMensal: 99, pspFixo: 0.39, pspPct: 3.99, lnFee: 1, lnPct: 0.1,
};

function projetar(a) {
  const satsPorBrl = 1e8 / a.cotacao;
  const liquN = (a.casas * a.dias * a.kwhDia * 1000) / a.whLiq;
  const energia = a.casas * a.dias * a.kwhDia;
  const valorTotal = energia * a.precoKwh;
  const satsMov = valorTotal * satsPorBrl;
  const valorPorLiq = valorTotal / liquN;
  const cortes = Math.max(1, Math.round(a.casas * a.dias * 0.006));
  const religas = Math.max(0, Math.round(cortes * 0.92));
  const liqPorMin = fmtInt(Math.max(1, liquN / (a.dias * 24 * 60)));

  const custoBoleto = liquN * a.custoBoleto;
  const custoPsp = liquN * (a.pspFixo + (valorPorLiq * a.pspPct) / 100) + a.pspMensal * (a.dias / 30);
  const custoLn = liquN * (a.lnFee / satsPorBrl + (valorPorLiq * a.lnPct) / 100);
  const maxC = Math.max(custoBoleto, custoPsp, custoLn, 1);
  const econ = (1 - custoLn / custoBoleto) * 100;

  return {
    kpiLiq: fmtInt(liquN), subLiq: 'a cada ' + a.whLiq + ' Wh consumidos',
    kpiSats: fmtSatsC(satsMov), subSats: '≈ ' + fmtBRL(valorTotal, 0) + ' ao produtor',
    kpiEnergia: fmtInt(energia), subEnergia: a.casas + ' casas × ' + a.dias + ' d × ' + nf(0).format(a.kwhDia) + ' kWh/dia',
    kpiCortes: cortes + ' / ' + religas, subCortes: 'acionados sem intervenção',
    volumeLabel: fmtInt(liquN) + ' microliquidações  ·  ' + a.casas + ' casas × ' + a.dias + ' dias',
    econPct: nf(1).format(econ) + '%',
    econLabel: 'mais barato que boleto para o mesmo volume — Lightning ' + fmtBRL(custoLn, 0) + ' vs ' + fmtBRL(custoBoleto, 0) + '.',
    rows: [
      { name: 'Boleto', desc: 'R$ ' + nf(2).format(a.custoBoleto) + ' por cobrança', amount: fmtBRL(custoBoleto), amountColor: '#6b675e', pct: (custoBoleto / maxC) * 100, color: '#d8d3c8' },
      { name: 'PSP / gateway', desc: nf(2).format(a.pspPct) + '% + R$ ' + nf(2).format(a.pspFixo) + '/tx + mensalidade', amount: fmtBRL(custoPsp), amountColor: '#6b675e', pct: (custoPsp / maxC) * 100, color: '#a8a297' },
      { name: 'Lightning', desc: '~' + a.lnFee + ' sat + ' + nf(1).format(a.lnPct) + '%/tx', amount: fmtBRL(custoLn), amountColor: '#d97a06', pct: Math.max((custoLn / maxC) * 100, 0.6), color: '#f7931a' },
    ],
  };
}

// ---------- SVG das séries (igual ao design) ----------
function poly(arr) {
  const W = 300, H = 110, P = 6;
  const max = Math.max(...arr) || 1, n = arr.length;
  return arr.map((v, i) => {
    const x = P + (n <= 1 ? 0 : i / (n - 1)) * (W - 2 * P);
    const y = H - P - (v / max) * (H - 2 * P);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
}
function lineSVG(fillId, color, arrIn) {
  const arr = arrIn.length ? arrIn : [0, 0];
  const W = 300, H = 110, P = 6;
  const pts = poly(arr);
  const last = pts[pts.length - 1].split(',');
  const area = P + ',' + (H - P) + ' ' + pts.join(' ') + ' ' + (W - P) + ',' + (H - P);
  return `<svg viewBox="0 0 300 110" preserveAspectRatio="none">
    <defs><linearGradient id="${fillId}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.20"></stop>
      <stop offset="1" stop-color="${color}" stop-opacity="0"></stop></linearGradient></defs>
    <polygon points="${area}" fill="url(#${fillId})"></polygon>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline>
    <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${color}" stroke="#fff" stroke-width="2"></circle>
  </svg>`;
}

// ---------- build DOM uma vez (para os sliders não perderem o foco) ----------
const KPIS = [
  { key: 'liq', label: 'Microliquidações', unit: 'liquid.', accent: '#f7931a' },
  { key: 'sats', label: 'Sats movimentados', unit: 'sats', accent: '#7b61ff' },
  { key: 'energia', label: 'Energia liquidada', unit: 'kWh', accent: '#1f9d57' },
  { key: 'cortes', label: 'Cortes / religas', unit: 'auto', accent: '#2f6bff' },
];
const SLIDERS = [
  { key: 'casas', label: 'Casas', min: 1, max: 500, step: 1, disp: (a) => fmtInt(a.casas) },
  { key: 'dias', label: 'Período', min: 1, max: 365, step: 1, disp: (a) => a.dias + ' dias' },
  { key: 'cotacao', label: 'Cotação BTC', min: 100000, max: 800000, step: 5000, disp: (a) => fmtBRL(a.cotacao, 0) },
  { key: 'custoBoleto', label: 'Custo boleto', min: 0, max: 12, step: 0.1, disp: (a) => fmtBRL(a.custoBoleto, 2) },
  { key: 'pspMensal', label: 'Mensalidade PSP', min: 0, max: 600, step: 10, disp: (a) => fmtBRL(a.pspMensal, 0) },
];

const refs = {};

function buildKpis() {
  const el = document.getElementById('kpis');
  el.innerHTML = '';
  refs.kpi = {};
  for (const k of KPIS) {
    const card = document.createElement('div');
    card.className = 'card kpi';
    card.innerHTML = `
      <div class="kpi-head"><span class="dot" style="background:${k.accent}"></span>
        <span class="kpi-label">${k.label}</span></div>
      <div class="kpi-value-row"><span class="kpi-value" data-v></span><span class="kpi-unit">${k.unit}</span></div>
      <div class="kpi-sub" data-s></div>`;
    el.appendChild(card);
    refs.kpi[k.key] = { v: card.querySelector('[data-v]'), s: card.querySelector('[data-s]') };
  }
}

function buildCompare() {
  const el = document.getElementById('compare');
  el.className = 'card compare';
  el.innerHTML = `
    <div class="cmp-head">
      <div style="display:flex;flex-direction:column;gap:6px">
        <span class="cmp-eyebrow">O gráfico do pitch</span>
        <span class="cmp-title">Custo de processar o volume: boleto × PSP × Lightning</span>
      </div>
      <span class="cmp-volume" data-volume></span>
    </div>
    <div class="sliders" data-sliders></div>
    <div class="rails" data-rails></div>
    <div class="callout"><span class="callout-pct" data-econpct></span><span class="callout-text" data-econlabel></span></div>`;

  refs.volume = el.querySelector('[data-volume]');
  refs.econPct = el.querySelector('[data-econpct]');
  refs.econLabel = el.querySelector('[data-econlabel]');

  // sliders
  const sl = el.querySelector('[data-sliders]');
  refs.slider = {};
  for (const s of SLIDERS) {
    const label = document.createElement('label');
    label.className = 'slider';
    label.innerHTML = `
      <span class="slider-top"><span class="slider-label">${s.label}</span><span class="slider-value" data-disp></span></span>
      <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${assumptions[s.key]}">`;
    const input = label.querySelector('input');
    input.addEventListener('input', (e) => {
      assumptions[s.key] = parseFloat(e.target.value);
      updateProjection();
    });
    sl.appendChild(label);
    refs.slider[s.key] = { disp: label.querySelector('[data-disp]') };
  }

  // rails (Boleto, PSP, Lightning) — 3 fixos
  const rl = el.querySelector('[data-rails]');
  refs.rail = [];
  for (let i = 0; i < 3; i++) {
    const row = document.createElement('div');
    row.innerHTML = `
      <div class="rail-top">
        <span class="rail-name-wrap"><span class="rail-name" data-name></span><span class="rail-desc" data-desc></span></span>
        <span class="rail-amount" data-amount></span>
      </div>
      <div class="rail-track"><div class="rail-fill" data-fill></div></div>`;
    rl.appendChild(row);
    refs.rail.push({
      name: row.querySelector('[data-name]'), desc: row.querySelector('[data-desc]'),
      amount: row.querySelector('[data-amount]'), fill: row.querySelector('[data-fill]'),
    });
  }
}

function updateProjection() {
  const a = assumptions;
  const p = projetar(a);
  // sliders display
  for (const s of SLIDERS) refs.slider[s.key].disp.textContent = s.disp(a);
  // volume + callout
  refs.volume.textContent = p.volumeLabel;
  refs.econPct.textContent = p.econPct;
  refs.econLabel.textContent = p.econLabel;
  // rails
  p.rows.forEach((r, i) => {
    const ref = refs.rail[i];
    ref.name.textContent = r.name;
    ref.desc.textContent = r.desc;
    ref.amount.textContent = r.amount;
    ref.amount.style.color = r.amountColor;
    ref.fill.style.width = r.pct + '%';
    ref.fill.style.background = r.color;
  });
  // KPIs (projeção)
  refs.kpi.liq.v.textContent = p.kpiLiq; refs.kpi.liq.s.textContent = p.subLiq;
  refs.kpi.sats.v.textContent = p.kpiSats; refs.kpi.sats.s.textContent = p.subSats;
  refs.kpi.energia.v.textContent = p.kpiEnergia; refs.kpi.energia.s.textContent = p.subEnergia;
  refs.kpi.cortes.v.textContent = p.kpiCortes; refs.kpi.cortes.s.textContent = p.subCortes;
}

// ---------- séries + extrato (dados REAIS via WebSocket) ----------
const EV_STYLE = {
  'Liquidação': { c: '#f7931a', s: 'Confirmado', sc: '#1f7a45', bg: 'rgba(31,157,87,.12)' },
  'Religa': { c: '#2f6bff', s: 'Religado', sc: '#2451c9', bg: 'rgba(47,107,255,.12)' },
  'Corte': { c: '#e0533d', s: 'Cortado', sc: '#c23b26', bg: 'rgba(224,83,61,.12)' },
};
const fmtHora = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour12: false });
let ultimoEventoId = 0;

function buildLine(id, title, unit) {
  const el = document.getElementById(id);
  el.className = 'card line';
  el.innerHTML = `
    <div class="line-head">
      <div>
        <div class="line-title">${title}</div>
        <div class="line-value-row"><span class="line-value" data-v>0</span><span class="line-unit">${unit}</span></div>
      </div>
      <span class="line-sub" data-sub></span>
    </div>
    <div data-svg></div>`;
  return { v: el.querySelector('[data-v]'), sub: el.querySelector('[data-sub]'), svg: el.querySelector('[data-svg]') };
}

function buildExtrato() {
  const el = document.getElementById('extrato');
  el.className = 'card extrato';
  el.innerHTML = `
    <div class="ext-head"><span class="ext-title">Extrato · últimos eventos</span>
      <span class="ext-live"><span class="dot dot-green"></span>ao vivo</span></div>
    <div class="ext-grid ext-colhead">
      <span>Hora</span><span>Evento</span><span class="text-right">Energia</span>
      <span class="text-right">Sats</span><span class="text-right">Status</span></div>
    <div data-rows></div>`;
  return el.querySelector('[data-rows]');
}

function updateReal(m) {
  // badge ao vivo
  document.getElementById('liqPorMin').textContent = fmtInt(m.liqPorMin || 0);

  // séries
  const serie = m.serie || [];
  const kwhArr = serie.map((p) => p.kwh);
  const satsArr = serie.map((p) => p.sats);
  const lastKwh = kwhArr.length ? kwhArr[kwhArr.length - 1] : 0;
  const lastSats = satsArr.length ? satsArr[satsArr.length - 1] : 0;

  refs.lineKwh.v.textContent = lastKwh >= 100 ? fmtInt(lastKwh) : nf(2).format(lastKwh);
  refs.lineKwh.sub.textContent = 'acumulado · tempo real';
  refs.lineKwh.svg.innerHTML = lineSVG('k1b', '#f7931a', kwhArr);

  refs.lineSats.v.textContent = fmtSatsC(lastSats);
  refs.lineSats.sub.textContent = 'transferido ao produtor';
  refs.lineSats.svg.innerHTML = lineSVG('s1b', '#7b61ff', satsArr);

  // extrato (5 primeiros = mais recentes)
  const eventos = (m.eventos || []).slice(0, 5);
  const novoTopo = eventos.length ? eventos[0].id : 0;
  if (eventos.length === 0) {
    refs.extRows.innerHTML = '<div class="ext-empty">aguardando leituras do medidor…</div>';
  } else {
    refs.extRows.innerHTML = eventos.map((e) => {
      const st = EV_STYLE[e.tipo] || EV_STYLE['Liquidação'];
      const isLiq = e.tipo === 'Liquidação';
      const kwh = isLiq ? nf(2).format(e.wh / 1000) + ' kWh' : '—';
      const sats = isLiq ? '+' + fmtInt(e.sats) : '—';
      const anim = e.id === novoTopo && novoTopo !== ultimoEventoId ? ' enter' : '';
      return `<div class="ext-grid ext-row${anim}">
        <span class="ext-time">${fmtHora(e.ts)}</span>
        <span class="ext-evento"><span class="dot" style="background:${st.c}"></span>
          <span class="ext-tipo">${e.tipo}</span><span class="ext-casa">#${e.casa}</span></span>
        <span class="ext-kwh">${kwh}</span>
        <span class="ext-sats">${sats}</span>
        <span class="ext-status" style="color:${st.sc};background:${st.bg}">${st.s}</span>
      </div>`;
    }).join('');
  }
  ultimoEventoId = novoTopo;
}

// ---------- WebSocket ----------
function conectar() {
  const note = document.getElementById('connNote');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => { note.textContent = 'conectado ao backend · tempo real ativo'; note.className = 'conn-note ok'; };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'metrics') updateReal(msg.data);
    } catch { /* ignora */ }
  };
  ws.onclose = () => {
    note.textContent = 'backend offline · reconectando…'; note.className = 'conn-note off';
    setTimeout(conectar, 1500);
  };
  ws.onerror = () => ws.close();
}

// ---------- boot ----------
buildKpis();
buildCompare();
refs.lineKwh = buildLine('lineKwh', 'CONSUMO ACUMULADO', 'kWh');
refs.lineSats = buildLine('lineSats', 'SATS AO PRODUTOR', 'sats');
refs.extRows = buildExtrato();
updateProjection();
updateReal({ serie: [], eventos: [], liqPorMin: 0 });
conectar();
