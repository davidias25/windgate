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
      natureza_operacao: 'IMPORTACAO', cfop_exterior: '3102', cfop_interna: '', cfop_interestadual: '',
      consumidor_final: 0, presenca_comprador: 9, modalidade_frete: 0,
      icms_origem: '1', icms_cst: '51', icms_aliquota: null, icms_aliquota_sem_beneficio: 19, icms_reducao_base: 0,
      ipi_cst: '00', ipi_enquadramento: '999', pis_cst: '50', cofins_cst: '50', pis_aliquota: null, cofins_aliquota: null, pis_cst_extinto: '08',
      ibs_cbs_cst: '000', ibs_cbs_classificacao: '000001', difal: false, aplica_monofasico: false, exige_referencia: false, piso_saida: false,
      /* Nota de entrada nasce da DUIMP. Composição do valor do produto e de "outras
         despesas": escolha do contador (Pedro) — os padrões abaixo são sugestão. */
      /* Padrão da NF de entrada do Maino (NF 88): produto = mercadoria, frete no item, ICMS CST 51
         zerado (o benefício de AL fica como custo à parte), IBS/CBS CST 000 / cClassTrib 000001. */
      a_vprod: 'mercadoria', a_tributo_valor: 'devido', a_icms_modo: 'zero',
      // NF 82 do Maino: total = produtos + frete + seguro + II + IPI + outras + PIS + COFINS + AFRMM (97.390,84).
      a_total_soma: 'pis,cofins,afrmm', a_volume_especie: 'UNIDADES',
      a_outras_pis_cofins: false, a_outras_siscomex: true, a_outras_afrmm: false, a_outras_icms: false, a_icms_base_despesas: true,
      obs: 'Nasce da DUIMP importada, no padrão da NF de entrada do Maino: valor do produto = mercadoria, frete e seguro no item, ICMS CST 51 zerado (benefício de AL como custo à parte), IBS/CBS CST 000 / cClassTrib 000001. Outras despesas = Taxa Siscomex: conferir com o XML da NF 88.' },
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
      ipi_cst: '50', ipi_enquadramento: '999', pis_cst: '01', cofins_cst: '01', pis_aliquota: 1.65, cofins_aliquota: 7.6, pis_cofins_exclui_icms: true, pis_cst_extinto: '08',
      ibs_cbs_cst: '', ibs_cbs_classificacao: '', difal: false, aplica_monofasico: false, exige_referencia: false, piso_saida: false,
      obs: 'Venda de mercadoria importada ao encomendante predeterminado.' },
    { k: 'D', nome: 'Triangular: SF → JeT', emitente: 'WindGate', destino: 'jet', tipo_documento: 1, finalidade_emissao: 1,
      natureza_operacao: 'Venda de mercadoria importada', cfop_exterior: '', cfop_interna: '5102', cfop_interestadual: '6102',
      consumidor_final: 0, presenca_comprador: 9, modalidade_frete: 9,
      icms_origem: '1', icms_cst: '00', icms_aliquota_interna: 19, icms_aliquota_interestadual: 4, icms_reducao_base: 0,
      ipi_cst: '50', ipi_enquadramento: '999', pis_cst: '01', cofins_cst: '01', pis_aliquota: 1.65, cofins_aliquota: 7.6, pis_cofins_exclui_icms: true, pis_cst_extinto: '08',
      ibs_cbs_cst: '', ibs_cbs_classificacao: '', difal: false, aplica_monofasico: false, exige_referencia: false, piso_saida: true,
      obs: 'Origem 1 (importação direta), 4% interestadual (Res. Senado 13/2012). A NF não pode sair abaixo do piso: NF de entrada ÷ (1 − 4%).' },
    { k: 'E', nome: 'Triangular: JeT → cliente contribuinte', emitente: 'JeT', destino: 'cliente', tipo_documento: 1, finalidade_emissao: 1,
      natureza_operacao: 'Venda de mercadoria adquirida de terceiros', cfop_exterior: '', cfop_interna: '5102', cfop_interestadual: '6102',
      consumidor_final: 0, presenca_comprador: 9, modalidade_frete: 9,
      icms_origem: '2', icms_cst: '00', icms_aliquota_interna: 17, icms_aliquota_interestadual: 4, icms_reducao_base: 0,
      ipi_cst: '53', ipi_enquadramento: '999', pis_cst: '01', cofins_cst: '01', pis_aliquota: 1.65, cofins_aliquota: 7.6, pis_cofins_exclui_icms: true, pis_cst_extinto: '08', pis_cst_monofasico: '04',
      ibs_cbs_cst: '', ibs_cbs_classificacao: '', difal: false, aplica_monofasico: true, exige_referencia: false, piso_saida: false,
      obs: 'Origem 2 (estrangeira adquirida no mercado interno), 4% interestadual. PIS/COFINS da JeT (Lucro Real); CST 04 nos itens monofásicos. Confirmar o CST de IPI da JeT.' },
    { k: 'F', nome: 'JeT → consumidor final não contribuinte', emitente: 'JeT', destino: 'consumidor', tipo_documento: 1, finalidade_emissao: 1,
      natureza_operacao: 'Venda de mercadoria a não contribuinte', cfop_exterior: '', cfop_interna: '5102', cfop_interestadual: '6108',
      consumidor_final: 1, presenca_comprador: 9, modalidade_frete: 9,
      icms_origem: '2', icms_cst: '00', icms_aliquota_interna: 17, icms_aliquota_interestadual: 4, icms_reducao_base: 0,
      ipi_cst: '53', ipi_enquadramento: '999', pis_cst: '01', cofins_cst: '01', pis_aliquota: 1.65, cofins_aliquota: 7.6, pis_cofins_exclui_icms: true, pis_cst_extinto: '08', pis_cst_monofasico: '04',
      carga_5291: 8.8, fcp_destino: 0, ibs_cbs_cst: '', ibs_cbs_classificacao: '', difal: true, aplica_monofasico: true, exige_referencia: false, piso_saida: false,
      obs: 'Grupo DIFAL (EC 87/2015). Item com Convênio 52/91: base do destino reduzida para a carga de 8,8% (mesma conta da apuração triangular). CST 04 nos itens monofásicos. Confirmar FECOP do CE.' },
    { k: 'H', nome: 'Venda direta: SF → cliente contribuinte', emitente: 'WindGate', destino: 'cliente', tipo_documento: 1, finalidade_emissao: 1,
      natureza_operacao: 'Venda de mercadoria importada', cfop_exterior: '', cfop_interna: '5102', cfop_interestadual: '6102',
      consumidor_final: 0, presenca_comprador: 9, modalidade_frete: 9,
      icms_origem: '1', icms_cst: '00', icms_aliquota_interna: 19, icms_aliquota_interestadual: 4, icms_reducao_base: 0,
      ipi_cst: '50', ipi_enquadramento: '999', pis_cst: '01', cofins_cst: '01', pis_aliquota: 1.65, cofins_aliquota: 7.6, pis_cofins_exclui_icms: true, pis_cst_extinto: '08',
      ibs_cbs_cst: '', ibs_cbs_classificacao: '', difal: false, aplica_monofasico: false, exige_referencia: false, piso_saida: false,
      obs: 'Venda da SF (AL) direto à empresa do cliente, contribuinte de ICMS, sem passar pela JeT. Origem 1, 4% interestadual (Res. Senado 13/2012). Valor = preço da cotação sem o DIFAL, que o cliente recolhe em guia própria. Cliente não contribuinte: use a triangular (D e F).' },
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
    ['presenca_comprador', 'Presença do comprador', 'n'], ['modalidade_frete', 'Modalidade do frete', 'n'],
    ['pis_cofins_exclui_icms', 'Saída: PIS/COFINS sobre o valor sem o ICMS', 'b'], ['a_icms_modo', 'Entrada: ICMS (zero | calculado)', 't'],
    ['a_total_soma', 'Entrada: somar ao total da nota (pis, cofins, afrmm, icms)', 't'], ['a_volume_especie', 'Entrada: espécie dos volumes', 't'],
    ['a_vprod', 'Entrada: valor do produto (aduaneiro | mercadoria)', 't'], ['a_tributo_valor', 'Entrada: tributo federal (devido | aRecolher)', 't'],
    ['a_outras_pis_cofins', 'Entrada: PIS/COFINS em outras despesas', 'b'], ['a_outras_siscomex', 'Entrada: Siscomex em outras despesas', 'b'], ['a_outras_afrmm', 'Entrada: AFRMM em outras despesas', 'b'],
    ['a_outras_icms', 'Entrada: ICMS em outras despesas', 'b'], ['a_icms_base_despesas', 'Entrada: Siscomex e AFRMM na base do ICMS', 'b'], ['obs', 'Observação', 't']
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
    /* Unidade da RFB de despacho (código da DUIMP) → local e UF do desembaraço na NF-e.
       A DUIMP só traz o código; o Davi cadastra cada unidade usada uma vez. */
    urfs: {},
    /* País (ISO, como vem do Catálogo de Operadores) → código e nome da tabela do Banco
       Central usada na NF-e. Ajustável na configuração; país fora da tabela vira pendência. */
    paises: {},
    empresas: { WindGate: { nome: 'SF Trading', uf: 'AL', cnpj: '58762606000144' }, JeT: { nome: 'JeT Import', uf: 'ES', cnpj: '' } }
  };
  function configNFe(db) {
    const c = (((db || {}).hubPainel || {})._nfeConfig) || {}, e = c.empresas || {};
    return Object.assign({}, CONFIG_PADRAO, c, {
      aliquotasInternas: Object.assign({}, CONFIG_PADRAO.aliquotasInternas, c.aliquotasInternas),
      urfs: Object.assign({}, c.urfs), paises: Object.assign({}, c.paises),
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
  /* Valor da venda direta: o preço da cotação sem o DIFAL que o cliente contribuinte recolhe em guia (o mesmo valor das parcelas). */
  function precoSemDifal(q) {
    try {
      const C = W.calcular && W.precoDesem ? W : (typeof require === 'function' ? require('./cotacao-regras.js') : null);
      if (!C) return num(q && q.preco);
      /* Vale o preço aprovado (q.preco); o cálculo só diz quanto dele é DIFAL. */
      const R = C.calcular(q), semDifal = C.precoDesem(R);
      return num(q && q.preco) > 0 && R.preco > 0 ? num(q.preco) * semDifal / R.preco : semDifal;
    } catch (e) { return num(q && q.preco); }
  }
  function sugerirEntrada(db, a) {
    const cen = cenarioDe(db, a.cenario); if (!cen) return null;
    /* Nota de origem: a venda nasce de uma nota já feita (a entrada, ou a SF → JeT para a venda da JeT). */
    const orig = a.origemNota ? (db.hubNFe || []).find(n => n && n._id === a.origemNota && n.status !== 'cancelada') || null : null;
    if (orig && !a.opId) a = Object.assign({}, a, { opId: orig.op || '' });
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
      // A entrada nasce do retrato da DUIMP: aqui só se aponta qual DUIMP e o que a API não traz.
      out.duimpNumero = W.numDuimp(a.duimpNumero || (o && (o.duimp || (o.duimpDados && o.duimpDados.geral && o.duimpDados.geral.numero))));
      out.destinatario = {};
      out.extras.duimp = {};
    } else if (cen.k === 'G') {
      if (ref && ref.entrada) { out.itens = (ref.entrada.itens || []).map(x => Object.assign({}, x)); out.opId = ref.op || out.opId; }
      out.extras = { referencia: ref ? ref._id : '', finalidade: 2, cfop: '' };
    } else {
      const ent = orig && orig.cenario === 'A' ? orig : notaEntradaDaOp(db, a.opId), itensEnt = ent && ent.payload ? ent.payload.items || [] : [];
      const baseEnt = x => num(x.valor_bruto) + num(x.valor_frete) + num(x.valor_seguro) + num(x.ipi_valor) + num(x.ii_valor) + num(x.valor_outras_despesas);
      const somaBaseEnt = itensEnt.reduce((s, x) => s + baseEnt(x), 0), fatorEnt = somaBaseEnt > 0 && ent && ent.totais && num(ent.totais.total) > 0 ? num(ent.totais.total) / somaBaseEnt : 1;
      const inter = num(cen.icms_aliquota_interestadual) / 100;
      /* Itens de uma nota: os da tela, quando ela tem; senão os do JSON enviado à Focus. */
      const itensDaNota = nn => (nn && nn.cenario !== 'A' && nn.entrada && Array.isArray(nn.entrada.itens) && nn.entrada.itens.length ? nn.entrada.itens.map(x => Object.assign({}, x))
        : ((nn && nn.payload && nn.payload.items) || []).map(x => ({ codigo: x.codigo_produto || '', descricao: x.descricao || '', ncm: soDig(x.codigo_ncm), unidade: x.unidade_comercial || 'UN', quantidade: num(x.quantidade_comercial), valorUnitario: num(x.valor_unitario_comercial) })));
      /* Com nota de origem, os itens são os dela. Sem cotação na operação, os da NF de entrada: a venda não fica sem itens. */
      const fonte = orig || (!qi.length ? ent : null);
      if (fonte) {
        if (orig) out.extras.notaOrigem = orig._id;
        const mesmaOrdem = qi.length === itensDaNota(fonte).length;
        out.itens = itensDaNota(fonte).map((x, i) => {
          const al = aliquotasItem(db, x.ncm, mesmaOrdem ? Object.assign({}, qi[i], x) : x), qtd = num(x.quantidade);
          const totEnt = itensEnt[i] && ent === fonte ? baseEnt(itensEnt[i]) * fatorEnt : 0;
          const sh = mesmaOrdem && fobTot > 0 ? num(qi[i].q) * num(qi[i].u) * txD / fobTot : 0;
          /* Valor: conta e ordem = custo da entrada; SF → JeT = piso da entrada; venda = preço da cotação. Sem cotação: o da nota de origem (venda da JeT) ou em branco para preencher. */
          const preco = cen.k === 'H' ? precoSemDifal(q) : num(q && q.preco);
          const total = cen.k === 'B' ? totEnt : cen.k === 'D' ? (totEnt && inter < 1 ? totEnt / (1 - inter) : 0) : sh && preco ? preco * sh : fonte.cenario !== 'A' ? num(x.valorUnitario) * qtd : 0;
          return { codigo: x.codigo || ('IT' + (i + 1)), descricao: x.descricao || '', ncm: soDig(x.ncm), unidade: x.unidade || 'UN', quantidade: qtd,
            ii: al.ii, ipi: al.ipi, pis: al.pis, cofins: al.cofins, c5291: al.c5291, mono: al.mono, valorUnitario: qtd && total ? +(total / qtd).toFixed(10) : null };
        });
        return out;
      }
      out.itens = qi.map((it, i) => {
        const b = baseItem(it, i), fob = num(it.q) * num(it.u) * txD, sh = fobTot > 0 ? fob / fobTot : 0;
        const totEnt = itensEnt[i] ? baseEnt(itensEnt[i]) * fatorEnt : 0;
        let total = 0;
        if (cen.k === 'B') total = totEnt;
        else if (cen.k === 'D') total = totEnt && inter < 1 ? totEnt / (1 - inter) : 0;
        else total = (cen.k === 'H' ? precoSemDifal(q) : num(q && q.preco)) * sh;
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

  /* ---------- Entrada de importação a partir da DUIMP (cenário A) ---------- */
  /* Só os países confirmados; o resto se cadastra na Configuração da NF-e (vira pendência até lá). */
  const PAISES_BACEN = { CN: { codigo: '1600', nome: 'China, República Popular' }, US: { codigo: '2496', nome: 'Estados Unidos' } };
  const paisBacen = (cfg, iso) => { const k = String(iso || '').toUpperCase(); const c = (cfg.paises || {})[k] || PAISES_BACEN[k]; return c && soDig(c.codigo) ? { codigo: soDig(c.codigo), nome: c.nome || k } : null; };
  const INTERMEDIO_NFE = { 'conta e ordem': 2, encomenda: 3, propria: 1 };
  /** Data do desembaraço: a DUIMP (API do importador) não traz; vem do aviso do despachante no portal. */
  function dataDesembaracoDaOp(o) {
    const ev = ((o && o.portalEventos) || []).filter(e => e && e.acao === 'desembaracado' && ehData(e.data)).pop();
    if (ev) return ev.data;
    const s = o && o.duimpSituacao && W.soData(o.duimpSituacao.desembaraco);
    return ehData(s) ? s : '';
  }
  /* Valor do tributo federal como o contador escolheu no cenário (devido ou a recolher), exatamente como na DUIMP. */
  const valorTributo = (t, campo) => !t ? 0 : r2(campo === 'aRecolher' ? (t.aRecolher != null ? t.aRecolher : t.devido) : (t.devido != null ? t.devido : t.aRecolher));

  /**
   * DUIMP × cotação da operação: o que difere vira aviso (não bloqueia).
   * Compara NCM, quantidade, valor aduaneiro e II/IPI/PIS/COFINS (> 1%) e o câmbio.
   */
  function conferirDuimpCotacao(db, opId) {
    const o = opDe(db, opId), du = o ? W.duimpDaOp(db, opId) : null, q = o ? W.cotacaoDaOp(db, o) : null;
    if (!du || !q || !Array.isArray(q.items)) return [];
    const f = q.fields || {}, N = k => num(f[k]), txD = N('txDesp'), txF = N('txFrete'), pctInv = (f.pctInv === '' || f.pctInv == null ? 100 : N('pctInv')) / 100;
    const qi = q.items.filter(Boolean), fobTot = qi.reduce((s, it) => s + num(it.q) * num(it.u) * txD, 0);
    const calc = qi.map(it => { const fob = num(it.q) * num(it.u) * txD, sh = fobTot > 0 ? fob / fobTot : 0, va = fob * pctInv + sh * (N('freteUSD') * txF + N('seguro') + N('capatazia'));
      const ii = va * num(it.ii) / 100, ipi = (va + ii) * num(it.ipi) / 100; return { ncm: soDig(it.ncm), q: num(it.q), va, ii, ipi, pis: va * (it.pis != null ? num(it.pis) : 2.1) / 100, cofins: va * (it.cofins != null ? num(it.cofins) : 9.65) / 100, usado: false }; });
    const out = [], dif = (a, b) => b ? Math.abs(a - b) / Math.abs(b) : (a ? 1 : 0), pct = x => (x * 100).toFixed(1).replace('.', ',') + '%';
    du.itens.forEach(d => {
      const c = calc.find(x => !x.usado && x.ncm === d.ncm);
      if (!c) { out.push(`${opId} · item ${d.numero} da DUIMP (NCM ${d.ncm}) não está na cotação.`); return; }
      c.usado = true;
      if (Math.abs((+d.quantidade || 0) - c.q) > 0.0001) out.push(`${opId} · item ${d.numero} (NCM ${d.ncm}): quantidade ${d.quantidade} na DUIMP × ${c.q} na cotação.`);
      if (dif(+d.valorAduaneiroBRL || 0, c.va) > 0.01) out.push(`${opId} · item ${d.numero}: valor aduaneiro R$ ${(+d.valorAduaneiroBRL || 0).toFixed(2)} na DUIMP × R$ ${c.va.toFixed(2)} na cotação (${pct(dif(+d.valorAduaneiroBRL || 0, c.va))}).`);
      ['ii', 'ipi', 'pis', 'cofins'].forEach(k => { const v = valorTributo((d.tributos || {})[k], 'devido'); if (dif(v, c[k]) > 0.01 && Math.abs(v - c[k]) > 0.01) out.push(`${opId} · item ${d.numero}: ${k.toUpperCase()} R$ ${v.toFixed(2)} na DUIMP × R$ ${c[k].toFixed(2)} na cotação.`); });
    });
    calc.filter(c => !c.usado).forEach(c => out.push(`${opId} · NCM ${c.ncm} da cotação não está na DUIMP.`));
    const tx = du.retrato.geral.taxaCambio;
    if (tx && txD && dif(tx, txD) > 0.01) out.push(`${opId} · câmbio da DUIMP ${tx.toFixed(4)} × ${txD.toFixed(4)} da cotação.`);
    return out;
  }

  /**
   * Cenário A: a NF de entrada nasce do retrato da DUIMP (ops[].duimpDados).
   * Itens, quantidades, valores, tributos federais, exportador e dados da
   * declaração vêm da DUIMP, exatamente; o ICMS (estadual) é calculado pela
   * regra do cenário. a = { cenario:'A', opId, duimpNumero, dataEmissao, extras, ambiente }
   */
  function montarEntradaDuimp(db, a, cen) {
    const pend = [], avisos = [], P = (campo, msg) => pend.push({ campo, msg }), A = msg => avisos.push(msg);
    const ex = (a && a.extras) || {}, exDu = ex.duimp || {}, cfg = configNFe(db), prod = a.ambiente === 'producao';
    const o = a.opId ? opDe(db, a.opId) : null;
    const numero = W.numDuimp(a.duimpNumero || (o && (o.duimp || (o.duimpDados && o.duimpDados.geral && o.duimpDados.geral.numero))));
    const ret = numero ? W.retratoDuimp(db, numero) : null;
    const vazio = { payload: null, pendencias: pend, avisos, totais: null, empresa: cen.emitente, cenario: 'A', opId: (o && o.id) || a.opId || '', destinatario: {}, duimp: { numero, versao: '' } };
    if (!ret) { P('duimp', 'DUIMP não importada: a NF de entrada nasce da DUIMP. Importe a DUIMP na ficha da operação (ou na tela de NF-e).'); return vazio; }
    const r = ret.dados, g = r.geral, itensD = (r.itens || []).filter(Boolean);
    const opsD = W.opsDaDuimp(db, numero), varias = opsD.length > 1;
    if (prod && !(cen.conferido && cen.conferido.em)) P('cenario', 'Cenário A ainda não foi conferido pelo contador: em produção só sai nota de cenário conferido.');
    else if (!(cen.conferido && cen.conferido.em)) A('Cenário A a validar pelo contador (CFOP, CST, alíquotas e composição do valor do produto são sugestões).');
    if (!itensD.length) P('items', 'A DUIMP importada não tem itens ativos.');
    const semOp = varias ? itensD.filter(i => !i.op) : [];
    if (semOp.length) P('itens.op', `${semOp.length} item(ns) da DUIMP sem operação (${semOp.map(i => i.numero).join(', ')}): a DUIMP serve a ${opsD.map(x => x.id).join(' e ')} e cada item precisa dizer de qual é.`);

    const data = ehData(a.dataEmissao) ? a.dataEmissao : W.soData(W.hojeISO());
    const t = W.tributosNaData(db, data);
    const empresa = cen.emitente, emit = empresaDados(db, empresa);
    if (soDig(emit.cnpj).length !== 14) P('cnpj_emitente', `CNPJ da ${nomeEmpresa(empresa)} não cadastrado (Fiscal › Configurar).`);
    if (g.importador && g.importador.cnpj && soDig(emit.cnpj) && g.importador.cnpj !== soDig(emit.cnpj)) P('cnpj_emitente', `A DUIMP é do importador CNPJ ${g.importador.cnpj}, não da ${nomeEmpresa(empresa)}.`);

    /* Destinatário: o exportador da DUIMP, com os dados do Catálogo de Operadores Estrangeiros. */
    const exportadores = [...new Set(itensD.map(i => i.exportador && i.exportador.codigo).filter(Boolean))];
    if (exportadores.length > 1) P('destinatario', `A DUIMP tem ${exportadores.length} exportadores (${exportadores.join(', ')}) e a NF de entrada tem um destinatário só: combinar com o Pedro (uma nota por exportador).`);
    const exp = (itensD[0] && itensD[0].exportador) || null;
    const pais = exp ? paisBacen(cfg, exp.pais) : null;
    if (!exp) P('destinatario', 'Item da DUIMP sem exportador.');
    else {
      if (!exp.noCatalogo) P('destinatario', `Exportador ${exp.codigo} não encontrado no Catálogo de Operadores Estrangeiros.`);
      else if (!txt(exp.logradouro)) P('logradouro_destinatario', `Exportador ${exp.codigo} sem endereço no Catálogo de Operadores Estrangeiros.`);
      if (!pais) P('codigo_pais_destinatario', `País ${exp.pais || '(vazio)'} do exportador sem código da tabela do Banco Central: cadastre em NF-e › Configuração.`);
    }

    /* Declaração. */
    const urf = (cfg.urfs || {})[g.unidadeDespacho] || null;
    // Ordem: digitado na nota (com motivo) › cadastro da unidade em NF-e › Configuração › Portal Único (API da Sefaz e Tabelas Comex).
    const local = txt(exDu.local) || (urf && urf.nome) || txt(g.localDesembaraco) || '', uf = String(exDu.uf || (urf && urf.uf) || g.ufDesembaraco || '').toUpperCase();
    if (!local || !/^[A-Z]{2}$/.test(uf)) P('documentos_importacao.local_desembaraco_aduaneiro', `Local e UF do desembaraço da unidade ${g.unidadeDespacho || '(sem código)'}${/^[A-Z]{2}$/.test(uf) && !local ? ` (UF ${uf} veio do Portal; falta o nome do local)` : ''}: cadastre a unidade em NF-e › Configuração.`);
    const dataDesemb = ehData(exDu.data_desembaraco) ? exDu.data_desembaraco : (ehData(g.dataDesembaraco) ? g.dataDesembaraco : dataDesembaracoDaOp(o));
    if (!ehData(dataDesemb)) P('documentos_importacao.data_desembaraco_aduaneiro', 'Data do desembaraço: o Portal Único ainda não mostra o desembaraço desta DUIMP (ou o certificado não tem acesso ao histórico). Vem do aviso do despachante no portal ou é digitada na nota (com motivo).' + ((g.fontesDesembaraco || {}).sefaz && g.fontesDesembaraco.sefaz !== 'ok' ? ' Resposta do Portal: ' + g.fontesDesembaraco.sefaz : ''));
    else if (ehData(exDu.data_desembaraco)) A('Data do desembaraço digitada na nota: conferir com o extrato da DUIMP.');
    const via = g.viaTransporte || (+exDu.via_transporte || null);
    if (!via) P('documentos_importacao.via_transporte', `Via de transporte: a carga da DUIMP é ${g.tipoIdentificacaoCarga || '(sem tipo)'}, não um CE Mercante. Informe a via na nota.`);
    if (!ehData(W.soData(g.dataRegistro))) P('documentos_importacao.data_registro', 'A DUIMP importada não tem data de registro.');
    /* AFRMM, Taxa Siscomex e outras despesas aduaneiras: vêm da DUIMP; o que for digitado na nota vale no lugar,
       rateado pelos itens pelo valor de cada um. Campo vazio = automático. */
    const afrmmDuimp = r2(itensD.reduce((s, i) => s + (+i.afrmm || 0), 0)), siscDuimp = r2(itensD.reduce((s, i) => s + (+i.taxaSiscomex || 0), 0));
    const digitado = k => (exDu[k] !== '' && exDu[k] != null && isFinite(num(exDu[k])) ? r2(num(exDu[k])) : null);
    const afrmmEd = digitado('afrmm'), siscEd = digitado('siscomex'), outrasEd = digitado('outras');
    const afrmmManual = afrmmEd != null && Math.abs(afrmmEd - afrmmDuimp) > 0.005 ? afrmmEd : null;
    const siscManual = siscEd != null && Math.abs(siscEd - siscDuimp) > 0.005 ? siscEd : null;
    const brl0 = v => 'R$ ' + r2(v).toFixed(2).replace('.', ',');
    if (afrmmManual != null) A(afrmmDuimp > 0 ? `AFRMM digitado na nota: ${brl0(afrmmManual)} (a DUIMP trazia ${brl0(afrmmDuimp)}). Conferir com o extrato do despachante.` : `AFRMM informado pelo despachante (não veio na DUIMP): ${brl0(afrmmManual)}. Conferir.`);
    if (siscManual != null) A(`Taxa Siscomex digitada na nota: ${brl0(siscManual)} (a DUIMP trazia ${brl0(siscDuimp)}).`);
    if (outrasEd) A(`Outras despesas aduaneiras digitadas na nota: ${brl0(outrasEd)}. Conferir com o extrato do despachante.`);
    if (via === 1 && !(afrmmDuimp > 0) && !(afrmmManual > 0)) P('documentos_importacao.valor_afrmm', 'AFRMM ausente: não veio na DUIMP e é obrigatório no marítimo. Informe o valor do despachante.');
    const somaBase = itensD.reduce((s, x) => s + r2(cen.a_vprod === 'mercadoria' ? x.valorMercadoriaBRL : x.valorAduaneiroBRL), 0) || 1;
    /* Rateio pelo valor do item; o último leva a sobra dos centavos. */
    const rateio = (total, V, ult, usado) => (ult ? r2(total - usado) : r2(total * V / somaBase));

    /* Intermediação: a DUIMP diz se é conta e ordem, encomenda ou direta. */
    const modsD = [...new Set(itensD.map(i => i.intermedio && i.intermedio.modalidade).filter(Boolean))];
    const modD = modsD[0] || 'propria', fi = INTERMEDIO_NFE[modD] || 1;
    if (modsD.length > 1) P('documentos_importacao.forma_intermedio', 'A DUIMP mistura modalidades de importação entre os itens.');
    opsD.forEach(x => { if (x.modalidade && x.modalidade !== modD) A(`${x.id} está cadastrada como "${x.modalidade}", mas a DUIMP diz "${modD}". Vale a DUIMP na nota; corrija a operação.`); });
    let terceiro = null;
    if (fi !== 1) {
      const cn = soDig(((itensD.find(i => i.intermedio && i.intermedio.cnpj) || {}).intermedio || {}).cnpj);
      const cli = (db.crm || []).find(c => c && soDig(c.cnpj) === cn);
      terceiro = { cnpj: cn, uf: String(ex.terceiroUf || (g.adquirenteOuEncomendante && g.adquirenteOuEncomendante.uf) || (cli && cli.end && cli.end.uf) || '').toUpperCase() };
      if (cn.length !== 14) P('documentos_importacao.cnpj', `CNPJ do ${fi === 2 ? 'adquirente' : 'encomendante'} não veio na DUIMP.`);
      if (!/^[A-Z]{2}$/.test(terceiro.uf)) P('documentos_importacao.uf_terceiro', `UF do ${fi === 2 ? 'adquirente' : 'encomendante'} (CNPJ ${cn}): cadastre o cliente no CRM com a UF.`);
    }

    /* ICMS (estadual): regra do cenário, com o benefício de AL e a vigência por data. */
    if (!t.beneficioAL) A('Sem o benefício de ICMS de Alagoas nesta data: ICMS pela alíquota sem benefício do cenário.');
    if (!t.ipi) A('IPI zerado nesta data (LC 214/2025).');
    if (!t.pisCofinsImp) A('PIS/COFINS extintos nesta data: vão com o CST de após 2026 do cenário, sem valor.');
    if (t.icmsFator < 1) A(`ICMS na transição: ${Math.round(t.icmsFator * 100)}% da alíquota (EC 132/2023). Revisar o cenário.`);
    const q = o ? W.cotacaoDaOp(db, o) : null;
    const aliqIcms = t.beneficioAL ? (temNum(cen.icms_aliquota) ? num(cen.icms_aliquota) : temNum(ex.icmsAliquota) ? num(ex.icmsAliquota) : (q && q.fields && temNum(q.fields.icmsEnt) ? num(q.fields.icmsEnt) : null))
      : (temNum(cen.icms_aliquota_sem_beneficio) ? num(cen.icms_aliquota_sem_beneficio) : null);
    if (aliqIcms == null && cen.a_icms_modo === 'calculado') P('icms_aliquota', 'Alíquota do ICMS de importação: nem o cenário nem a cotação informam.');
    if (!txt(cen.icms_cst)) P('icms_situacao_tributaria', 'CST de ICMS do cenário A.');
    if (!/^\d{4}$/.test(txt(cen.cfop_exterior))) P('cfop', 'CFOP de importação do cenário A não definido: o contador define em Cenários fiscais.');
    if (!txt(cen.pis_cst) || !txt(cen.cofins_cst)) P('pis_situacao_tributaria', 'CST de PIS/COFINS do cenário A.');
    const comIbsCbs = !!(txt(cen.ibs_cbs_cst) && txt(cen.ibs_cbs_classificacao));
    if (!comIbsCbs) { if (t.cbs.recolhe) P('ibs_cbs', 'Grupo IBS/CBS obrigatório nesta data: o contador define o CST e o cClassTrib no cenário.'); else A('Grupo IBS/CBS não informado (2026: informativo).'); }
    A(cen.a_icms_modo === 'calculado' ? 'Confira a base e o valor do ICMS de importação com a guia recolhida pelo despachante (a DUIMP não traz o ICMS).' : 'ICMS da entrada zerado (CST 51), como no Maino: o ICMS do benefício de AL entra no custo, fora da nota.');

    /* Itens: um item da NF-e por item da DUIMP, tributos federais exatamente como lá. */
    const campoT = cen.a_tributo_valor === 'aRecolher' ? 'aRecolher' : 'devido', sim = v => v === true || v === 'sim' || v === 'true';
    const tot = { produtos: 0, ii: 0, ipi: 0, icms: 0, outras: 0, pis: 0, cofins: 0, difal: 0, fcp: 0, cbs: 0, ibs: 0, total: 0 };
    // O que, além dos campos da NF-e, entra no total da nota (cenário; padrão da NF 82: PIS, COFINS e AFRMM).
    const somaT = String(cen.a_total_soma == null ? '' : cen.a_total_soma).toLowerCase();
    const somaNoTotal = (pis, cof, afrmm, icms) => r2((/pis/.test(somaT) && !sim(cen.a_outras_pis_cofins) ? pis + cof : 0) + (/afrmm/.test(somaT) && !sim(cen.a_outras_afrmm) ? afrmm : 0) + (/icms/.test(somaT) && !sim(cen.a_outras_icms) ? icms : 0));
    let afrmmUsado = 0, siscUsado = 0, outrasUsado = 0;
    const lib = db.ncmlib || {};
    const items = itensD.map((d, i) => {
      const n = i + 1, tr = d.tributos || {}, ult = i === itensD.length - 1;
      const V = r2(cen.a_vprod === 'mercadoria' ? d.valorMercadoriaBRL : d.valorAduaneiroBRL);
      const qtd = +d.quantidade || 0;
      if (!(V > 0)) P(`items[${n}].valor_bruto`, `Item ${d.numero} da DUIMP sem ${cen.a_vprod === 'mercadoria' ? 'valor da mercadoria' : 'valor aduaneiro'}.`);
      if (!(qtd > 0)) P(`items[${n}].quantidade_comercial`, `Item ${d.numero} da DUIMP sem quantidade.`);
      if (soDig(d.ncm).length !== 8) P(`items[${n}].codigo_ncm`, `Item ${d.numero} da DUIMP sem NCM de 8 dígitos.`);
      if (!d.fabricante || !d.fabricante.codigo) P(`items[${n}].adicoes.codigo_fabricante_estrangeiro`, `Item ${d.numero} da DUIMP sem fabricante.`);
      if (!tr.ii) A(`Item ${d.numero}: a DUIMP não traz II calculado (regime ou isenção): sai zerado.`);
      const sisc = siscManual != null ? rateio(siscManual, V, ult, siscUsado) : r2(d.taxaSiscomex);
      const afrmm = afrmmManual != null ? rateio(afrmmManual, V, ult, afrmmUsado) : r2(d.afrmm);
      const outrasAd = outrasEd ? rateio(outrasEd, V, ult, outrasUsado) : 0;   // outras despesas aduaneiras, tratadas como a Taxa Siscomex
      afrmmUsado = r2(afrmmUsado + afrmm); siscUsado = r2(siscUsado + sisc); outrasUsado = r2(outrasUsado + outrasAd);
      const vu = qtd ? +(V / qtd).toFixed(10) : 0, un = txt(d.unidadeComercial, 6) || 'UN';
      // Como no Maino (NF 82): código e descrição do Catálogo de Produtos (denominação + detalhamento);
      // o que passa de 120 caracteres vai nas informações adicionais do item. Sem Catálogo: "ITEM n - <descrição da DUIMP>".
      const cat = d.produto || null, denom = txt(cat && cat.denominacao, 3700), detal = txt(cat && cat.descricao, 3700);
      const descLonga = denom ? [denom, detal].filter(Boolean).join(' ') : `ITEM ${d.numero} - ${txt(d.descricao, 3700) || txt((lib[soDig(d.ncm)] || {}).d, 100) || 'mercadoria'}`;
      const codigo = txt(cat && cat.codigoInterno, 60) || (denom ? txt(denom.split(' - ')[0], 60) : '') || String(d.numero);
      const x = { numero_item: n, codigo_produto: codigo, descricao: descLonga.slice(0, 120), cfop: txt(cen.cfop_exterior), codigo_ncm: soDig(d.ncm),
        unidade_comercial: un, quantidade_comercial: qtd, valor_unitario_comercial: vu, unidade_tributavel: un, quantidade_tributavel: qtd, valor_unitario_tributavel: vu, valor_bruto: V, inclui_no_total: 1,
        icms_origem: txt(cen.icms_origem), icms_situacao_tributaria: txt(cen.icms_cst) };
      // Produto = mercadoria: frete e seguro do item vão nos campos próprios (no aduaneiro já estão dentro).
      const freteI = cen.a_vprod === 'mercadoria' ? r2(d.freteBRL) : 0, seguroI = cen.a_vprod === 'mercadoria' ? r2(d.seguroBRL) : 0;
      if (freteI) x.valor_frete = freteI; if (seguroI) x.valor_seguro = seguroI;
      const II = valorTributo(tr.ii, campoT), IPI = t.ipi ? valorTributo(tr.ipi, campoT) : 0;
      const PIS = t.pisCofinsImp ? valorTributo(tr.pis, campoT) : 0, COF = t.pisCofinsImp ? valorTributo(tr.cofins, campoT) : 0;
      Object.assign(x, { ii_base_calculo: r2(tr.ii ? tr.ii.base : V), ii_valor: II, ii_despesas_aduaneiras: r2(sisc + afrmm + outrasAd), ii_valor_iof: 0 });
      if (txt(cen.ipi_cst)) { x.ipi_situacao_tributaria = txt(cen.ipi_cst); x.ipi_codigo_enquadramento_legal = txt(cen.ipi_enquadramento) || '999'; }
      if (CST_IPI_COM_VALOR.includes(txt(cen.ipi_cst)) && tr.ipi) Object.assign(x, { ipi_base_calculo: r2(tr.ipi.base), ipi_aliquota: +tr.ipi.aliquota || 0, ipi_valor: IPI });
      const pisCst = !t.pisCofinsImp ? txt(cen.pis_cst_extinto) || '08' : txt(cen.pis_cst), cofCst = !t.pisCofinsImp ? txt(cen.pis_cst_extinto) || '08' : txt(cen.cofins_cst);
      x.pis_situacao_tributaria = pisCst; x.cofins_situacao_tributaria = cofCst;
      if (!CST_PIS_SEM_VALOR.includes(pisCst) && tr.pis) Object.assign(x, { pis_base_calculo: r2(tr.pis.base), pis_aliquota_porcentual: +tr.pis.aliquota || 0, pis_valor: PIS });
      if (!CST_PIS_SEM_VALOR.includes(cofCst) && tr.cofins) Object.assign(x, { cofins_base_calculo: r2(tr.cofins.base), cofins_aliquota_porcentual: +tr.cofins.aliquota || 0, cofins_valor: COF });
      let ICMS = 0;
      const aliq = num(aliqIcms) / 100;
      if (cen.a_icms_modo !== 'calculado') {
        // Padrão do Maino: CST 51 com tudo zerado; o ICMS do benefício de AL é custo à parte, fora da nota.
        Object.assign(x, { icms_modalidade_base_calculo: 3, icms_base_calculo: 0, icms_aliquota: 0, icms_valor: 0 });
      } else if (CST_ICMS_COM_VALOR.includes(txt(cen.icms_cst)) && aliqIcms != null && aliq < 1) {
        // ICMS "por dentro", sobre a base que o Pedro e a Gil definirem (Siscomex e AFRMM conforme o cenário).
        const red = num(cen.icms_reducao_base) / 100, desp = sim(cen.a_icms_base_despesas) ? sisc + afrmm + outrasAd : 0;
        const baseIcms = r2((V + II + IPI + PIS + COF + desp) / (1 - aliq) * (1 - red));
        ICMS = r2(baseIcms * aliq);
        Object.assign(x, { icms_modalidade_base_calculo: 3, icms_base_calculo: baseIcms, icms_aliquota: num(aliqIcms), icms_valor: ICMS }, red ? { icms_reducao_base_calculo: num(cen.icms_reducao_base) } : {});
      }
      const outras = r2((sim(cen.a_outras_pis_cofins) ? PIS + COF : 0) + (sim(cen.a_outras_siscomex) ? sisc : 0) + outrasAd + (sim(cen.a_outras_afrmm) ? afrmm : 0) + (sim(cen.a_outras_icms) ? ICMS : 0));
      x.valor_outras_despesas = outras;
      x.documentos_importacao = [limpar({ numero: g.numero, data_registro: W.soData(g.dataRegistro), local_desembaraco_aduaneiro: txt(local, 60), uf_desembaraco_aduaneiro: uf, data_desembaraco_aduaneiro: dataDesemb,
        via_transporte: via || '', valor_afrmm: afrmm, forma_intermedio: fi, cnpj: terceiro ? terceiro.cnpj : '', uf_terceiro: terceiro ? terceiro.uf : '', codigo_exportador: txt(d.exportador && d.exportador.codigo, 60),
        adicoes: [limpar({ numero: d.numero, numero_sequencial_item: 1, codigo_fabricante_estrangeiro: txt(d.fabricante && d.fabricante.codigo, 60) })] })];
      if (comIbsCbs) {
        // Base: a que a DUIMP traz; sem ela, aduaneiro + II + Siscomex + AFRMM (LC 214/2025, art. 69 — conferir com a NF 88).
        const baseIbs = r2((tr.cbs && tr.cbs.base) || (tr.ibsUf && tr.ibsUf.base) || (r2(d.valorAduaneiroBRL) + II + sisc + afrmm + outrasAd));
        const cbsV = tr.cbs ? valorTributo(tr.cbs, campoT) : r2(baseIbs * t.cbs.aliq / 100), ibsV = tr.ibsUf ? valorTributo(tr.ibsUf, campoT) : r2(baseIbs * t.ibs.aliq / 100);
        Object.assign(x, { ibs_cbs_situacao_tributaria: txt(cen.ibs_cbs_cst), ibs_cbs_classificacao_tributaria: txt(cen.ibs_cbs_classificacao), ibs_cbs_base_calculo: baseIbs,
          ibs_uf_aliquota: tr.ibsUf ? +tr.ibsUf.aliquota || 0 : t.ibs.aliq, ibs_uf_valor: ibsV, ibs_mun_aliquota: 0, ibs_mun_valor: 0, ibs_valor_total: ibsV, cbs_aliquota: tr.cbs ? +tr.cbs.aliquota || 0 : t.cbs.aliq, cbs_valor: cbsV });
        tot.cbs = r2(tot.cbs + cbsV); tot.ibs = r2(tot.ibs + ibsV);
      }
      const infItem = [descLonga.length > 120 ? descLonga.slice(120) : '', varias && d.op ? `Operação ${d.op}` : ''].filter(Boolean).join(' · ');
      if (infItem) x.informacoes_adicionais_item = infItem.slice(0, 500);
      if (!denom) A(`Item ${d.numero}: produto ${d.produtoCodigo || '(sem código)'} não encontrado no Catálogo de Produtos: código e descrição saem da DUIMP.`);
      tot.produtos = r2(tot.produtos + V); tot.ii = r2(tot.ii + II); tot.ipi = r2(tot.ipi + IPI); tot.icms = r2(tot.icms + ICMS); tot.outras = r2(tot.outras + outras);
      tot.frete = r2((tot.frete || 0) + freteI); tot.seguro = r2((tot.seguro || 0) + seguroI);
      tot.pis = r2(tot.pis + PIS); tot.cofins = r2(tot.cofins + COF); tot.afrmm = r2((tot.afrmm || 0) + afrmm); tot.siscomex = r2((tot.siscomex || 0) + sisc); tot.outrasAduaneiras = r2((tot.outrasAduaneiras || 0) + outrasAd);
      tot.peso = r2((tot.peso || 0) + num(d.pesoLiquido)); tot.qtd = (tot.qtd || 0) + qtd;
      tot.total = r2(tot.total + V + freteI + seguroI + II + IPI + outras + somaNoTotal(PIS, COF, afrmm, ICMS));
      return x;
    });

    /* A soma da nota tem de bater com o total da DUIMP (tolerância de R$ 0,01 por tributo). */
    const totD = g.totais || {};
    [['ii', 'II'], ['ipi', 'IPI'], ['pis', 'PIS'], ['cofins', 'COFINS']].forEach(([k, l]) => {
      if (!totD[k] || (k !== 'ii' && !t.pisCofinsImp && (k === 'pis' || k === 'cofins')) || (k === 'ipi' && !t.ipi)) return;
      const esperado = valorTributo(totD[k], campoT);
      if (Math.abs(esperado - tot[k]) > 0.01) P('total.' + k, `${l} da nota (R$ ${tot[k].toFixed(2)}) difere do total da DUIMP (R$ ${esperado.toFixed(2)}).`);
    });
    const aduaneiroNota = r2(tot.produtos + (tot.frete || 0) + (tot.seguro || 0));
    if (g.valorAduaneiroBRL && Math.abs(r2(g.valorAduaneiroBRL) - aduaneiroNota) > 0.01) P('total.produtos', `Produtos + frete + seguro da nota (R$ ${aduaneiroNota.toFixed(2)}) diferem do valor aduaneiro da DUIMP (R$ ${r2(g.valorAduaneiroBRL).toFixed(2)}).`);
    opsD.forEach(x => conferirDuimpCotacao(db, x.id).forEach(A));

    const infos = [`DUIMP ${g.numero} versão ${r.versao} de ${W.dataBR(W.soData(g.dataRegistro))}.`];
    if (fi !== 1 && terceiro) infos.push(`Importação ${fi === 2 ? 'por conta e ordem do adquirente' : 'por encomenda do encomendante'} CNPJ ${terceiro.cnpj}.`);
    if (varias) infos.push(`Operações: ${opsD.map(x => x.id).join(', ')}.`);
    const brl = v => 'R$ ' + r2(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    infos.push(`II ${brl(tot.ii)}; IPI ${brl(tot.ipi)}; PIS ${brl(tot.pis)}; COFINS ${brl(tot.cofins)}; AFRMM ${brl(tot.afrmm)}; Taxa Siscomex ${brl(tot.siscomex)}.`);
    if (txt(ex.informacoes)) infos.push(txt(ex.informacoes, 2000));
    const pesoBruto = num(ex.duimp && ex.duimp.pesoBruto) || num(ex.pesoBruto) || 0;
    if (!pesoBruto) A('Peso bruto: a DUIMP não informa (só o líquido). Digite na nota se quiser no DANFE.');
    /* Automático: peso líquido da DUIMP, quantidade de itens e a espécie do cenário. O digitado vale no lugar. */
    const pesoLiqAuto = tot.peso ? +tot.peso.toFixed(3) : 0, volAuto = Math.round(tot.qtd || 0), especieAuto = txt(cen.a_volume_especie, 60);
    const pesoLiq = digitado('pesoLiquido') != null ? num(exDu.pesoLiquido) : pesoLiqAuto;
    const volQtd = exDu.volumes !== '' && exDu.volumes != null && isFinite(num(exDu.volumes)) ? Math.round(num(exDu.volumes)) : volAuto;
    const especie = txt(exDu.especie, 60) || especieAuto;
    if (digitado('pesoLiquido') != null && Math.abs(pesoLiq - pesoLiqAuto) > 0.0005) A(`Peso líquido digitado na nota: ${pesoLiq} kg (a DUIMP trazia ${pesoLiqAuto} kg).`);
    const volumes = [limpar({ quantidade: volQtd || '', especie, peso_liquido: pesoLiq ? +(+pesoLiq).toFixed(3) : '', peso_bruto: pesoBruto ? +pesoBruto.toFixed(3) : '' })];
    /* O que o sistema calcularia sozinho: a tela mostra para editar a partir daí. */
    tot.auto = { afrmm: afrmmDuimp, siscomex: siscDuimp, outras: 0, pesoLiquido: pesoLiqAuto, pesoBruto: '', volumes: volAuto, especie: especieAuto };   // peso bruto: a DUIMP não informa
    const payload = limpar({
      natureza_operacao: txt(cen.natureza_operacao, 60) || 'IMPORTACAO', data_emissao: data + 'T12:00:00-03:00', tipo_documento: 0, finalidade_emissao: 1,
      local_destino: 3, consumidor_final: 0, presenca_comprador: +cen.presenca_comprador || 9, modalidade_frete: temNum(cen.modalidade_frete) ? +cen.modalidade_frete : 9, cnpj_emitente: soDig(emit.cnpj),
      nome_destinatario: a.ambiente === 'homologacao' ? HOMOLOGACAO_NOME : txt(exp && exp.nome, 60), indicador_inscricao_estadual_destinatario: 9,
      logradouro_destinatario: txt(exp && exp.logradouro, 60), numero_destinatario: 'S/N', bairro_destinatario: txt(exp && exp.cidade, 60) || 'EXTERIOR',
      municipio_destinatario: 'EXTERIOR', codigo_municipio_destinatario: '9999999', pais_destinatario: pais ? pais.nome : '', codigo_pais_destinatario: pais ? pais.codigo : '',
      id_estrangeiro_destinatario: txt(exp && exp.tin, 20), informacoes_adicionais_contribuinte: infos.join(' ').slice(0, 5000), volumes, items
    });
    Object.assign(payload, totaisCabecalho(items), { valor_total: tot.total });
    const somaItens = r2(items.reduce((s, x) => s + num(x.valor_bruto) + num(x.valor_frete) + num(x.valor_seguro) + num(x.ii_valor) + num(x.ipi_valor) + num(x.valor_outras_despesas)
      + somaNoTotal(num(x.pis_valor), num(x.cofins_valor), num(((x.documentos_importacao || [])[0] || {}).valor_afrmm), num(x.icms_valor)), 0));
    if (Math.abs(somaItens - tot.total) > 0.005) P('total', `Total da nota (R$ ${tot.total.toFixed(2)}) não bate com a soma dos itens (R$ ${somaItens.toFixed(2)}).`);
    return { payload, pendencias: pend, avisos, totais: Object.assign(tot, { somaItens }), empresa, cenario: 'A', opId: (ret.op && ret.op.id) || a.opId || '',
      destinatario: { nome: txt(exp && exp.nome, 60), cnpj: '', uf: '' }, formaIntermedio: fi, duimp: { numero: g.numero, versao: r.versao }, ops: opsD.map(x => x.id) };
  }

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
    // A entrada de importação só nasce da DUIMP: nem cotação, nem itens digitados.
    if (cen.k === 'A') return montarEntradaDuimp(db, a, cen);
    const cfg = configNFe(db), prod = a.ambiente === 'producao';
    const o = a.opId ? opDe(db, a.opId) : null;
    if (a.opId && !o) P('op', `Operação ${a.opId} não encontrada.`);
    /* Peso líquido e bruto da nota de saída: os da NF de entrada da operação (já com o que foi editado lá); sem ela,
       o líquido da cotação (quantidade × peso). O que for digitado na nota vale no lugar. */
    const entPeso = a.opId ? notaEntradaDaOp(db, a.opId) : null, volE = (entPeso && entPeso.payload && Array.isArray(entPeso.payload.volumes) && entPeso.payload.volumes[0]) || {};
    const qPeso = o && W.cotacaoDaOp ? W.cotacaoDaOp(db, o) : null, pesoCot = qPeso ? (qPeso.items || []).filter(Boolean).reduce((s, it) => s + num(it.q) * num(it.p), 0) : 0;
    const pesoAuto = { pesoLiquido: num(volE.peso_liquido) || +pesoCot.toFixed(3) || '', pesoBruto: num(volE.peso_bruto) || '', fonte: volE.peso_liquido ? 'NF de entrada' : pesoCot ? 'cotação' : '' };
    const pesoDig = k => (ex[k] !== '' && ex[k] != null && isFinite(num(ex[k])) ? num(ex[k]) : null);
    const pesoLiqS = pesoDig('pesoLiquido') != null ? pesoDig('pesoLiquido') : pesoAuto.pesoLiquido, pesoBrutoS = pesoDig('pesoBruto') != null ? pesoDig('pesoBruto') : pesoAuto.pesoBruto;
    const volumesSaida = num(pesoLiqS) || num(pesoBrutoS) ? [limpar({ peso_liquido: num(pesoLiqS) ? +num(pesoLiqS).toFixed(3) : '', peso_bruto: num(pesoBrutoS) ? +num(pesoBrutoS).toFixed(3) : '' })] : '';
    if (pesoDig('pesoLiquido') != null && pesoDig('pesoLiquido') !== num(pesoAuto.pesoLiquido)) A(`Peso líquido digitado na nota: ${pesoDig('pesoLiquido')} kg (automático: ${pesoAuto.pesoLiquido || '—'}${pesoAuto.fonte ? ', da ' + pesoAuto.fonte : ''}).`);
    if (pesoDig('pesoBruto') != null && pesoDig('pesoBruto') !== num(pesoAuto.pesoBruto)) A(`Peso bruto digitado na nota: ${pesoDig('pesoBruto')} kg (automático: ${pesoAuto.pesoBruto || '—'}).`);
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
    if (cen.destino === 'cliente' && dest.contribuinte === false) P('destinatario', cen.emitente === 'JeT' ? 'O cliente está marcado como NÃO contribuinte no CRM: use o cenário F.' : 'O cliente está marcado como NÃO contribuinte no CRM: a venda direta da SF é para contribuinte. Use a triangular (D e F).');
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
    /* ---- Referência ---- */
    const notasRef = [];
    if (cen.k === 'B') {
      const ent = notaEntradaDaOp(db, a.opId);
      if (ent && ent.status === 'autorizada' && ent.chave) notasRef.push({ chave_nfe: ent.chave });
      else P('notas_referenciadas', 'A saída na conta e ordem referencia a NF de entrada: autorize primeiro a NF de entrada (cenário A) desta operação.');
    }
    if (cen.k === 'G' && chaveRef) notasRef.push({ chave_nfe: chaveRef });

    /* ---- Tributos na data ---- */
    if (cen.k === 'D') { if (!t.beneficioAL) A('Sem o benefício de ICMS de Alagoas nesta data: ICMS pela alíquota sem benefício do cenário.'); }
    if (!t.ipi) A('IPI zerado nesta data (LC 214/2025).');
    if (!t.pisCofinsImp) A('PIS/COFINS extintos nesta data: vão com o CST de após 2026 do cenário, sem valor.');
    if (t.icmsFator < 1) A(`ICMS na transição: ${Math.round(t.icmsFator * 100)}% da alíquota (EC 132/2023). Revisar o cenário.`);
    const comIbsCbs = !!(txt(cen.ibs_cbs_cst) && txt(cen.ibs_cbs_classificacao));
    if (!comIbsCbs) { if (t.cbs.recolhe) P('ibs_cbs', 'Grupo IBS/CBS obrigatório nesta data: o contador define o CST e o cClassTrib no cenário.'); else A('Grupo IBS/CBS não informado (2026: informativo). O contador define o CST e o cClassTrib no cenário quando for exigido.'); }

    /* ---- Alíquotas de ICMS ---- */
    let aliqIcms = null;
    if (localDestino === 1) aliqIcms = temNum(cen.icms_aliquota_interna) ? num(cen.icms_aliquota_interna) : null;
    else aliqIcms = temNum(cen.icms_aliquota_interestadual) ? num(cen.icms_aliquota_interestadual) : null;
    if (aliqIcms == null && CST_ICMS_COM_VALOR.includes(txt(cen.icms_cst))) P('icms_aliquota', `Alíquota de ICMS ${localDestino === 1 ? 'interna' : 'interestadual'} do cenário ${cen.k}.`);
    if (!txt(cen.icms_cst)) P('icms_situacao_tributaria', `CST de ICMS do cenário ${cen.k}.`);
    if (!txt(cen.pis_cst) || !txt(cen.cofins_cst)) P('pis_situacao_tributaria', `CST de PIS/COFINS do cenário ${cen.k} (definir com o contador).`);
    const difal = !!cen.difal && localDestino === 2 && (+cen.consumidor_final === 1);
    const interna = difal ? cfg.aliquotasInternas[ufDest] : null;
    if (difal && !temNum(interna)) P('icms_aliquota_interna_uf_destino', `Alíquota interna de ICMS de ${ufDest || '(UF vazia)'} não cadastrada (Configuração da NF-e). Não há valor padrão.`);

    /* ---- Itens ---- */
    const itens = Array.isArray(a.itens) ? a.itens.filter(Boolean) : [];
    if (!itens.length) P('items', 'A nota precisa de pelo menos um item.');
    let usouC5291 = false;
    const tot = { produtos: 0, ii: 0, ipi: 0, icms: 0, outras: 0, pis: 0, cofins: 0, difal: 0, fcp: 0, cbs: 0, ibs: 0, total: 0 };
    const items = itens.map((it, i) => {
      const n = i + 1, ncm = soDig(it.ncm), qtd = num(it.quantidade), vu = num(it.valorUnitario);
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

      {
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
        // Como na NF 96 do Maino: PIS/COFINS sobre o valor sem o ICMS destacado.
        if (!(cen.aplica_monofasico && it.mono) && t.pisCofinsImp && !CST_PIS_SEM_VALOR.includes(txt(cen.pis_cst))) { const bPC = r2(V - (cen.pis_cofins_exclui_icms ? ICMS : 0)); PIS = r2(bPC * num(cen.pis_aliquota) / 100); COF = r2(bPC * num(cen.cofins_aliquota) / 100); }
      }
      if (cen.k === 'G' && ex.informacoesItem) x.informacoes_adicionais_item = txt(ex.informacoesItem, 500);

      /* PIS/COFINS: monofásico (CST 04), extinto (após 2026) ou pelo cenário. */
      const mono = cen.aplica_monofasico && it.mono;
      const pisCst = mono ? txt(cen.pis_cst_monofasico) || '04' : !t.pisCofinsImp ? txt(cen.pis_cst_extinto) || '08' : txt(cen.pis_cst);
      const cofCst = mono ? txt(cen.pis_cst_monofasico) || '04' : !t.pisCofinsImp ? txt(cen.pis_cst_extinto) || '08' : txt(cen.cofins_cst);
      x.pis_situacao_tributaria = pisCst; x.cofins_situacao_tributaria = cofCst;
      const basePC = r2(V - (cen.pis_cofins_exclui_icms ? ICMS : 0));
      if (!CST_PIS_SEM_VALOR.includes(pisCst)) Object.assign(x, { pis_base_calculo: basePC, pis_aliquota_porcentual: num(cen.pis_aliquota), pis_valor: PIS });
      if (!CST_PIS_SEM_VALOR.includes(cofCst)) Object.assign(x, { cofins_base_calculo: basePC, cofins_aliquota_porcentual: num(cen.cofins_aliquota), cofins_valor: COF });
      if (txt(cen.ipi_cst)) { x.ipi_situacao_tributaria = txt(cen.ipi_cst); x.ipi_codigo_enquadramento_legal = txt(cen.ipi_enquadramento) || '999'; }

      if (comIbsCbs) {
        // Base do IBS/CBS na saída (NF 96): valor − ICMS − PIS − COFINS.
        const bIC = r2(V - ICMS - PIS - COF), cbs = r2(bIC * t.cbs.aliq / 100), ibs = r2(bIC * t.ibs.aliq / 100);
        Object.assign(x, { ibs_cbs_situacao_tributaria: txt(cen.ibs_cbs_cst), ibs_cbs_classificacao_tributaria: txt(cen.ibs_cbs_classificacao), ibs_cbs_base_calculo: bIC,
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
      notas_referenciadas: notasRef.length ? notasRef : '', volumes: volumesSaida, items
    });
    const somaItens = r2(items.reduce((s, x) => s + num(x.valor_bruto) + num(x.ii_valor) + num(x.ipi_valor) + num(x.valor_outras_despesas), 0));
    if (Math.abs(somaItens - tot.total) > 0.005) P('total', `Total da nota (R$ ${tot.total.toFixed(2)}) não bate com a soma dos itens (R$ ${somaItens.toFixed(2)}).`);
    return { payload, pendencias: pend, avisos, totais: Object.assign(tot, { somaItens, auto: pesoAuto }), empresa, cenario: cen.k, opId: a.opId || (refNota && refNota.op) || '',
      destinatario: { nome: txt(dest.nome, 60), cnpj: soDig(dest.cnpj || dest.cpf), uf: ufDest }, formaIntermedio: null };
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
  /**
   * Totais do cabeçalho (grupo ICMSTot da NF-e; obrigatórios na Focus: valor_produtos, valor_total…),
   * somados dos itens já arredondados — nunca de outra conta, para o total bater com os itens.
   * vNF = produtos − desconto + frete + seguro + outras + II + IPI + IPI devolvido + ICMS ST.
   */
  function totaisCabecalho(items) {
    const its = Array.isArray(items) ? items : [], s = k => r2(its.reduce((a, x) => a + num(x[k]), 0));
    const t = {
      icms_base_calculo: s('icms_base_calculo'), icms_valor_total: s('icms_valor'), icms_valor_total_desonerado: 0,
      fcp_valor_total: 0, icms_base_calculo_st: 0, icms_valor_total_st: 0, fcp_valor_total_st: 0, fcp_valor_total_retido_st: 0,
      valor_produtos: s('valor_bruto'), valor_frete: s('valor_frete'), valor_seguro: s('valor_seguro'), valor_desconto: s('valor_desconto'),
      valor_total_ii: s('ii_valor'), valor_ipi: s('ipi_valor'), valor_ipi_devolvido: 0, valor_pis: s('pis_valor'), valor_cofins: s('cofins_valor'),
      valor_outras_despesas: s('valor_outras_despesas')
    };
    t.valor_total = r2(t.valor_produtos - t.valor_desconto + t.valor_frete + t.valor_seguro + t.valor_outras_despesas + t.valor_total_ii + t.valor_ipi + t.valor_ipi_devolvido + t.icms_valor_total_st);
    if (its.some(x => x.icms_valor_uf_destino != null)) Object.assign(t, { icms_valor_total_uf_destino: s('icms_valor_uf_destino'), fcp_valor_total_uf_destino: s('fcp_valor_uf_destino'), icms_valor_total_uf_remetente: s('icms_valor_uf_remetente') });
    if (its.some(x => x.ibs_cbs_situacao_tributaria)) Object.assign(t, { ibs_cbs_base_calculo: s('ibs_cbs_base_calculo'), ibs_uf_valor_total: s('ibs_uf_valor'), ibs_mun_valor_total: s('ibs_mun_valor'),
      ibs_valor_total: r2(s('ibs_uf_valor') + s('ibs_mun_valor')), cbs_valor_total: s('cbs_valor') });
    return t;
  }
  /** Payload na hora de enviar: data de emissão de agora (fuso de São Paulo) e totais do cabeçalho. */
  function paraEnvio(payload, agora) {
    const d = new Date(agora || Date.now()), sp = new Date(d.getTime() - 3 * 3600 * 1000);
    const quando = sp.toISOString().slice(0, 19) + '-03:00';
    return Object.assign(totaisCabecalho(payload && payload.items), payload, { data_emissao: quando, data_entrada_saida: quando });
  }

  return { montarEntradaDuimp, conferirDuimpCotacao, dataDesembaracoDaOp, PAISES_BACEN, paisBacen,
    CENARIOS_PADRAO, CAMPOS_CENARIO, cenarios, cenarioDe, CONFIG_PADRAO, configNFe, empresaDados, FORMA_INTERMEDIO, formaIntermedio, STATUS_NFE, HOMOLOGACAO_NOME,
    clienteDaOp, notaEntradaDaOp, aliquotasItem, sugerirEntrada, montarNFe, refNFe, proximaRef, podeAcao, aplicarRetornoFocus, mensagemFocus, paraEnvio, totaisCabecalho, r2 };
});
