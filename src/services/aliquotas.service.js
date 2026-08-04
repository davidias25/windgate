/**
 * Banco de alíquotas por NCM, alimentado pelas fontes oficiais.
 *
 * O Siscomex NÃO publica alíquota: a API Classif traz só a nomenclatura e a API
 * TTCE traz só o regime tributário. As alíquotas vêm de outros dois órgãos, e
 * ambos publicam planilha aberta:
 *
 *   II  → TEC, Anexo I da Resolução Gecex 272/2021 (MDIC/Camex)
 *   IPI → TIPI, Decreto 11.158/2022 (Receita Federal)
 *
 * Este serviço baixa as duas, extrai NCM → alíquota e guarda o resultado, para
 * a cotação não depender de consulta externa a cada digitação. A atualização
 * roda a cada 15 dias.
 *
 * PIS/COFINS-Importação não entram aqui: são fixados por lei (10.865/2004,
 * 2,1% e 9,65%) com listas de exceção que não têm planilha aberta equivalente.
 */
const XLSX = require('xlsx');
const { baixarArquivo, enviarArquivo } = require('../integrations/supabase.service');

const PAGINA_TEC = 'https://www.gov.br/mdic/pt-br/assuntos/camex/se-camex/strat/tarifas/vigentes';
const TEC_FALLBACK = 'https://www.gov.br/mdic/pt-br/assuntos/camex/estrategia-comercial/arquivos-listas/03-08-2026-anexos-i-a-x-resolucao-gecex-272-21.xlsx';
const URL_TIPI = 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.xlsx';
const OBJETO = process.env.WINDGATE_ALIQUOTAS_OBJETO || 'sistema/aliquotas.json';

const INTERVALO_DIAS = 15;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

let _tabela = null;          // { atualizadoEm, total, fontes, ncms: { '84295900': {ii,ipi,desc,marcador} } }
let _atualizando = false;

const soDigitos = s => String(s || '').replace(/\D/g, '');

/** "12,6BK" → { valor: 12.6, marcador: 'BK' } · 0 → { valor: 0 } */
function parseAliquota(cru) {
  if (cru === '' || cru == null) return null;
  if (typeof cru === 'number') return { valor: cru, marcador: '' };
  const txt = String(cru).trim();
  const m = txt.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return null;
  return { valor: parseFloat(m[1].replace(',', '.')), marcador: (m[2] || '').trim() };
}

async function baixarPlanilha(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.slice(0, 2).toString() !== 'PK') throw new Error(`Resposta não é um .xlsx (${url})`);
  return buf;
}

/** O nome do arquivo da TEC muda a cada revisão; descobre o link atual. */
async function urlAtualTEC() {
  try {
    const res = await fetch(PAGINA_TEC, { signal: AbortSignal.timeout(60000) });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/https?:\/\/[^"'\s]*anexos-i-a-x-resolucao-gecex-272-21\.xlsx/i);
      if (m) return m[0];
    }
  } catch (e) {
    console.warn('⚠️ Não foi possível ler a página da TEC:', e.message);
  }
  return TEC_FALLBACK;
}

function extrair(buf, aba, colAliquota) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const nome = wb.SheetNames.find(n => n === aba) || wb.SheetNames[0];
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '' });
  const reNCM = /^\d{4}\.\d{2}\.\d{2}$/;
  const out = {};
  linhas.forEach(l => {
    const cod = String(l[0] || '').trim();
    if (!reNCM.test(cod)) return;
    const a = parseAliquota(l[colAliquota]);
    if (!a) return;
    out[soDigitos(cod)] = { valor: a.valor, marcador: a.marcador, desc: String(l[colAliquota === 2 ? 1 : 2] || '').trim() };
  });
  return { registros: out, planilha: nome };
}

/** Baixa TEC e TIPI, cruza por NCM e devolve a tabela consolidada. */
async function montarTabela() {
  const urlTec = await urlAtualTEC();

  const [bufTec, bufTipi] = await Promise.all([
    baixarPlanilha(urlTec),
    baixarPlanilha(URL_TIPI)
  ]);

  const tec = extrair(bufTec, 'Anexo I - TEC', 2);
  const tipi = extrair(bufTipi, 'Tabela Completa', 3);

  const ncms = {};
  Object.entries(tec.registros).forEach(([ncm, r]) => {
    ncms[ncm] = { ii: r.valor, marcador: r.marcador || '', desc: r.desc };
  });
  Object.entries(tipi.registros).forEach(([ncm, r]) => {
    if (!ncms[ncm]) ncms[ncm] = { desc: r.desc };
    ncms[ncm].ipi = r.valor;
  });

  return {
    atualizadoEm: new Date().toISOString(),
    total: Object.keys(ncms).length,
    fontes: {
      tec: { url: urlTec, registros: Object.keys(tec.registros).length },
      tipi: { url: URL_TIPI, registros: Object.keys(tipi.registros).length }
    },
    ncms
  };
}

async function carregar() {
  if (_tabela) return _tabela;
  try {
    const buf = await baixarArquivo(OBJETO);
    if (buf && buf.length) {
      _tabela = JSON.parse(buf.toString('utf8'));
      console.log(`✅ Tabela de alíquotas carregada: ${_tabela.total} NCMs (atualizada em ${_tabela.atualizadoEm}).`);
    }
  } catch (e) {
    console.warn('⚠️ Não foi possível ler a tabela de alíquotas guardada:', e.message);
  }
  return _tabela;
}

const diasDesdeAtualizacao = () =>
  _tabela && _tabela.atualizadoEm ? (Date.now() - new Date(_tabela.atualizadoEm).getTime()) / MS_POR_DIA : Infinity;

/** Baixa das fontes oficiais e guarda. `force` ignora o intervalo de 15 dias. */
async function atualizar(force = false) {
  if (_atualizando) return { ok: false, motivo: 'Atualização já em andamento.' };
  await carregar();
  if (!force && diasDesdeAtualizacao() < INTERVALO_DIAS) {
    return { ok: true, atualizou: false, motivo: `Tabela tem ${diasDesdeAtualizacao().toFixed(1)} dia(s) — dentro dos ${INTERVALO_DIAS}.` };
  }

  _atualizando = true;
  try {
    console.log('⏳ Atualizando alíquotas nas fontes oficiais (TEC e TIPI)…');
    const nova = await montarTabela();
    _tabela = nova;
    try {
      await enviarArquivo(OBJETO, Buffer.from(JSON.stringify(nova)), 'application/json');
    } catch (e) {
      console.warn('⚠️ Alíquotas atualizadas em memória, mas não foi possível gravá-las:', e.message);
    }
    console.log(`✅ Alíquotas atualizadas: ${nova.total} NCMs (TEC ${nova.fontes.tec.registros} · TIPI ${nova.fontes.tipi.registros}).`);
    return { ok: true, atualizou: true, total: nova.total, atualizadoEm: nova.atualizadoEm };
  } catch (e) {
    console.warn('⚠️ Falha ao atualizar as alíquotas:', e.message);
    return { ok: false, motivo: e.message };
  } finally {
    _atualizando = false;
  }
}

/** Alíquotas oficiais de uma NCM, ou null se a tabela ainda não tem o código. */
async function consultar(ncmRaw) {
  const ncm = soDigitos(ncmRaw);
  if (ncm.length !== 8) return null;
  await carregar();
  if (!_tabela || !_tabela.ncms) return null;
  const r = _tabela.ncms[ncm];
  if (!r) return null;
  return {
    ncm,
    ii: r.ii != null ? r.ii : null,
    ipi: r.ipi != null ? r.ipi : null,
    marcador: r.marcador || '',
    desc: r.desc || '',
    fonte: 'TEC (Gecex) e TIPI (Receita Federal)',
    atualizadoEm: _tabela.atualizadoEm
  };
}

const status = () => ({
  carregada: !!_tabela,
  total: _tabela ? _tabela.total : 0,
  atualizadoEm: _tabela ? _tabela.atualizadoEm : null,
  diasDesdeAtualizacao: _tabela ? +diasDesdeAtualizacao().toFixed(1) : null,
  intervaloDias: INTERVALO_DIAS,
  fontes: _tabela ? _tabela.fontes : null,
  atualizando: _atualizando
});

/** Verifica diariamente; só baixa quando passar dos 15 dias. */
function agendar() {
  const checar = () => atualizar(false).catch(() => {});
  setTimeout(checar, 20000);                 // logo após o boot, sem atrasar o start
  setInterval(checar, MS_POR_DIA);
}

module.exports = { atualizar, consultar, carregar, status, agendar, montarTabela, parseAliquota, INTERVALO_DIAS };
