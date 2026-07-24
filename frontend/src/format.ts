// Formatação pt-BR — igual ao renderVals() do design.
export const nf = (d = 0) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtInt = (n: number) => nf(0).format(Math.round(n));
export const fmtBRL = (n: number, d = 2) => 'R$ ' + nf(d).format(n);
export const fmtSatsC = (n: number) => {
  if (n >= 1e6) return nf(2).format(n / 1e6) + ' M';
  if (n >= 1e3) return nf(1).format(n / 1e3) + ' k';
  return fmtInt(n);
};
export const fmtHora = (ts: number) =>
  new Date(ts).toLocaleTimeString('pt-BR', { hour12: false });
