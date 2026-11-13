/**
 * Busca global do Hub (GET /api/search).
 *
 * O banco é um documento JSON na memória do servidor, não SQL: não há unaccent, pg_trgm nem GIN. O equivalente
 * aqui é um índice EM MEMÓRIA, montado a partir do banco e refeito quando o banco muda (cada gravação troca o
 * objeto do banco). Nada é gravado: o índice é derivado, os dados originais não mudam e registro excluído some
 * na hora, porque o índice só tem o que existe.
 *
 * Cada registro vira um texto sem acento e em minúsculas, com as variantes que a busca precisa: números sem
 * máscara (CNPJ, contêiner), valores em centavos e datas em dd/mm e dd/mm/aaaa. Erro de digitação leve: palavra
 * a até 1 letra de distância (2 nas palavras longas).
 *
 * Permissão: filtrada AQUI, por perfil e pelas abas liberadas da pessoa. Quem não acessa uma aba não recebe
 * resultado, contagem nem trecho dela. Custos e margens de cotação nunca entram no texto pesquisável.
 *
 * Para incluir uma aba nova: uma entrada em FONTES (lista, título, contexto, campos, data, link) e o tipo no
 * ACESSO dos perfis que podem ver.
 */
const W = Object.assign({}, require('../../public/hub/js/regras.js'), require('../../public/hub/js/comex.js'));

/* ---------- Normalização ---------- */
const semAcento = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soDig = s => String(s == null ? '' : s).replace(/\D/g, '');
const ehISO = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''));
const dataTextos = v => { if (!ehISO(v)) return ''; const [y, m, d] = String(v).slice(0, 10).split('-'); return `${d}/${m}/${y} ${d}/${m}`; };
/** Valor digitado: "1500", "1.500", "1.500,00", "1500,5", "R$ 1.500" → centavos. null se não parece valor. */
function valorDe(t) {
  let s = String(t || '').replace(/^r\$/i, '').trim();
  if (!/^\d[\d.,]*$/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s); return isFinite(n) ? Math.round(n * 100) : null;
}
/* Distância de edição até `max` (para erro de digitação leve). */
function perto(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let ant = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let min = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < min) min = cur[j]; }
    if (min > max) return false; ant = cur;
  }
  return ant[b.length] <= max;
}

/* ---------- Coleta de texto ---------- */
/* Chaves que não são texto do usuário: ids, links, arquivos, segredos, históricos técnicos. */
const FORA = /^(_id|_rev|id_?interno|pin|temPin|token|hash|link|url|caminho|caminhos|payload|xml|xmlLink|pdfLink|danfeLink|foto|fotos|base64|blob|retrato|duimpDados|historico|acessos|conferencias|_removidos|vistoEm|criadaEm|em|origem|auto)$/i;
const DINHEIRO_OP = /custo|margem|preco|preço|valor|spread|cambio|câmbio|resultado|lucro|markup|mkp|aliq|taxa|ptax/i;
function textos(x, fora, n, out) {
  if (n > 3 || x == null) return out;
  if (typeof x === 'string') { if (x.length < 400 && !/^data:/.test(x) && !/^https?:\/\//.test(x)) out.push(x); return out; }
  if (typeof x === 'number') { out.push(String(x)); return out; }
  if (Array.isArray(x)) { x.slice(0, 60).forEach(v => textos(v, fora, n + 1, out)); return out; }
  if (typeof x === 'object') Object.keys(x).forEach(k => { if (!FORA.test(k) && !(fora && fora.test(k))) textos(x[k], fora, n + 1, out); });
  return out;
}
const juntar = (...xs) => xs.flat(3).filter(v => v != null && v !== '').map(String);

/* ---------- Fontes (abas) ---------- */
const stOp = s => (W.stMeta ? W.stMeta(s).l : s);
const ST_COT = { draft: 'Rascunho', wait: 'Aguardando aprovação', ok: 'Aprovada' };
const faseCrm = k => ((W.CRM_FASES || []).find(f => f.k === k) || {}).l || k;
const FONTES = [
  { tipo: 'ops', aba: 'Operações', icone: '📦', lista: db => (db.ops || []).filter(Boolean),
    titulo: o => o.id, codigo: o => o.id, data: o => o.statusEm || o.criadaEm,
    contexto: o => juntar(o.id, o.cliente, stOp(o.status)).join(' · '),
    campos: (o, db) => { const q = W.cotacaoDaOp ? W.cotacaoDaOp(db, o) : null;
      return juntar(o.id, o.cliente, o.nome, o.mercadoria, o.fornecedor, o.fabrica, stOp(o.status), o.bl, o.booking, o.navio, o.armador, o.duimp, o.obs, o.prox, o.tracking,
        (o.containers || []).map(c => (c && typeof c === 'object' ? [c.numero, c.tipo] : c)), q ? (q.items || []).map(i => i && [i.d, i.ncm]) : [], textos(o, DINHEIRO_OP, 0, [])); },
    link: o => ({ tela: 'ficha', param: o.id }) },
  { tipo: 'cotacoes', aba: 'Cotações', icone: '🧾', lista: db => (db.qindex || []).filter(x => x && x.id).map(x => Object.assign({ _q: (db.quotes || {})[x.id] || {} }, x)),
    titulo: x => (x._q.fields || {}).opNum || x.label || x.id, codigo: x => (x._q.fields || {}).opNum || '', data: x => x.ts ? new Date(x.ts).toISOString() : '',
    contexto: x => juntar((x._q.fields || {}).opNum, x.cliente || (x._q.fields || {}).cliente, ST_COT[x.status] || x.status).join(' · '),
    /* Só o que não é custo: código, cliente, produto, status e itens (descrição e NCM). */
    campos: x => { const f = x._q.fields || {}; return juntar(x.label, x.cliente, f.opNum, f.cliente, f.mercadoria, f.destino, ST_COT[x.status] || x.status, (x._q.items || []).map(i => i && [i.d, i.ncm])); },
    link: x => ({ tela: 'cotacoes', param: x.id }) },
  { tipo: 'crm', aba: 'Clientes & CRM', icone: '👥', lista: db => (db.crm || []).filter(Boolean).map(c => Object.assign({ _t: 'cliente' }, c)).concat((db.crmOps || []).filter(Boolean).map(n => Object.assign({ _t: 'negocio' }, n))),
    titulo: x => x._t === 'cliente' ? (x.empresa || x.nome || '') : (x.titulo || x.clienteNome || 'Negócio'),
    data: x => x.atualizadoEm || x.criadoEm || x.em || '',
    contexto: x => x._t === 'cliente' ? juntar('Cliente', x.cnpj, [(x.end || {}).cidade, (x.end || {}).uf].filter(Boolean).join('/')).join(' · ') : juntar('Negócio', x.clienteNome, faseCrm(x.etapa || x.fase)).join(' · '),
    campos: (x, db, k) => x._t === 'cliente' ? juntar(textos(x, null, 0, []))
      : juntar(x.titulo, x.clienteNome, faseCrm(x.etapa || x.fase), x.obs, (x.atividades || []).map(a => a && a.texto), W.pode(db, k, 'crm.valores') && x.valor != null ? x.valor : null),
    link: () => ({ tela: 'crm', param: null }) },
  { tipo: 'fin', aba: 'Financeiro', icone: '💰', lista: db => (db.fin || []).filter(Boolean).concat((db.finRec || []).filter(Boolean).map(r => Object.assign({ _rec: true }, r))),
    titulo: l => l.desc || l.descCliente || 'Lançamento', valor: l => l.valor, data: l => l.liquidadoEm || l.vencimento || l.data,
    contexto: l => juntar(l.tipo || (l._rec ? 'Recorrente' : ''), l.op, l.contraparte, l.valor != null ? 'R$ ' + (+l.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '', l.vencimento ? W.dataBR(String(l.vencimento).slice(0, 10)) : '', l.status).join(' · '),
    campos: l => juntar(textos(l, null, 0, [])), datas: l => [l.data, l.vencimento, l.liquidadoEm],
    link: l => ({ tela: 'fin', param: null }) },
  { tipo: 'tarefas', aba: 'Tarefas', icone: '✅', lista: db => (db.agendaTasks || []).filter(Boolean),
    titulo: t => t.t || 'Tarefa', data: t => t.prazo || t.criadaEm, datas: t => [t.prazo],
    contexto: t => juntar(t.resp, t.opId, t.prazo ? 'prazo ' + W.dataBR(t.prazo) : '', t.status === 'feita' ? 'concluída' : t.status === 'travada' ? 'travada' : 'em aberto').join(' · '),
    campos: t => juntar(t.t, t.obs, t.resp, t.opId, t.status === 'feita' ? 'concluida feita' : 'aberta em aberto', (t.subs || []).map(s => s && s.t), t.copia),
    link: () => ({ tela: 'agenda', param: null }) },
  { tipo: 'fretes', aba: 'Fretes', icone: '🚢', lista: db => (db.fretes || []).filter(Boolean),
    titulo: f => juntar(f.agente || f.armador || f.contato, f.rota).join(' · ') || 'Frete', data: f => f.data, valor: f => f.valor, datas: f => [f.data],
    contexto: f => juntar(f.rota, f.booking, f.resp).join(' · '), campos: f => juntar(textos(f, null, 0, [])), link: () => ({ tela: 'frete', param: null }) },
  { tipo: 'docs', aba: 'Documentos', icone: '📄', lista: db => (db.docs || []).filter(d => d && !d.substituidoPor && !d.removidoEm).map(d => Object.assign({ _t: 'doc' }, d)).concat((db.crmDocs || []).filter(d => d && !d.removidoEm).map(d => Object.assign({ _t: 'crm' }, d))),
    titulo: d => d.nome || d.cat || 'Documento', data: d => d.dataUpload || d.data || '',
    contexto: d => juntar(d._t === 'crm' ? 'CRM' : d.op, d.tipo || (W.docTipoMeta && W.tipoDoc ? W.docTipoMeta(W.tipoDoc(d)).l : d.cat), d.por || d.enviadoPor).join(' · '),
    campos: d => juntar(d.nome, d.cat, d.tipo, d.op, d.obs, d.por, d.enviadoPor, W.docTipoMeta && W.tipoDoc && d._t === 'doc' ? W.docTipoMeta(W.tipoDoc(d)).l : ''),
    /* Documento restrito (câmbio, contratos) só para quem vê o financeiro. */
    restrito: (d, db, k) => d._t === 'doc' && W.docTipoMeta && W.tipoDoc && W.docTipoMeta(W.tipoDoc(d)).restrito && !W.pode(db, k, 'fin.ver'),
    link: d => ({ tela: 'docs', param: d.op || null }) },
  { tipo: 'notas', aba: 'Notas fiscais & extratos', icone: '🧮', lista: db => (db.hubNotas || []).filter(Boolean).map(n => Object.assign({ _t: 'nota' }, n))
      .concat((db.hubNFe || []).filter(Boolean).map(n => Object.assign({ _t: 'nfe' }, n))).concat((db.hubExtratos || []).filter(Boolean).map(e => Object.assign({ _t: 'extrato' }, e))),
    titulo: n => n._t === 'extrato' ? `Extrato ${n.banco || ''} ${n.mes || ''}`.trim() : n._t === 'nfe' ? `NF-e ${n.numero || n.ref || ''}` : `NF ${n.numero || ''}`.trim(),
    codigo: n => n.numero || '', valor: n => n._t === 'nfe' ? (n.totais || {}).total : n.valor, data: n => n.data || n.autorizadaEm || n.criadaEm || (n.mes ? n.mes + '-01' : ''),
    contexto: n => n._t === 'extrato' ? juntar(n.contaNome, n.formato).join(' · ') : juntar(n.op, n._t === 'nfe' ? (n.destinatario || {}).nome : (n.emitente || n.destinatario), n.status).join(' · '),
    campos: n => n._t === 'extrato' ? juntar(n.banco, n.contaNome, n.mes, (n.transacoes || []).slice(0, 400).map(t => t && [t.memo, t.valor])) : n._t === 'nfe' ? juntar(n.ref, n.numero, n.chave, n.op, n.cenario, n.status, (n.destinatario || {}).nome, (n.destinatario || {}).cnpj, (n.totais || {}).total)
      : juntar(textos(n, null, 0, [])),
    link: n => n._t === 'nfe' ? { tela: 'nfe', param: 'n:' + n._id } : { tela: 'fiscal', param: null } },
  { tipo: 'sourcing', aba: 'Sourcing', icone: '🏭', lista: db => (db.hubFornecedores || []).filter(Boolean).concat((db.fornecedores || []).filter(Boolean)),
    titulo: f => f.nome || f.empresa || 'Fornecedor', data: f => f.atualizadoEm || f.em || '',
    contexto: f => juntar(f.cidade, f.provincia, f.produtos || f.produto, f.contato).join(' · '), campos: f => juntar(textos(f, /cotacoes|preco|preço|custo/i, 0, [])), link: () => ({ tela: 'sourcing', param: null }) }
];

/* ---------- Quem vê o quê ---------- */
/* Perfil → abas na busca. Somado às capacidades e às abas liberadas da pessoa (users[k].tabs). */
const ACESSO = {
  diretoria: ['ops', 'cotacoes', 'crm', 'fin', 'tarefas', 'fretes', 'docs', 'notas', 'sourcing'],
  operacoes: ['ops', 'cotacoes', 'crm', 'fin', 'tarefas', 'fretes', 'docs', 'notas', 'sourcing'],
  frete: ['ops', 'tarefas', 'fretes', 'fin', 'sourcing'],
  documentos: ['ops', 'crm', 'docs', 'tarefas', 'sourcing'],
  contador: ['notas'],
  rh: ['tarefas']
};
const CAP = { fin: 'fin.ver', cotacoes: 'fin.resultado', crm: 'crm.ver', sourcing: 'sourcing.ver' };
const ABA_LEGADA = { cotacoes: 'cotacoes', fretes: 'frete' };
function tiposPermitidos(db, k) {
  if (k === '(sem-auth)') return FONTES.map(f => f.tipo);
  if (!k || !(db.users || {})[k]) return [];
  const p = W.perfilDe(db, k), tabs = (db.users[k] || {}).tabs;
  return (ACESSO[p.id] || []).filter(t => (!CAP[t] || W.pode(db, k, CAP[t])) && !(ABA_LEGADA[t] && Array.isArray(tabs) && !tabs.includes(ABA_LEGADA[t])));
}

/* ---------- Índice (refeito quando o banco muda) ---------- */
let cache = { db: null, assinatura: '', itens: null };
const assinatura = db => FONTES.map(f => { try { return f.lista(db).length; } catch (e) { return 0; } }).join(',') + '|' + Object.keys(db._removidos || {}).length;
function indice(db, k) {
  /* Itens por fonte; o texto depende do usuário só no CRM (valor do negócio), por isso guardamos o campo cru e
     montamos o texto pesquisável sem ele, e o valor à parte. */
  const sig = assinatura(db);
  if (cache.db === db && cache.assinatura === sig && cache.itens) return cache.itens;
  const itens = [];
  FONTES.forEach(f => {
    let lista = []; try { lista = f.lista(db); } catch (e) { lista = []; }
    lista.forEach(r => {
      const datas = [f.data(r)].concat(f.datas ? f.datas(r) : []).filter(ehISO);
      const titulo = String(f.titulo(r) || ''), codigo = f.codigo ? String(f.codigo(r) || '') : '';
      itens.push({ f, r, titulo, codigo, tituloN: semAcento(titulo), codigoN: semAcento(codigo), data: String(f.data(r) || ''), datasTxt: datas.map(dataTextos).join(' '),
        valor: f.valor && f.valor(r) != null && isFinite(+f.valor(r)) ? Math.round(+f.valor(r) * 100) : null, contexto: String(f.contexto(r) || ''), _txt: null });
    });
  });
  cache = { db, assinatura: sig, itens };
  return itens;
}
function textoDe(it, db, k) {
  const chave = it.f.tipo === 'crm' ? k : '';
  if (it._txt && it._txtK === chave) return it._txt;
  const campos = it.f.campos(it.r, db, k);
  const base = semAcento(campos.join(' ') + ' ' + it.contexto + ' ' + it.datasTxt);
  const dig = campos.map(soDig).filter(d => d.length >= 4).join(' ');
  const valores = new Set(campos.map(valorDe).filter(v => v != null)); if (it.valor != null) valores.add(it.valor);
  it._txt = { base, dig, valores, palavras: null }; it._txtK = chave;
  return it._txt;
}

/* ---------- Pontuação ---------- */
const PERIODOS = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
/* Palavras de ligação não ajudam a achar nada ("Ligar para a fábrica" casaria com tudo); só contam quando são a busca inteira. */
const LIGACAO = new Set(['a', 'o', 'e', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'para', 'pra', 'por', 'com', 'um', 'uma', 'ao', 'que']);
function termosDe(q) { const ts = semAcento(q).split(/\s+/).map(t => t.trim()).filter(Boolean); const uteis = ts.filter(t => t.length >= 2 && !LIGACAO.has(t)); return (uteis.length ? uteis : ts).slice(0, 8); }
function pontuar(it, termos, db, k) {
  const tx = textoDe(it, db, k); let total = 0, batidos = 0; const ok = [];
  termos.forEach(t => {
    let p = 0;
    const codigo = it.codigoN || (it.f.tipo === 'ops' ? it.tituloN : '');
    if (codigo && (codigo === t || codigo.startsWith(t + '.'))) p = 120;            // OP227 → mãe e filhas
    else if (it.tituloN === t) p = 100;
    else if (it.tituloN.startsWith(t) || it.tituloN.includes(' ' + t)) p = 60;
    else if (it.tituloN.includes(t)) p = 45;
    else if (tx.base.includes(t)) p = 25;
    if (!p) { const d = soDig(t); if (d.length >= 5 && tx.dig.includes(d)) p = 25; }
    if (!p) { const v = valorDe(t); if (v != null && /\d/.test(t) && tx.valores.has(v)) p = 30; }
    if (!p && t.length >= 4 && /^[a-z]+$/.test(t)) {
      if (!tx.palavras) tx.palavras = [...new Set(tx.base.split(/[^a-z0-9]+/).filter(w => w.length >= 3))];
      const max = t.length >= 8 ? 2 : 1;
      if (tx.palavras.some(w => (w[0] === t[0] || w[1] === t[1]) && perto(t, w.length > t.length + max ? w.slice(0, t.length) : w, max))) p = 8;
    }
    if (p) { batidos++; total += p; ok.push(t); }
  });
  return batidos ? { score: batidos * 1000 + total, batidos, termos: ok } : null;
}
/* Trecho com o termo: o campo de texto onde ele aparece. */
function trechoDe(it, termos, db, k) {
  const campos = it.f.campos(it.r, db, k).filter(c => typeof c === 'string' && c.length > 2);
  for (const t of termos) {
    const c = campos.find(x => semAcento(x).includes(t) && semAcento(x) !== it.tituloN && semAcento(x).length > t.length);
    if (c) { const i = semAcento(c).indexOf(t), ini = Math.max(0, i - 40); return (ini ? '…' : '') + c.slice(ini, i + t.length + 60) + (i + t.length + 60 < c.length ? '…' : ''); }
  }
  return '';
}

/**
 * Busca. { q, tipo, periodo, pagina, porGrupo } → { grupos: [{ tipo, aba, icone, total, itens }], total, ms }.
 * Só aparecem os grupos que a pessoa pode ver; os demais nem são contados.
 */
function buscar(db, k, opcoes) {
  const t0 = Date.now(), o = opcoes || {}, q = String(o.q || '').trim();
  const permitidos = tiposPermitidos(db, k);
  if (q.length < 2 || !permitidos.length) return { grupos: [], total: 0, ms: Date.now() - t0, permitidos };
  const termos = termosDe(q), tipos = o.tipo ? permitidos.filter(t => t === o.tipo) : permitidos;
  const dias = PERIODOS[o.periodo], desde = dias ? new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10) : '';
  const porGrupo = Math.max(1, Math.min(+o.porGrupo || (o.tipo ? 20 : 5), 50)), pagina = Math.max(1, +o.pagina || 1);
  const achados = {};
  indice(db, k).forEach(it => {
    if (!tipos.includes(it.f.tipo)) return;
    if (desde && !(ehISO(it.data) && it.data.slice(0, 10) >= desde)) return;
    if (it.f.restrito && it.f.restrito(it.r, db, k)) return;
    const p = pontuar(it, termos, db, k); if (!p) return;
    (achados[it.f.tipo] = achados[it.f.tipo] || []).push({ it, p });
  });
  const grupos = FONTES.filter(f => achados[f.tipo]).map(f => {
    const l = achados[f.tipo].sort((a, b) => b.p.score - a.p.score || String(b.it.data).localeCompare(String(a.it.data)));
    const fatia = l.slice((pagina - 1) * porGrupo, pagina * porGrupo);
    return { tipo: f.tipo, aba: f.aba, icone: f.icone, total: l.length, pagina, paginas: Math.ceil(l.length / porGrupo),
      itens: fatia.map(({ it, p }) => ({ tipo: f.tipo, id: it.r._id || it.r.id || '', titulo: it.titulo, contexto: it.contexto, trecho: trechoDe(it, p.termos, db, k), data: it.data.slice(0, 10), link: f.link(it.r), score: p.score, termos: p.termos })) };
  }).sort((a, b) => (b.itens[0] ? b.itens[0].score : 0) - (a.itens[0] ? a.itens[0].score : 0));
  return { grupos, total: grupos.reduce((s, g) => s + g.total, 0), ms: Date.now() - t0, termos, permitidos };
}

module.exports = { buscar, tiposPermitidos, FONTES, ACESSO, semAcento, valorDe, _limparCache: () => { cache = { db: null, assinatura: '', itens: null }; } };
