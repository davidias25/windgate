/**
 * Dólar do dia: PTAX do Banco Central (API pública Olinda, sem chave).
 * Guarda em memória por 30 minutos. A PTAX é a referência de mercado; a
 * taxa que vale para a operação é sempre a do contrato de câmbio fechado.
 */
const URL_BCB = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)';
let cache = null;
const mdY = d => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;

/** Lê a série dos últimos dias e devolve a última PTAX (venda) com a variação. */
function interpretar(j) {
  const v = (j && j.value) || [];
  if (!v.length) return null;
  const ult = v[v.length - 1], ant = v.length > 1 ? v[v.length - 2] : null;
  return { venda: +ult.cotacaoVenda, compra: +ult.cotacaoCompra, em: ult.dataHoraCotacao, anterior: ant ? +ant.cotacaoVenda : null,
    variacao: ant ? (+ult.cotacaoVenda - +ant.cotacaoVenda) / +ant.cotacaoVenda : null, serie: v.slice(-10).map(x => ({ em: String(x.dataHoraCotacao).slice(0, 10), venda: +x.cotacaoVenda })) };
}
async function ptax(fetchImpl, agora) {
  const t = (agora || new Date()).getTime();
  if (cache && t - cache.t < 30 * 60 * 1000) return cache.dado;
  const fim = agora || new Date(), ini = new Date(fim); ini.setDate(ini.getDate() - 14);
  const url = `${URL_BCB}?@dataInicial='${mdY(ini)}'&@dataFinalCotacao='${mdY(fim)}'&$format=json&$orderby=dataHoraCotacao%20asc`;
  const r = await (fetchImpl || fetch)(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('Banco Central indisponível (' + r.status + ')');
  const dado = interpretar(await r.json());
  if (!dado) throw new Error('Sem cotação PTAX no período.');
  cache = { t, dado }; return dado;
}
module.exports = { ptax, interpretar, _reset: () => { cache = null; } };
