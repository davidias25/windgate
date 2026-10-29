/* =====================================================================
   WindGate Hub 2.0 — emissão de NF-e (sem tela).

   Monta o JSON da Focus NFe a partir do banco: operação, cotação, Catálogo de
   NCM (ncmlib), cliente do CRM e DUIMP. Nenhum CFOP, CST ou alíquota mora no
   código: tudo vem da tabela de CENÁRIOS (editável pela diretoria em
   hubPainel._nfeCenarios e marcada "conferida" pelo contador), do ncmlib, da
   cotação ou da DUIMP, com a vigência de cada tributo por data
   (tributosNaData). Os valores da tabela abaixo são SUGESTÕES DE PARTIDA
   que o Pedro e a Gil precisam validar — a tela mostra "a validar" até lá.

   Nota com pendência não transmite. A função é pura: o servidor chama com o
   banco completo (o contador nunca recebe operações, cotações nem CRM).

   Mesmo formato de módulo do comex.js: roda no navegador (window.WG) e no
   Node (require), para ser testado.
   ===================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(Object.assign({}, require('./regras.js'), require('./comex.js')));
  else Object.assign(raiz.WG, fabrica(raiz.WG));
})(typeof self !== 'undefined' ? self : this, function (W) {
  /* Arredonda a 2 casas por item, sem o erro de ponto flutuante de 1,005. */
  const r2 = v => { const n = +v || 0; return (n < 0 ? -1 : 1) * Math.round(Math.abs(n) * 100 + 1e-7) / 100; };
  const num = v => { if (v == null || v === '') return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const t = String(v).trim(); const n = /,/.test(t) ? +t.replace(/\./g, '').replace(',', '.') : +t; return isFinite(n) ? n : 0; };
  const temNum = v => v != null && v !== '' && isFinite(num(v));
  const soDig = x => String(x || '').replace(/\D/g, '');
  const txt = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 500);
  const ehData = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  const HOMOLOGACAO_NOME = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';

  /* ---------- Cenários fiscais (sugestões de partida — VALIDAR) ----------
     Alíquota null = vem de outra fonte (NCM, cotação ou DUIMP). CFOP vazio =
     o contador ainda não definiu, e a nota fica pendente até ele definir. */
  const CENARIOS_PADRAO = [
    { k: 'A', nome: 'Entrada de importação', emitente: 'WindGate', destino: 'exportador', tipo_documento: 0, finalidade_emissao: 1,
      natureza_operacao: 'Compra para comercialização - importação', cfop_exterior: '3102', cfop_interna: '', cfop_interestadual: '',
      consumidor_final: 0, presenca_comprador: 9, modalidade_frete: 9,
      icms_origem: '1', icms_cst: '00', icms_aliquota: null, icms_aliquota_sem_beneficio: 19, icms_reducao_base: 0,
      ipi_cst: '00', ipi_enquadramento: '999', pis_cst: '50', cofins_cst: '50', pis_aliquota: null, cofins_aliquota: null, pis_cst_extinto: '08',
      ibs_cbs_cst: '', ibs_cbs_classificacao: '', difal: false, aplica_monofasico: false, exige_referencia: false, piso_saida: false,
      obs: 'Alíquota de ICMS: a da cotação (benefício de AL). Confirmar com a Gil o CST, a alíquota destacada e o texto do benefício em informações complementares. PIS, COFINS, Siscomex, AFRMM e ICMS vão em outras despesas.' },
    { k: 'B', nome: 'Saída na conta e ordem', emitente: 'WindGate', destino: 'adquirente', tipo_documento: 1, finalidade_emissao: 1,
      natureza_operacao: 'Saída de mercadoria importada por conta e ordem de terceiro', cfop_exterior: '', cfop_interna: '', cfop_interestadual: '',
      consumidor_final: 0, presenca_comprador: 9, modalidade_frete: 9,
      icms_origem: '1', icms_cst: '00', icms_aliquota_interna: 19, icms_aliquota_interestadual: 4, icms_reducao_base: 0,
      ipi_cst: '50', ipi_enquadramento: '999', pis_cst: '', cofins_cst: '', pis_aliquota: 0, cofins_aliquota: 0, pis_cst_extinto: '08',
      ibs_cbs_cst: '', ibs_cbs_classificacao: '', difal: false, aplica_monofasico: false, exige_referencia: true, piso_saida: false,
      obs: 'CFOP e CST de PIS/COFINS conforme orientação do contador (IN RFB 1.861/2018). Preço = custo de importação repassado; referencia a NF de entrada.' },
    { k: 'C', nome: 'Saída na encomenda', emitente: 'WindGate', destino: 'encomendante', tipo_documento: 1, finalidade_emissao: 1,
      natureza_operacao: 'Venda de mercadoria importada por encomenda', cfop_exterior: '', cfop_interna: '5102', cfop_interestadual: '6102',
      consumidor_final: 0, presenca_comprador: 9, modalidade_frete: 9,
      icms_origem: '1', icms_cst: '00', icms_aliquota_interna: 19, icms_aliquota_interestadual: 4, icms_reducao_base: 0,
      ipi_cst: '50', ipi_enquadramento: '999', pis_cst: '01', cofins_cst: '01', pis_aliquota: 1.65, cofins_aliquota: 7.65, pis_cst_extinto: '08',
      ibs_cbs_cst: '', ibs_cbs_classificacao: '', difal: false, aplica_monofasico: false, exige_referencia: false, piso_saida: false,
      obs: 'Venda de mercadoria importada ao encomendante predeterminado.' },
    { k: 'D', nome: 'Triangular: SF → JeT', emitente: 'WindGate', destino: 'jet', tipo_documento: 1, finalidade_emissao: 1,
      natureza_operacao: 'Venda de mercadoria importada', cfop_exterior: '', cfop_interna: '5102', cfop_interestadual: '6102',
      consumidor_final: 0, presenca_comprador: 9, modalidade_frete: 9,
      icms_origem: '1', icms_cst: '00', icms_aliquota_interna: 19, icms_aliquota_interestadual: 4, icms_reducao_base: 0,
      ipi_cst: '50', ipi_enquadramento: '999', pis_cst: '01', cofins_cst: '01', pis_aliquota: 1.65, cofins_aliquota: 7.65, pis_cst_extinto: '08',
      ibs_cbs_cst: '', ibs_cbs_classificacao: '', difal: false, aplica_monofasico: false, exige_referencia: false, piso_saida: true,
      obs: 'Origem 1 (importação direta), 4% interestadual (Res. Senado 13/2012). A NF não pode sair abaixo do piso: NF de entrada ÷ (1 − 4%).' },
    { k: 'E', nome: 'Triangular: JeT → cliente contribuinte', emitente: 'JeT', destino: 'cliente', tipo_documento: 1, finalidade_emissao: 1,
      natureza_operacao: 'Venda de mercadoria adquirida de terceiros', cfop_exterior: '', cfop_interna: '5102', cfop_interestadual: '6102',
      consumidor_final: 0, presenca_comprador: 9, modalidade_frete: 9,
      icms_origem: '2', icms_cst: '00', icms_aliquota_interna: 17, icms_aliquota_interestadual: 4, icms_reducao_base: 0,
      ipi_cst: '53', ipi_enquadramento: '999', pis_cst: '01', cofins_cst: '01', pis_aliquota: 1.65, cofins_aliquota: 7.65, pis_cst_extinto: '08', pis_cst_monofasico: '04',
      ibs_cbs_cst: '', ibs_cbs_classificacao: '', difal: false, aplica_monofasico: true, exige_referencia: false, piso_saida: false,
      obs: 'Origem 2 (estrangeira adquirida no mercado interno), 4% interestadual. PIS/COFINS da JeT (Lucro Real); CST 04 nos itens monofásicos. Confirmar o CST de IPI da JeT.' },
    { k: 'F', nome: 'JeT → consumidor final não contribuinte', emitente: 'JeT', destino: 'consumidor', tipo_documento: 1, finalidade_emissao: 1,
      natureza_operacao: 'Venda de mercadoria a não contribuinte', cfop_exterior: '', cfop_interna: '5102', cfop_interestadual: '6108',
      consumidor_final: 1, presenca_comprador: 9, modalidade_frete: 9,
      icms_origem: '2', icms_cst: '00', icms_aliquota_interna: 17, icms_aliquota_interestadual: 4, icms_reducao_base: 0,
      ipi_cst: '53', ipi_enquadramento: '999', pis_cst: '01', cofins_cst: '01', pis_aliquota: 1.65, cofins_aliquota: 7.65, pis_cst_extinto: '08', pis_cst_monofasico: '04',
      carga_5291: 8.8, fcp_destino: 0, ibs_cbs_cst: '', ibs_cbs_classificacao: '', difal: true, aplica_monofasico: true, exige_referencia: false, piso_saida: false,
      obs: 'Grupo DIFAL (EC 87/2015). Item com Convênio 52/91: base do destino reduzida para a carga de 8,8% (mesma conta da apuração triangular). CST 04 nos itens monofásicos. Confirmar FECOP do CE.' },
    { k: 'G', nome: 'Complementar, ajuste ou devolução', emitente: 'qualquer', destino: 'referenciada', tipo_documento: null, finalidade_emissao: 2,
      natureza_operacao: '', cfop_exterior: '', cfop_interna: '', cfop_interestadual: '',
      consumidor_final: null, presenca_comprador: 9, modalidade_frete: 9,
      exige_referencia: true, obs: 'Finalidade 2 (complementar), 3 (ajuste) ou 4 (devolução). Segue a tributação da nota original; o CFOP é informado na nota (conforme a original).' }
  ];
  /* Campos que a diretoria edita na tela (rótulo e tipo). */
  const CAMPOS_CENARIO = [
    ['natureza_operacao', 'Natureza da operação', 't'], ['cfop_exterior', 'CFOP exterior', 't'], ['cfop_interna', 'CFOP interno', 't'], ['cfop_interestadual', 'CFOP interestadual', 't'],
    ['icms_origem', 'Origem ICMS', 't'], ['icms_cst', 'CST ICMS', 't'], ['icms_aliquota', 'Alíquota ICMS importação (%)', 'n'], ['icms_aliquota_sem_beneficio', 'ICMS sem o benefício de AL (%)', 'n'],
    ['icms_aliquota_interna', 'ICMS interno (%)', 'n'], ['icms_aliquota_interestadual', 'ICMS interestadual (%)', 'n'], ['icms_reducao_base', 'Redução da base ICMS (%)', 'n'],
    ['ipi_cst', 'CST IPI', 't'], ['ipi_enquadramento', 'Enquadramento IPI', 't'], ['pis_cst', 'CST PIS', 't'], ['cofins_cst', 'CST COFINS', 't'],
    ['pis_aliquota', 'PIS (%)', 'n'], ['cofins_aliquota', 'COFINS (%)', 'n'], ['pis_cst_monofasico', 'CST PIS/COFINS monofásico', 't'], ['pis_cst_extinto', 'CST PIS/COFINS após 2026', 't'],
    ['carga_5291', 'Carga Convênio 52/91 (%)', 'n'], ['fcp_destino', 'FCP/FECOP destino (%)', 'n'], ['ibs_cbs_cst', 'CST IBS/CBS', 't'], ['ibs_cbs_classificacao', 'cClassTrib IBS/CBS', 't'],
    ['presenca_comprador', 'Presença do comprador', 'n'], ['modalidade_frete', 'Modalidade do frete', 'n'], ['obs', 'Observação', 't']
  ];

  /** Cenários valendo: o padrão com o que a diretoria editou por cima. */
  function cenarios(db) {
    const ed = (((db || {}).hubPainel || {})._nfeCenarios) || {};
    return CENARIOS_PADRAO.map(c => { const e = ed[c.k] || {}; return Object.assign({}, c, e.campos || {}, { k: c.k, emitente: c.emitente, destino: c.destino, conferido: e.conferido || null, editadoPor: e.editadoPor || '', editadoEm: e.editadoEm || '' }); });
  }
  const cenarioDe = (db, k) => cenarios(db).find(c => c.k === String(k || '').toUpperCase()) || null;

  /* ---------- Configuração ---------- */
  const CONFIG_PADRAO = {
    conferenciaCruzada: true, prazoCancelamentoHoras: 24,
    aliquotasInternas: { AL: 19, ES: 17, CE: 20 },
    empresas: { WindGate: { nome: 'SF Trading', uf: 'AL', cnpj: '58762606000144' }, JeT: { nome: 'JeT Import', uf: 'ES', cnpj: '' } }
  };
  function configNFe(db) {
    const c = (((db || {}).hubPainel || {})._nfeConfig) || {}, e = c.empresas || {};
    return Object.assign({}, CONFIG_PADRAO, c, {
      aliquotasInternas: Object.assign({}, CONFIG_PADRAO.aliquotasInternas, c.aliquotasInternas),
      empresas: { WindGate: Object.assign({}, CONFIG_PADRAO.empresas.WindGate, e.WindGate), JeT: Object.assign({}, CONFIG_PADRAO.empresas.JeT, e.JeT) }
    });
  }
  /** Dados da empresa do grupo: o CNPJ cadastrado no Fiscal vence o da configuração. */
  function empresaDados(db, emp) {
    const e = configNFe(db).empresas[emp] || {}, cnpjs = ((((db || {}).hubPainel || {})._fiscal) || {}).cnpjs || {};
    return Object.assign({}, e, { cnpj: soDig(cnpjs[emp] || e.cnpj) });
  }
  const nomeEmpresa = emp => emp === 'JeT' ? 'JeT Import' : 'SF Trading';

  /* conta e ordem → 2, encomenda → 3, própria → 1 (tpIntermedio da DI) */
  const FORMA_INTERMEDIO = { 'conta e ordem': 2, encomenda: 3 };
  const formaIntermedio = mod => FORMA_INTERMEDIO[mod] || 1;

  const STATUS_NFE = { rascunho: ['rascunho', 'info'], conferida: ['conferida', 'info'], enviada: ['enviada à SEFAZ', 'warn'], autorizada: ['autorizada', 'ok'], rejeitada: ['rejeitada', 'crit'], cancelada: ['cancelada', ''] };

  /* ---------- Fontes de dados da nota ---------- */
  const opDe = (db, id) => (db.ops || []).find(o => o && o.id === id) || null;
  function clienteDaOp(db, o) {
    if (!o) return null; const alvo = String(o.cliente || '').trim().toLowerCase(), cn = soDig(o.clienteCnpj);
    return (db.crm || []).find(c => c && ((cn && soDig(c.cnpj) === cn) || (alvo && [c.empresa, c.nome].some(x => String(x || '').trim().toLowerCase() === alvo)))) || null;
  }
  /** Nota de entrada (cenário A) da operação: a autorizada, senão a mais recente não cancelada. */
  function notaEntradaDaOp(db, opId) {
    const ns = (db.hubNFe || []).filter(n => n && n.op === opId && n.cenario === 'A' && n.status !== 'cancelada');
    return ns.find(n => n.status === 'autorizada') || ns.sort((a, b) => String(b.criadaEm || '').localeCompare(String(a.criadaEm || '')))[0] || null;
  }
  const destDeCliente = c => c ? { nome: c.empresa || c.nome || '', cnpj: soDig(c.cnpj), ie: c.ie || '', contribuinte: c.contribuinte, email: c.email || '', telefone: soDig(c.fone),
    logradouro: (c.end || {}).logradouro || '', numero: (c.end || {}).numero || '', bairro: (c.end || {}).bairro || '', municipio: (c.end || {}).cidade || '', codigo_municipio: (c.end || {}).codigoMunicipio || '', uf: (c.end || {}).uf || '', cep: soDig((c.end || {}).cep) } : {};
  /** Destinatário de partida: CRM, empresa do grupo ou exportador; completa com a última nota para o mesmo CNPJ. */
  function destinatarioBase(db, cen, o, ref) {
    let d = {};
    if (cen.destino === 'exportador') d = { nome: (o && (o.fornecedor || o.fabrica)) || '', pais: (o && o.paisOrigem) || '', codigo_pais: '', municipio: 'EXTERIOR', codigo_municipio: '9999999', logradouro: '', numero: 'S/N', bairro: '', estrangeiro: true };
    else if (cen.destino === 'jet') { const j = empresaDados(db, 'JeT'); d = Object.assign({ contribuinte: true }, j, { nome: j.razaoSocial || j.nome }); }
    else if (cen.destino === 'referenciada') d = Object.assign({}, ref && ref.entrada && ref.entrada.destinatario);
    else d = destDeCliente(clienteDaOp(db, o));
    const cn = soDig(d.cnpj);
    if (cn) {
      const ant = (db.hubNFe || []).filter(n => n && n.entrada && n.entrada.destinatario && soDig(n.entrada.destinatario.cnpj) === cn).sort((a, b) => String(b.criadaEm || '').localeCompare(String(a.criadaEm || '')))[0];
      if (ant) Object.entries(ant.entrada.destinatario).forEach(([k, v]) => { if ((d[k] == null || d[k] === '') && v != null && v !== '') d[k] = v; });
    }
    return d;
  }
  /** Alíquotas do item: Catálogo de NCM (conferido) vence a cotação. */
  function aliquotasItem(db, ncm, it) {
    const l = ((db.ncmlib || {})[soDig(ncm)]) || {}, pega = k => temNum(l[k]) ? num(l[k]) : temNum(it && it[k]) ? num(it[k]) : null;
    return { ii: pega('ii'), ipi: pega('ipi'), pis: pega('pis'), cofins: pega('cofins'), c5291: l.c5291 != null ? !!l.c5291 : !!(it && it.c5291), mono: l.mono != null ? !!l.mono : !!(it && it.mono), doCatalogo: !!(db.ncmlib || {})[soDig(ncm)] };
  }

  /**
   * Dados de partida de uma nota nova: itens, destinatário e DUIMP saídos da
   * operação, da cotação, do Catálogo e da última nota. A tela mostra e deixa
   * corrigir; montarNFe é quem decide o que falta.
   */
  function sugerirEntrada(db, a) {
    const cen = cenarioDe(db, a.cenario); if (!cen) return null;
    const o = opDe(db, a.opId), q = o ? W.cotacaoDaOp(db, o) : null, f = (q && q.fields) || {};
    const ref = a.referencia ? (db.hubNFe || []).find(n => n && n._id === a.referencia) : null;
    const empresa = cen.emitente === 'qualquer' ? (a.empresa || (ref && ref.empresa) || (o && o.empresa) || 'WindGate') : cen.emitente;
    const out = { cenario: cen.k, opId: a.opId || '', empresa, dataEmissao: W.soData(a.dataEmissao || W.hojeISO()), itens: [], destinatario: destinatarioBase(db, cen, o, ref), extras: {} };
    const qi = (q && Array.isArray(q.items) ? q.items : []).filter(Boolean);
    const txD = num(f.txDesp), txF = num(f.txFrete), pctInv = (f.pctInv === '' || f.pctInv == null ? 100 : num(f.pctInv)) / 100;
    const fobTot = qi.reduce((s, it) => s + num(it.q) * num(it.u) * txD, 0);
    const baseItem = (it, i) => { const al = aliquotasItem(db, it.ncm, it); return { codigo: it.codigo || ('IT' + (i + 1)), descricao: it.d || it.descricao || '', ncm: soDig(it.ncm), unidade: it.un || 'UN', quantidade: num(it.q),
      ii: al.ii, ipi: al.ipi, pis: al.pis, cofins: al.cofins, c5291: al.c5291, mono: al.mono }; };
    if (cen.k === 'A') {
      const frete = num(f.freteUSD) * txF, seg = num(f.seguro), cap = num(f.capatazia);
      out.itens = qi.map((it, i) => { const fob = num(it.q) * num(it.u) * txD, sh = fobTot > 0 ? fob / fobTot : 0, va = fob * pctInv + sh * (frete + seg + cap);
        return Object.assign(baseItem(it, i), { valorUnitario: num(it.q) ? +(va / num(it.q)).toFixed(10) : 0, adicao: { numero: 1, sequencial: i + 1, fabricante: (o && (o.fornecedor || o.fabrica)) || '' } }); });
      const sit = (o && o.duimpSituacao) || {};
      out.extras.duimp = { numero: (o && o.duimp) || '', data_registro: W.soData(sit.registro || ''), data_desembaraco: W.soData(sit.desembaraco || ''), local: (o && o.destinoPorto) || '', uf: (o && o.destinoUF) || '',
        via_transporte: 1, afrmm: num(f.afrmm), siscomex: num(f.siscomex), outras: 0, codigo_exportador: '', manual: !(o && o.duimpSituacao) };
      out.extras.icmsAliquota = temNum(f.icmsEnt) ? num(f.icmsEnt) : null;
    } else if (cen.k === 'G') {
      if (ref && ref.entrada) { out.itens = (ref.entrada.itens || []).map(x => Object.assign({}, x)); out.opId = ref.op || out.opId; }
      out.extras = { referencia: ref ? ref._id : '', finalidade: 2, cfop: '' };
    } else {
      const ent = notaEntradaDaOp(db, a.opId), itensEnt = ent && ent.payload ? ent.payload.items || [] : [];
      const inter = num(cen.icms_aliquota_interestadual) / 100;
      out.itens = qi.map((it, i) => {
        const b = baseItem(it, i), fob = num(it.q) * num(it.u) * txD, sh = fobTot > 0 ? fob / fobTot : 0;
        const totEnt = itensEnt[i] ? num(itensEnt[i].valor_bruto) + num(itensEnt[i].ipi_valor) + num(itensEnt[i].ii_valor) + num(itensEnt[i].valor_outras_despesas) : 0;
        let total = 0;
        if (cen.k === 'B') total = totEnt;
        else if (cen.k === 'D') total = totEnt && inter < 1 ? totEnt / (1 - inter) : 0;
        else total = num(q && q.preco) * sh;
        return Object.assign(b, { valorUnitario: b.quantidade ? +(total / b.quantidade).toFixed(10) : 0 });
      });
    }
    return out;
  }

  /* ---------- Montagem ---------- */
  const CST_ICMS_COM_VALOR = ['00', '10', '20', '51', '70', '90'];
  const CST_IPI_COM_VALOR = ['00', '49', '50', '99'];
  const CST_PIS_SEM_VALOR = ['04', '05', '06', '07', '08', '09'];
  const limpar = o => { Object.keys(o).forEach(k => { if (o[k] === '' || o[k] == null) delete o[k]; }); return o; };

  /**
   * Monta a nota no formato da Focus e diz o que falta.
   * a = { cenario, opId, empresa, itens, destinatario, dataEmissao, extras, ambiente }
   * Devolve { payload, pendencias[], avisos[], totais, empresa, cenario }.
   * Pendência bloqueia a transmissão; aviso só alerta.
   */
  function montarNFe(db, a) {
    const pend = [], avisos = [];
    const P = (campo, msg) => pend.push({ campo, msg }), A = msg => avisos.push(msg);
    const ex = (a && a.extras) || {};
    let cen = cenarioDe(db, a && a.cenario);
    if (!cen) return { payload: null, pendencias: [{ campo: 'cenario', msg: 'Cenário fiscal desconhecido.' }], avisos, totais: null };
    const cfg = configNFe(db), prod = a.ambiente === 'producao';
    const o = a.opId ? opDe(db, a.opId) : null;
    if (a.opId && !o) P('op', `Operação ${a.opId} não encontrada.`);
    if (!a.opId && cen.k !== 'G') P('op', 'Escolha a operação da nota.');

    /* Complementar/ajuste/devolução segue a tributação da nota original. */
    let refNota = null, chaveRef = '';
    if (cen.k === 'G') {
      refNota = ex.referencia ? (db.hubNFe || []).find(n => n && (n._id === ex.referencia || n.chave === soDig(ex.referencia))) : null;
      chaveRef = refNota ? refNota.chave || '' : soDig(ex.referencia).length === 44 ? soDig(ex.referencia) : '';
      const base = refNota ? cenarioDe(db, refNota.cenario) : null;
      if (base) cen = Object.assign({}, base, { k: 'G', nome: cen.nome, destino: base.destino, emitente: base.emitente, exige_referencia: true, conferido: cen.conferido, natureza_operacao: txt(ex.natureza) || cen.natureza_operacao || base.natureza_operacao, cfop_interna: '', cfop_interestadual: '', cfop_exterior: '' });
      if (!chaveRef) P('notas_referenciadas', 'Informe a nota original (chave de 44 dígitos ou uma NF-e autorizada do sistema).');
      if (!base) P('cenario', 'Sem a nota original do sistema, a tributação não tem de onde vir: escolha a NF-e original.');
    }
    if (prod && !(cen.conferido && cen.conferido.em)) P('cenario', `Cenário ${cen.k} ainda não foi conferido pelo contador: em produção só sai nota de cenário conferido.`);
    else if (!(cen.conferido && cen.conferido.em)) A(`Cenário ${cen.k} a validar pelo contador (CFOP, CST e alíquotas são sugestões).`);

    const data = ehData(a.dataEmissao) ? a.dataEmissao : W.soData(W.hojeISO());
    const t = W.tributosNaData(db, data);
    const empresa = cen.emitente === 'qualquer' || cen.k === 'G' ? (a.empresa || (refNota && refNota.empresa) || (o && o.empresa) || 'WindGate') : cen.emitente;
    if (a.empresa && cen.emitente !== 'qualquer' && cen.k !== 'G' && a.empresa !== cen.emitente) P('empresa', `O cenário ${cen.k} é emitido pela ${nomeEmpresa(cen.emitente)}.`);
    const emit = empresaDados(db, empresa);
    if (soDig(emit.cnpj).length !== 14) P('cnpj_emitente', `CNPJ da ${nomeEmpresa(empresa)} não cadastrado (Fiscal › Configurar).`);
    if (!emit.uf) P('uf_emitente', `UF da ${nomeEmpresa(empresa)} não cadastrada.`);

    /* ---- Destinatário ---- */
    const dest = Object.assign({}, destinatarioBase(db, cen, o, refNota), a.destinatario || {});
    const estrangeiro = cen.destino === 'exportador' || !!dest.estrangeiro;
    let indIE;
    if (estrangeiro || cen.destino === 'consumidor') indIE = 9;
    else if (dest.indicador_ie) indIE = +dest.indicador_ie;
    else if (dest.contribuinte === true) indIE = 1;
    else if (dest.contribuinte === false) indIE = 9;
    if (cen.destino === 'consumidor' && dest.contribuinte === true) P('destinatario', 'O cliente está marcado como contribuinte de ICMS no CRM: use o cenário E.');
    if (cen.destino === 'cliente' && dest.contribuinte === false) P('destinatario', 'O cliente está marcado como NÃO contribuinte no CRM: use o cenário F.');
    if (!indIE) P('indicador_inscricao_estadual_destinatario', 'Confirme se o destinatário é contribuinte de ICMS (cadastro do cliente no CRM).');
    if (!txt(dest.nome)) P('nome_destinatario', 'Nome do destinatário.');
    if (estrangeiro) {
      if (!txt(dest.pais)) P('pais_destinatario', 'País do exportador.');
      if (!soDig(dest.codigo_pais)) P('codigo_pais_destinatario', 'Código do país do exportador (tabela BACEN, ex.: 1600 China).');
      if (!txt(dest.logradouro)) P('logradouro_destinatario', 'Endereço do exportador.');
    } else {
      const doc = soDig(dest.cnpj || dest.cpf);
      if (doc.length !== 14 && doc.length !== 11) P('cnpj_destinatario', 'CNPJ (14 dígitos) ou CPF do destinatário.');
      if (indIE === 1 && !txt(dest.ie)) P('inscricao_estadual_destinatario', 'Inscrição estadual do destinatário contribuinte.');
      [['logradouro', 'Logradouro'], ['numero', 'Número'], ['bairro', 'Bairro'], ['municipio', 'Município']].forEach(([k, l]) => { if (!txt(dest[k])) P(k + '_destinatario', l + ' do destinatário.'); });
      if (soDig(dest.codigo_municipio).length !== 7) P('codigo_municipio_destinatario', 'Código IBGE do município do destinatário (7 dígitos).');
      if (!/^[A-Z]{2}$/.test(String(dest.uf || '').toUpperCase())) P('uf_destinatario', 'UF do destinatário.');
      if (soDig(dest.cep).length !== 8) P('cep_destinatario', 'CEP do destinatário (8 dígitos).');
    }
    const ufDest = String(dest.uf || '').toUpperCase();
    const localDestino = estrangeiro ? 3 : (ufDest && emit.uf && ufDest === String(emit.uf).toUpperCase() ? 1 : 2);

    /* ---- CFOP ---- */
    const cfopCen = localDestino === 3 ? cen.cfop_exterior : localDestino === 1 ? cen.cfop_interna : cen.cfop_interestadual;
    const cfopNota = cen.k === 'G' ? txt(ex.cfop) : txt(cfopCen);
    if (!/^\d{4}$/.test(cfopNota) && !(cen.k === 'G' && (a.itens || []).every(it => /^\d{4}$/.test(txt(it && it.cfop))))) P('cfop', cen.k === 'G' ? 'CFOP da nota (conforme a nota original).' : `CFOP ${localDestino === 1 ? 'interno' : localDestino === 2 ? 'interestadual' : 'de importação'} do cenário ${cen.k} não definido: o contador define em Cenários fiscais.`);

    /* ---- Modalidade (DI) ---- */
    const mod = (o && o.modalidade) || '';
    const fi = formaIntermedio(mod);
    let terceiro = null;
    if (cen.k === 'A' && fi !== 1) {
      const c = destDeCliente(clienteDaOp(db, o));
      terceiro = { cnpj: soDig(ex.terceiroCnpj || c.cnpj), uf: String(ex.terceiroUf || c.uf || '').toUpperCase() };
      if (terceiro.cnpj.length !== 14) P('documentos_importacao.cnpj', `CNPJ do ${fi === 2 ? 'adquirente' : 'encomendante'} (cadastro do cliente no CRM).`);
      if (!/^[A-Z]{2}$/.test(terceiro.uf)) P('documentos_importacao.uf_terceiro', `UF do ${fi === 2 ? 'adquirente' : 'encomendante'}.`);
    }
    if (cen.k === 'A' && !mod) A('Operação sem modalidade cadastrada: a nota vai como importação por conta própria (forma de intermediação 1).');

    /* ---- DUIMP (só na entrada) ---- */
    const du = Object.assign({}, ex.duimp || {});
    let duimpNum = '';
    if (cen.k === 'A') {
      duimpNum = String(du.numero || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (!duimpNum) P('documentos_importacao.numero', 'Número da DUIMP.');
      else if (duimpNum.length > 15) P('documentos_importacao.numero', `Número da DUIMP com ${duimpNum.length} caracteres: o campo da NF-e (nDI) aceita até 15.`);
      if (!ehData(du.data_registro)) P('documentos_importacao.data_registro', 'Data de registro da DUIMP.');
      if (!txt(du.local)) P('documentos_importacao.local_desembaraco_aduaneiro', 'Local do desembaraço.');
      if (!/^[A-Z]{2}$/.test(String(du.uf || '').toUpperCase())) P('documentos_importacao.uf_desembaraco_aduaneiro', 'UF do desembaraço.');
      if (!ehData(du.data_desembaraco)) P('documentos_importacao.data_desembaraco_aduaneiro', 'Data do desembaraço.');
      if ((+du.via_transporte || 1) === 1 && !(num(du.afrmm) > 0)) P('documentos_importacao.valor_afrmm', 'AFRMM: obrigatório no transporte marítimo.');
      if (du.manual) A('Dados da DUIMP digitados à mão: conferir com a DUIMP antes de transmitir.');
      A('Confira a base e o valor do ICMS de importação com a guia recolhida pelo despachante.');
    }

    /* ---- Referência ---- */
    const notasRef = [];
    if (cen.k === 'B') {
      const ent = notaEntradaDaOp(db, a.opId);
      if (ent && ent.status === 'autorizada' && ent.chave) notasRef.push({ chave_nfe: ent.chave });
      else P('notas_referenciadas', 'A saída na conta e ordem referencia a NF de entrada: autorize primeiro a NF de entrada (cenário A) desta operação.');
    }
    if (cen.k === 'G' && chaveRef) notasRef.push({ chave_nfe: chaveRef });

    /* ---- Tributos na data ---- */
    if (cen.k === 'A' || cen.k === 'D') { if (!t.beneficioAL) A('Sem o benefício de ICMS de Alagoas nesta data: ICMS pela alíquota sem benefício do cenário.'); }
    if (!t.ipi) A('IPI zerado nesta data (LC 214/2025).');
    if (!t.pisCofinsImp) A('PIS/COFINS extintos nesta data: vão com o CST de após 2026 do cenário, sem valor.');
    if (t.icmsFator < 1) A(`ICMS na transição: ${Math.round(t.icmsFator * 100)}% da alíquota (EC 132/2023). Revisar o cenário.`);
    const comIbsCbs = !!(txt(cen.ibs_cbs_cst) && txt(cen.ibs_cbs_classificacao));
    if (!comIbsCbs) { if (t.cbs.recolhe) P('ibs_cbs', 'Grupo IBS/CBS obrigatório nesta data: o contador define o CST e o cClassTrib no cenário.'); else A('Grupo IBS/CBS não informado (2026: informativo). O contador define o CST e o cClassTrib no cenário quando for exigido.'); }

    /* ---- Alíquotas de ICMS ---- */
    let aliqIcms = null;
    if (cen.k === 'A') {
      aliqIcms = t.beneficioAL ? (temNum(cen.icms_aliquota) ? num(cen.icms_aliquota) : temNum(ex.icmsAliquota) ? num(ex.icmsAliquota) : null) : (temNum(cen.icms_aliquota_sem_beneficio) ? num(cen.icms_aliquota_sem_beneficio) : null);
      if (aliqIcms == null) P('icms_aliquota', 'Alíquota do ICMS de importação: nem o cenário nem a cotação (ICMS de entrada) informam.');
    } else if (localDestino === 1) aliqIcms = temNum(cen.icms_aliquota_interna) ? num(cen.icms_aliquota_interna) : null;
    else aliqIcms = temNum(cen.icms_aliquota_interestadual) ? num(cen.icms_aliquota_interestadual) : null;
    if (aliqIcms == null && cen.k !== 'A' && CST_ICMS_COM_VALOR.includes(txt(cen.icms_cst))) P('icms_aliquota', `Alíquota de ICMS ${localDestino === 1 ? 'interna' : 'interestadual'} do cenário ${cen.k}.`);
    if (!txt(cen.icms_cst)) P('icms_situacao_tributaria', `CST de ICMS do cenário ${cen.k}.`);
    if (!txt(cen.pis_cst) || !txt(cen.cofins_cst)) P('pis_situacao_tributaria', `CST de PIS/COFINS do cenário ${cen.k} (definir com o contador).`);
    const difal = !!cen.difal && localDestino === 2 && (+cen.consumidor_final === 1);
    const interna = difal ? cfg.aliquotasInternas[ufDest] : null;
    if (difal && !temNum(interna)) P('icms_aliquota_interna_uf_destino', `Alíquota interna de ICMS de ${ufDest || '(UF vazia)'} não cadastrada (Configuração da NF-e). Não há valor padrão.`);

    /* ---- Itens ---- */
    const itens = Array.isArray(a.itens) ? a.itens.filter(Boolean) : [];
    if (!itens.length) P('items', 'A nota precisa de pelo menos um item.');
    const despTot = cen.k === 'A' ? num(du.siscomex) + num(du.afrmm) + num(du.outras) : 0;
    const vaTot = itens.reduce((s, it) => s + r2(num(it.quantidade) * num(it.valorUnitario)), 0);
    let despUsada = 0, afrmmUsado = 0, usouC5291 = false;
    const tot = { produtos: 0, ii: 0, ipi: 0, icms: 0, outras: 0, pis: 0, cofins: 0, difal: 0, fcp: 0, cbs: 0, ibs: 0, total: 0 };
    const items = itens.map((it, i) => {
      const n = i + 1, ncm = soDig(it.ncm), qtd = num(it.quantidade), vu = num(it.valorUnitario), ult = i === itens.length - 1;
      if (ncm.length !== 8) P(`items[${n}].codigo_ncm`, `NCM do item ${n} (8 dígitos).`);
      if (!txt(it.descricao)) P(`items[${n}].descricao`, `Descrição do item ${n}.`);
      if (!(qtd > 0)) P(`items[${n}].quantidade_comercial`, `Quantidade do item ${n}.`);
      if (!(vu > 0)) P(`items[${n}].valor_unitario_comercial`, `Valor unitário do item ${n}.`);
      const lib = (db.ncmlib || {})[ncm];
      if (lib) ['ii', 'ipi', 'pis', 'cofins'].forEach(k => { if (temNum(lib[k]) && temNum(it[k]) && Math.abs(num(lib[k]) - num(it[k])) > 0.001) A(`Item ${n}: ${k.toUpperCase()} de ${num(it[k])}% difere do Catálogo de NCM (${num(lib[k])}%).`); });
      const cfop = /^\d{4}$/.test(txt(it.cfop)) ? txt(it.cfop) : cfopNota;
      const V = r2(qtd * vu);
      const x = { numero_item: n, codigo_produto: txt(it.codigo, 60) || ('IT' + n), descricao: txt(it.descricao, 120), cfop, codigo_ncm: ncm, unidade_comercial: txt(it.unidade, 6) || 'UN', quantidade_comercial: qtd,
        valor_unitario_comercial: vu, unidade_tributavel: txt(it.unidade, 6) || 'UN', quantidade_tributavel: qtd, valor_unitario_tributavel: vu, valor_bruto: V, inclui_no_total: 1,
        icms_origem: txt(it.origem) || txt(cen.icms_origem), icms_situacao_tributaria: txt(cen.icms_cst) };
      const ipiAliq = t.ipi ? num(it.ipi) : 0;
      let II = 0, IPI = 0, PIS = 0, COF = 0, outras = 0, ICMS = 0;

      if (cen.k === 'A') {
        /* Entrada de importação: valor do produto = valor aduaneiro do item. */
        II = r2(V * num(it.ii) / 100);
        if (!temNum(it.ii)) P(`items[${n}].ii`, `Alíquota de II do item ${n} (Catálogo de NCM ou DUIMP).`);
        x.ii_base_calculo = V; x.ii_valor = II; x.ii_valor_iof = 0;
        const desp = ult ? r2(despTot - despUsada) : r2(vaTot > 0 ? despTot * V / vaTot : 0); despUsada = r2(despUsada + desp);
        x.ii_despesas_aduaneiras = desp;
        if (CST_IPI_COM_VALOR.includes(txt(cen.ipi_cst))) { IPI = r2((V + II) * ipiAliq / 100); Object.assign(x, { ipi_base_calculo: r2(V + II), ipi_aliquota: ipiAliq, ipi_valor: IPI }); }
        const pisA = temNum(cen.pis_aliquota) ? num(cen.pis_aliquota) : num(it.pis), cofA = temNum(cen.cofins_aliquota) ? num(cen.cofins_aliquota) : num(it.cofins);
        if (t.pisCofinsImp && !CST_PIS_SEM_VALOR.includes(txt(cen.pis_cst))) { PIS = r2(V * pisA / 100); COF = r2(V * cofA / 100); }
        const aliq = num(aliqIcms) / 100;
        if (CST_ICMS_COM_VALOR.includes(txt(cen.icms_cst)) && aliq < 1) {
          // ICMS "por dentro": integra a própria base (mesma regra da Nacionalização AL).
          const red = num(cen.icms_reducao_base) / 100;
          const baseIcms = r2((V + II + IPI + PIS + COF + desp) / (1 - aliq) * (1 - red));
          ICMS = r2(baseIcms * aliq);
          Object.assign(x, { icms_modalidade_base_calculo: 3, icms_base_calculo: baseIcms, icms_aliquota: num(aliqIcms), icms_valor: ICMS }, red ? { icms_reducao_base_calculo: num(cen.icms_reducao_base) } : {});
        }
        outras = r2(PIS + COF + desp + ICMS);
        x.valor_outras_despesas = outras;
        const ad = it.adicao || {};
        if (!(+ad.numero > 0)) P(`items[${n}].adicoes.numero`, `Número da adição (item da DUIMP) do item ${n}.`);
        if (!(+ad.sequencial > 0)) P(`items[${n}].adicoes.numero_sequencial_item`, `Sequencial do item ${n} na adição.`);
        if (!txt(ad.fabricante)) P(`items[${n}].adicoes.codigo_fabricante_estrangeiro`, `Fabricante estrangeiro do item ${n}.`);
        const afrmm = ult ? r2(num(du.afrmm) - afrmmUsado) : r2(vaTot > 0 ? num(du.afrmm) * V / vaTot : 0); afrmmUsado = r2(afrmmUsado + afrmm);
        x.documentos_importacao = [limpar({ numero: duimpNum, data_registro: du.data_registro, local_desembaraco_aduaneiro: txt(du.local, 60), uf_desembaraco_aduaneiro: String(du.uf || '').toUpperCase(),
          data_desembaraco_aduaneiro: du.data_desembaraco, via_transporte: +du.via_transporte || 1, valor_afrmm: afrmm, forma_intermedio: fi,
          cnpj: terceiro ? terceiro.cnpj : '', uf_terceiro: terceiro ? terceiro.uf : '', codigo_exportador: txt(du.codigo_exportador || dest.nome, 60),
          adicoes: [limpar({ numero: +ad.numero || '', numero_sequencial_item: +ad.sequencial || '', codigo_fabricante_estrangeiro: txt(ad.fabricante, 60) })] })];
      } else {
        /* Saídas: IPI por fora; ICMS sobre o valor (+ IPI para consumidor final). */
        if (CST_IPI_COM_VALOR.includes(txt(cen.ipi_cst))) { IPI = r2(V * ipiAliq / 100); Object.assign(x, { ipi_base_calculo: V, ipi_aliquota: ipiAliq, ipi_valor: IPI }); }
        if (CST_ICMS_COM_VALOR.includes(txt(cen.icms_cst)) && aliqIcms != null) {
          const red = num(cen.icms_reducao_base) / 100;
          const baseIcms = r2((V + (+cen.consumidor_final === 1 ? IPI : 0)) * (1 - red));
          ICMS = r2(baseIcms * num(aliqIcms) / 100);
          Object.assign(x, { icms_modalidade_base_calculo: 3, icms_base_calculo: baseIcms, icms_aliquota: num(aliqIcms), icms_valor: ICMS }, red ? { icms_reducao_base_calculo: num(cen.icms_reducao_base) } : {});
          if (difal && temNum(interna)) {
            const intN = num(interna), interN = num(aliqIcms), c5291 = !!it.c5291 && temNum(cen.carga_5291);
            if (c5291) usouC5291 = true;
            // Convênio 52/91: a base do destino é reduzida até a carga de 8,8% (base × carga ÷ interna);
            // o DIFAL é o ICMS do destino menos o destacado na origem.
            const baseDest = c5291 ? r2(baseIcms * num(cen.carga_5291) / intN) : baseIcms;
            const vDest = Math.max(0, r2(baseDest * intN / 100 - ICMS));
            const fcpP = num(cen.fcp_destino), fcp = fcpP ? r2(baseDest * fcpP / 100) : 0;
            Object.assign(x, { icms_base_calculo_uf_destino: baseDest, icms_aliquota_interna_uf_destino: intN, icms_aliquota_interestadual: interN, icms_percentual_partilha: 100, icms_valor_uf_destino: vDest, icms_valor_uf_remetente: 0 },
              fcpP ? { fcp_base_calculo_uf_destino: baseDest, fcp_percentual_uf_destino: fcpP, fcp_valor_uf_destino: fcp } : {});
            tot.difal = r2(tot.difal + vDest); tot.fcp = r2(tot.fcp + fcp);
          }
        }
        if (!(cen.aplica_monofasico && it.mono) && t.pisCofinsImp && !CST_PIS_SEM_VALOR.includes(txt(cen.pis_cst))) { PIS = r2(V * num(cen.pis_aliquota) / 100); COF = r2(V * num(cen.cofins_aliquota) / 100); }
      }
      if (cen.k === 'G' && ex.informacoesItem) x.informacoes_adicionais_item = txt(ex.informacoesItem, 500);

      /* PIS/COFINS: monofásico (CST 04), extinto (após 2026) ou pelo cenário. */
      const mono = cen.aplica_monofasico && it.mono;
      const pisCst = mono ? txt(cen.pis_cst_monofasico) || '04' : !t.pisCofinsImp ? txt(cen.pis_cst_extinto) || '08' : txt(cen.pis_cst);
      const cofCst = mono ? txt(cen.pis_cst_monofasico) || '04' : !t.pisCofinsImp ? txt(cen.pis_cst_extinto) || '08' : txt(cen.cofins_cst);
      x.pis_situacao_tributaria = pisCst; x.cofins_situacao_tributaria = cofCst;
      if (!CST_PIS_SEM_VALOR.includes(pisCst)) Object.assign(x, { pis_base_calculo: V, pis_aliquota_porcentual: cen.k === 'A' ? (temNum(cen.pis_aliquota) ? num(cen.pis_aliquota) : num(it.pis)) : num(cen.pis_aliquota), pis_valor: PIS });
      if (!CST_PIS_SEM_VALOR.includes(cofCst)) Object.assign(x, { cofins_base_calculo: V, cofins_aliquota_porcentual: cen.k === 'A' ? (temNum(cen.cofins_aliquota) ? num(cen.cofins_aliquota) : num(it.cofins)) : num(cen.cofins_aliquota), cofins_valor: COF });
      if (txt(cen.ipi_cst)) { x.ipi_situacao_tributaria = txt(cen.ipi_cst); x.ipi_codigo_enquadramento_legal = txt(cen.ipi_enquadramento) || '999'; }

      if (comIbsCbs) {
        const cbs = r2(V * t.cbs.aliq / 100), ibs = r2(V * t.ibs.aliq / 100);
        Object.assign(x, { ibs_cbs_situacao_tributaria: txt(cen.ibs_cbs_cst), ibs_cbs_classificacao_tributaria: txt(cen.ibs_cbs_classificacao), ibs_cbs_base_calculo: V,
          ibs_uf_aliquota: t.ibs.aliq, ibs_uf_valor: ibs, ibs_mun_aliquota: 0, ibs_mun_valor: 0, ibs_valor_total: ibs, cbs_aliquota: t.cbs.aliq, cbs_valor: cbs });
        tot.cbs = r2(tot.cbs + cbs); tot.ibs = r2(tot.ibs + ibs);
      }

      const totalItem = r2(V + II + IPI + outras);
      tot.produtos = r2(tot.produtos + V); tot.ii = r2(tot.ii + II); tot.ipi = r2(tot.ipi + IPI); tot.icms = r2(tot.icms + ICMS); tot.outras = r2(tot.outras + outras);
      tot.pis = r2(tot.pis + PIS); tot.cofins = r2(tot.cofins + COF); tot.total = r2(tot.total + totalItem);
      return x;
    });

    /* Trava do piso (triangular): sair abaixo do custo de entrada é vender no prejuízo. */
    if (cen.piso_saida) {
      const ent = notaEntradaDaOp(db, a.opId);
      if (!ent || !ent.totais) A('Sem NF de entrada da operação no sistema: não dá para conferir o piso da NF de saída.');
      else { const piso = r2(num(ent.totais.total) / (1 - num(cen.icms_aliquota_interestadual) / 100)); if (tot.produtos < piso - 0.005) P('piso', `NF de saída (R$ ${tot.produtos.toFixed(2)}) abaixo do piso de R$ ${piso.toFixed(2)} = NF de entrada ÷ (1 − ${num(cen.icms_aliquota_interestadual)}%).`); }
    }

    /* ---- Cabeçalho ---- */
    const infos = [];
    if (cen.k === 'A' && duimpNum) infos.push(`DUIMP ${duimpNum} de ${W.dataBR(du.data_registro)}.`);
    if (cen.k === 'A' && fi !== 1 && terceiro) infos.push(`Importação ${fi === 2 ? 'por conta e ordem do adquirente' : 'por encomenda do encomendante'} CNPJ ${terceiro.cnpj}.`);
    if (cen.k === 'B') { const c = destDeCliente(clienteDaOp(db, o)); infos.push(`Mercadoria importada por conta e ordem de ${c.nome || dest.nome}${o && o.duimp ? ', DUIMP ' + o.duimp : ''}.`); }
    if (usouC5291) infos.push('Base de cálculo do ICMS devido ao destino reduzida conforme Convênio ICMS 52/91.');
    if (txt(ex.informacoes)) infos.push(txt(ex.informacoes, 2000));
    const tipoDoc = cen.k === 'G' ? (ex.tipo_documento != null && ex.tipo_documento !== '' ? +ex.tipo_documento : refNota && refNota.payload ? +refNota.payload.tipo_documento : 1) : +cen.tipo_documento;
    const finalidade = cen.k === 'G' ? ([2, 3, 4].includes(+ex.finalidade) ? +ex.finalidade : 2) : +cen.finalidade_emissao;
    const consFinal = cen.k === 'G' ? (refNota && refNota.payload ? +refNota.payload.consumidor_final || 0 : 0) : +cen.consumidor_final || 0;
    const nomeDest = a.ambiente === 'homologacao' ? HOMOLOGACAO_NOME : txt(dest.nome, 60);
    const payload = limpar({
      natureza_operacao: txt(cen.natureza_operacao, 60) || 'Operação', data_emissao: data + 'T12:00:00-03:00', tipo_documento: tipoDoc, finalidade_emissao: finalidade,
      local_destino: localDestino, consumidor_final: consFinal, presenca_comprador: temNum(ex.presenca_comprador) ? +ex.presenca_comprador : +cen.presenca_comprador || 9,
      modalidade_frete: temNum(ex.modalidade_frete) ? +ex.modalidade_frete : (temNum(cen.modalidade_frete) ? +cen.modalidade_frete : 9),
      cnpj_emitente: soDig(emit.cnpj),
      nome_destinatario: nomeDest, cnpj_destinatario: estrangeiro ? '' : soDig(dest.cnpj).length === 14 ? soDig(dest.cnpj) : '', cpf_destinatario: !estrangeiro && soDig(dest.cpf || dest.cnpj).length === 11 ? soDig(dest.cpf || dest.cnpj) : '',
      inscricao_estadual_destinatario: indIE === 1 ? soDig(dest.ie) : '', indicador_inscricao_estadual_destinatario: indIE || '',
      logradouro_destinatario: txt(dest.logradouro, 60), numero_destinatario: txt(dest.numero, 60), complemento_destinatario: txt(dest.complemento, 60), bairro_destinatario: txt(dest.bairro, 60),
      municipio_destinatario: estrangeiro ? 'EXTERIOR' : txt(dest.municipio, 60), codigo_municipio_destinatario: estrangeiro ? '9999999' : soDig(dest.codigo_municipio),
      uf_destinatario: estrangeiro ? '' : ufDest, cep_destinatario: estrangeiro ? '' : soDig(dest.cep), pais_destinatario: estrangeiro ? txt(dest.pais, 60) : 'Brasil', codigo_pais_destinatario: estrangeiro ? soDig(dest.codigo_pais) : '1058',
      id_estrangeiro_destinatario: estrangeiro ? txt(dest.id_estrangeiro, 20) : '', telefone_destinatario: soDig(dest.telefone).slice(0, 14), email_destinatario: txt(dest.email, 60),
      informacoes_adicionais_contribuinte: infos.join(' ').slice(0, 5000),
      notas_referenciadas: notasRef.length ? notasRef : '', items
    });
    const somaItens = r2(items.reduce((s, x) => s + num(x.valor_bruto) + num(x.ii_valor) + num(x.ipi_valor) + num(x.valor_outras_despesas), 0));
    if (Math.abs(somaItens - tot.total) > 0.005) P('total', `Total da nota (R$ ${tot.total.toFixed(2)}) não bate com a soma dos itens (R$ ${somaItens.toFixed(2)}).`);
    return { payload, pendencias: pend, avisos, totais: Object.assign(tot, { somaItens }), empresa, cenario: cen.k, opId: a.opId || (refNota && refNota.op) || '',
      destinatario: { nome: txt(dest.nome, 60), cnpj: soDig(dest.cnpj || dest.cpf), uf: ufDest }, formaIntermedio: cen.k === 'A' ? fi : null };
  }

  /* ---------- Referência única e estável ---------- */
  const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  function refNFe(empresa, op, cenario, seq) { return ['wg', empresa === 'JeT' ? 'jet' : 'sf', slug(op) || 'avulsa', slug(cenario), seq].join('-'); }
  function proximaRef(db, empresa, op, cenario) {
    const pre = refNFe(empresa, op, cenario, '');
    const usados = new Set(); (db.hubNFe || []).forEach(n => { if (n) { if (n.ref) usados.add(n.ref); (n.refsAnteriores || []).forEach(r => usados.add(r)); } });
    let seq = 1; usados.forEach(r => { if (r.startsWith(pre)) { const s = +r.slice(pre.length); if (s >= seq) seq = s + 1; } });
    return refNFe(empresa, op, cenario, seq);
  }

  /* ---------- Quem pode o quê (o servidor confere de novo) ---------- */
  /**
   * acao: ver | montar | conferir | transmitir | cancelar | carta
   * Em produção com a conferência cruzada ligada, quem montou não confere nem transmite.
   */
  function podeAcao(db, k, nota, acao, ambiente) {
    const no = (codigo, msg) => ({ ok: false, codigo, msg }), sim = { ok: true };
    if (acao === 'ver') return W.pode(db, k, 'nfe.ver') ? sim : no(403, 'Sem acesso às NF-e.');
    if (!W.pode(db, k, 'nfe.emitir')) return no(403, 'Só o Davi e o contador emitem NF-e.');
    const prod = ambiente === 'producao', cruz = prod && configNFe(db).conferenciaCruzada !== false;
    const st = nota && nota.status;
    if (nota && (acao === 'transmitir' || acao === 'cancelar' || acao === 'carta' || acao === 'conferir') && nota.ambiente && nota.ambiente !== ambiente)
      return no(409, `Esta nota foi montada em ${nota.ambiente === 'producao' ? 'produção' : 'homologação'} e o sistema está em ${prod ? 'produção' : 'homologação'}. Monte de novo.`);
    if (acao === 'montar') return !nota || ['rascunho', 'conferida', 'rejeitada'].includes(st) ? sim : no(409, 'Nota já enviada: não dá para alterar. Cancele ou emita carta de correção.');
    if (acao === 'conferir') {
      if (st !== 'rascunho') return no(409, 'Só nota em rascunho é conferida.');
      if ((nota.pendencias || []).length) return no(409, 'Resolva as pendências antes de conferir.');
      if (cruz && nota.montadoPor === k) return no(409, 'Conferência cruzada: quem montou a nota não confere. Peça ao outro emissor (Davi ou Pedro).');
      return sim;
    }
    if (acao === 'transmitir') {
      if (st !== 'conferida') return no(409, st === 'rascunho' ? 'Confira a nota antes de transmitir.' : 'Esta nota não está pronta para transmitir.');
      if ((nota.pendencias || []).length) return no(409, 'A nota tem pendências.');
      if (cruz && nota.montadoPor === k) return no(409, 'Conferência cruzada: quem montou a nota não transmite. O outro emissor (Davi ou Pedro) confere e transmite.');
      return sim;
    }
    if (acao === 'cancelar' || acao === 'carta') return st === 'autorizada' ? sim : no(409, 'Só nota autorizada pode ser ' + (acao === 'cancelar' ? 'cancelada.' : 'corrigida.'));
    return no(400, 'Ação desconhecida.');
  }

  /* ---------- Retorno da Focus ---------- */
  const mensagemFocus = r => [r && r.mensagem_sefaz, ...((r && r.erros) || []).map(e => e && (e.mensagem + (e.campo ? ` (${e.campo})` : '')))].concat(r && !r.mensagem_sefaz && !(r.erros || []).length && r.mensagem ? [r.mensagem] : []).filter(Boolean).join(' · ');
  /** Aplica a resposta da consulta/emissão da Focus na nota. Devolve uma cópia. */
  function aplicarRetornoFocus(nota, r, agora, por) {
    const n = Object.assign({}, nota, { historico: (nota.historico || []).slice() }), em = agora || new Date().toISOString();
    if (!r || !r.status) return n;
    const msg = mensagemFocus(r), antes = n.status;
    n.statusFocus = r.status; if (r.status_sefaz) n.statusSefaz = String(r.status_sefaz); if (msg) n.mensagemSefaz = msg;
    if (r.status === 'processando_autorizacao') n.status = 'enviada';
    else if (r.status === 'autorizado') {
      n.status = 'autorizada'; n.chave = soDig(r.chave_nfe) || n.chave; n.numero = String(r.numero || n.numero || ''); n.serie = String(r.serie || n.serie || '');
      n.protocolo = String(r.protocolo || (r.protocolo_nota_fiscal && r.protocolo_nota_fiscal.numero_protocolo) || n.protocolo || '');
      n.caminhoXml = r.caminho_xml_nota_fiscal || n.caminhoXml || ''; n.caminhoDanfe = r.caminho_danfe || n.caminhoDanfe || ''; n.autorizadaEm = n.autorizadaEm || em;
    } else if (r.status === 'cancelado') { n.status = 'cancelada'; n.caminhoXmlCancelamento = r.caminho_xml_cancelamento || n.caminhoXmlCancelamento || ''; n.canceladaEm = n.canceladaEm || em; if (!n.chave && r.chave_nfe) n.chave = soDig(r.chave_nfe); }
    else if (r.status === 'erro_autorizacao') { n.status = 'rejeitada'; n.rejeitadaEm = em; }
    else if (r.status === 'denegado') { n.status = 'rejeitada'; n.denegada = true; n.refQueimado = true; n.rejeitadaEm = em; }
    if (n.status !== antes || msg) n.historico.push({ em, por: por || 'Focus NFe', acao: 'retorno', de: antes, para: n.status, msg: msg.slice(0, 500) });
    return n;
  }
  /** Payload na hora de enviar: data de emissão de agora (fuso de São Paulo). */
  function paraEnvio(payload, agora) {
    const d = new Date(agora || Date.now()), sp = new Date(d.getTime() - 3 * 3600 * 1000);
    return Object.assign({}, payload, { data_emissao: sp.toISOString().slice(0, 19) + '-03:00' });
  }

  return { CENARIOS_PADRAO, CAMPOS_CENARIO, cenarios, cenarioDe, CONFIG_PADRAO, configNFe, empresaDados, FORMA_INTERMEDIO, formaIntermedio, STATUS_NFE, HOMOLOGACAO_NOME,
    clienteDaOp, notaEntradaDaOp, aliquotasItem, sugerirEntrada, montarNFe, refNFe, proximaRef, podeAcao, aplicarRetornoFocus, mensagemFocus, paraEnvio, r2 };
});
