/* =====================================================================
   WindGate Hub 2.0 — comprovante → lançamento e fechamento trimestral
   (sem tela).

   1. Comprovante lido por IA vira SUGESTÃO: dar baixa num previsto que bate
      ou lançar um novo. Nada é gravado sem uma pessoa confirmar; o mesmo
      comprovante não entra duas vezes.
   2. Fechamento do trimestre (Lucro Real): todo movimento do extrato precisa
      de lançamento, classificação, contraparte, nota vinculada (ou motivo de
      não ter) e comprovante; o saldo do sistema por conta tem de bater com o
      do extrato no fim de cada mês, ao centavo.

   Só campos NOVOS no lançamento (contraparte, notas, semNota, comprovante,
   naturezaContabil, contaId, alteracoes): `comp` e `nf` continuam valendo.

   Mesmo formato de módulo do comex.js: roda no navegador (window.WG) e no
   Node (require), para ser testado.
   ===================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(Object.assign({}, require('./regras.js'), require('./comex.js')));
  else Object.assign(raiz.WG, fabrica(raiz.WG));
})(typeof self !== 'undefined' ? self : this, function (W) {
  const r2 = v => Math.round((+v || 0) * 100 + (v < 0 ? -1e-9 : 1e-9)) / 100;
  const num = v => +v || 0;
  const txt = v => String(v == null ? '' : v).trim();
  const dig = v => String(v || '').replace(/\D/g, '');
  const docOk = d => [11, 14].includes(dig(d).length);
  const valorDe = l => num(l && l.valor);
  const dataBaixa = l => W.soData((l && (l.liquidadoEm || l.vencimento || l.data)) || '');
  const ultimoDia = mes => { const [a, m] = mes.split('-').map(Number); return mes + '-' + String(new Date(a, m, 0).getDate()).padStart(2, '0'); };
  const cfgFiscal = db => ((db && db.hubPainel) || {})._fiscal || {};
  const empOk = (emp, e) => !emp || emp === 'todas' || (e || 'WindGate') === emp;

  /* ---------- Listas editáveis pela diretoria (hubPainel._fiscal) ---------- */
  const MOTIVOS_SEM_NOTA = [
    ['tarifa', 'Tarifa bancária, IOF ou juros bancários'], ['imposto', 'Imposto ou guia (DARF, GNRE, DAE)'],
    ['transferencia', 'Transferência entre contas ou entre SF e JeT'], ['cambio', 'Câmbio (contrato de câmbio, com o número)'],
    ['emprestimo', 'Empréstimo ou pagamento de empréstimo'], ['folha', 'Folha ou pró-labore'],
    ['adiantamento', 'Adiantamento ou numerário de cliente (a nota vem depois)'], ['exterior', 'Pagamento ao exterior (invoice no GED)'],
    ['outro', 'Outro (texto obrigatório)']
  ];
  /* Motivos que só valem com o complemento escrito (número do contrato, explicação). */
  const MOTIVO_EXIGE_OBS = ['outro', 'cambio'];
  function motivosSemNota(db) {
    const c = cfgFiscal(db).motivosSemNota;
    const lista = Array.isArray(c) && c.length ? c.map(x => Array.isArray(x) ? x : [x.k || x.id, x.l || x.nome || x.k]).filter(x => x[0]) : MOTIVOS_SEM_NOTA.slice();
    if (!lista.some(x => x[0] === 'outro')) lista.push(['outro', 'Outro (texto obrigatório)']);
    return lista;
  }
  const NATUREZAS = ['Aluguel e condomínio', 'Folha e pró-labore', 'Contabilidade e jurídico', 'Software e internet', 'Tarifas e juros bancários', 'Impostos e taxas',
    'Viagens e deslocamento', 'Marketing', 'Material e escritório', 'Serviços de terceiros', 'Câmbio', 'Empréstimos', 'Outras'];
  const naturezas = db => { const c = cfgFiscal(db).naturezas; return Array.isArray(c) && c.length ? c.map(String) : NATUREZAS.slice(); };
  const TIPOS_CONTRAPARTE = [['cliente', 'Cliente'], ['fornecedor', 'Fornecedor'], ['banco', 'Banco'], ['governo', 'Governo'], ['socio', 'Sócio'], ['interno', 'Interno (SF ↔ JeT)']];
  /* Banco, governo e conta interna não precisam de CNPJ/CPF para fechar. */
  const SEM_DOCUMENTO = ['banco', 'governo', 'interno'];

  /* ---------- Situação de um lançamento ---------- */
  const classificado = l => W.transferencia(l) || !!(txt(l.categoria) || txt(l.naturezaContabil) || txt(l.custo) || (l.op && l.op !== 'WindGate'));
  function contraparteOk(l) {
    if (W.transferencia(l)) return true;
    const c = l.contraparte || {};
    return !!txt(c.nome) && (SEM_DOCUMENTO.includes(c.tipo) || docOk(c.documento));
  }
  function notaOk(l) {
    if (W.transferencia(l)) return true;
    if ((l.notas || []).some(n => n && (n.notaId || n.chave || n.numero))) return true;
    const s = l.semNota;
    return !!(s && s.motivo && (!MOTIVO_EXIGE_OBS.includes(s.motivo) || txt(s.obs)));
  }
  const comprovanteOk = l => !!(txt(l.comp) || (l.comprovante && txt(l.comprovante.link)));
  function situacao(l) {
    const s = { classificado: classificado(l), contraparte: contraparteOk(l), nota: notaOk(l), comprovante: comprovanteOk(l), notaLink: !!txt(l.nf) && !(l.notas || []).length };
    s.completo = s.classificado && s.contraparte && s.nota && s.comprovante;
    return s;
  }
  const somaNotas = l => r2((l.notas || []).reduce((a, n) => a + num(n && n.valorVinculado), 0));

  /* ---------- Contas bancárias ---------- */
  const contasAtivas = (db, emp) => (cfgFiscal(db).contas || []).filter(c => c && c.ativa !== false && empOk(emp, c.empresa));
  /* Conta bancária tem extrato e saldo para conferir; câmbio e cartão são só onde o pagamento saiu. */
  const TIPOS_CONTA = [['banco', 'Conta bancária'], ['cambio', 'Câmbio'], ['cartao', 'Cartão de crédito'], ['outra', 'Outra']];
  const ehBanco = c => !c.tipo || c.tipo === 'banco';
  const contasBancarias = (db, emp) => contasAtivas(db, emp).filter(ehBanco);
  /**
   * Lançamento sem conta recebe uma: JeT vai para a conta do Itaú da JeT, o resto para a do Santander da SF
   * (ou a única conta bancária da empresa). Só preenche o que está vazio, marca o que foi automático e pode rodar de novo.
   */
  function migrarContas(db, por, agora) {
    const pref = (emp, re) => { const cs = contasBancarias(db).filter(c => (c.empresa || 'WindGate') === emp); return cs.find(c => re.test(c.banco || '')) || (cs.length === 1 ? cs[0] : null); };
    const jet = pref('JeT', /ita[uú]/i), sf = pref('WindGate', /santander/i); let n = 0;
    (db.fin || []).forEach(l => {
      if (!l || l.contaId || W.transferencia(l)) return;
      const c = (l.empresa || 'WindGate') === 'JeT' ? jet : sf; if (!c) return;
      l.contaId = c.id; l.contaAutomatica = true; n++;
      l.alteracoes = (l.alteracoes || []).concat([{ em: agora || new Date().toISOString(), por: por || '', acao: 'conta preenchida: ' + (c.banco || '') + ' ' + (c.nome || '') + ' (automático, revisar)' }]);
    });
    return { preenchidos: n, jet: jet && jet.id, sf: sf && sf.id };
  }
  /** Movimento do extrato pela chave "extratoId:índice". */
  function movimentoDaChave(db, chave) {
    const [eid, i] = String(chave || '').split(':'), e = (db.hubExtratos || []).find(x => x && x._id === eid), t = e && (e.transacoes || [])[+i];
    return t ? { e, t, i: +i } : null;
  }
  /**
   * Vincula vários lançamentos a vários movimentos (1:N, N:1): fica conciliado quando a soma bate, ao centavo,
   * e todos andam no mesmo sentido. Desfaz o vínculo anterior de cada um.
   */
  function vincularGrupo(db, movChaves, lancIds, por, agora) {
    const ms = (movChaves || []).map(c => movimentoDaChave(db, c)), ls = (lancIds || []).map(id => (db.fin || []).find(l => l && l._id === id));
    if (!ms.length || !ls.length || ms.some(x => !x) || ls.some(x => !x)) return { ok: false, msg: 'Escolha ao menos um movimento e um lançamento.' };
    if (ls.some(l => !W.realizado(l))) return { ok: false, msg: 'Só lançamento já realizado é conciliado.' };
    const entrada = ms[0].t.valor > 0;
    if (ms.some(x => (x.t.valor > 0) !== entrada) || ls.some(l => W.ehReceita(l) !== entrada)) return { ok: false, msg: 'Movimentos e lançamentos precisam ir no mesmo sentido (todos entradas ou todos saídas).' };
    const sm = r2(ms.reduce((a, x) => a + Math.abs(num(x.t.valor)), 0)), sl = r2(ls.reduce((a, l) => a + valorDe(l), 0));
    if (Math.abs(sm - sl) >= 0.005) return { ok: false, msg: `As somas não batem: banco ${W.fmtBRL(sm)} × sistema ${W.fmtBRL(sl)}.`, banco: sm, sistema: sl };
    const gid = 'g' + W.novoId(), antigos = new Set(ms.map(x => x.t.grupo).concat(ls.map(l => l.grupoConciliacao)).filter(Boolean));
    antigos.forEach(g => desvincularGrupo(db, g));
    ms.forEach(x => { x.t.grupo = gid; x.t.lancId = null; delete x.t.decisao; });
    ls.forEach(l => { l.grupoConciliacao = gid; if (ms.length === 1 && !l.contaId) l.contaId = ms[0].e.contaId; l.alteracoes = (l.alteracoes || []).concat([{ em: agora || new Date().toISOString(), por: por || '', acao: `conciliado com ${ms.length} movimento(s) do banco, ${W.fmtBRL(sm)}` }]); });
    return { ok: true, grupo: gid, banco: sm, sistema: sl };
  }
  function desvincularGrupo(db, gid) {
    (db.hubExtratos || []).forEach(e => (e && e.transacoes || []).forEach(t => { if (t.grupo === gid) delete t.grupo; }));
    (db.fin || []).forEach(l => { if (l && l.grupoConciliacao === gid) delete l.grupoConciliacao; });
  }
  /** Um movimento com um lançamento, confirmado à mão (inclusive a sugestão de até 10 dias). */
  function vincularUm(db, chave, lancId, por, agora) { return vincularGrupo(db, [chave], [lancId], por, agora); }
  /** Quando não há par exato em 3 dias: o mesmo valor, no mesmo sentido, em até 10 dias. */
  function sugestoesConciliacao(db, fe, item) {
    const livres = fe.movimentos.filter(m => !m.lanc && !m.ignorado), usados = new Set(fe.movimentos.flatMap(m => (m.lancs || (m.lanc ? [m.lanc] : [])).map(l => l._id)));
    if (item.lancId) {
      const l = (db.fin || []).find(x => x && x._id === item.lancId); if (!l) return [];
      return livres.filter(m => Math.abs(Math.abs(m.valor) - valorDe(l)) < 0.01 && (m.valor > 0) === W.ehReceita(l) && Math.abs(W.diasEntre(dataBaixa(l), m.data) || 0) <= 10)
        .map(m => ({ chave: m.chave, data: m.data, memo: m.memo, valor: m.valor, contaId: m.contaId, dias: Math.abs(W.diasEntre(dataBaixa(l), m.data) || 0) })).sort((a, b) => a.dias - b.dias);
    }
    const v = Math.abs(num(item.valor)), entrada = num(item.valor) > 0;
    return (db.fin || []).filter(l => l && W.realizado(l) && !usados.has(l._id) && !W.transferencia(l) && Math.abs(valorDe(l) - v) < 0.01 && W.ehReceita(l) === entrada && Math.abs(W.diasEntre(dataBaixa(l), item.data) || 0) <= 10)
      .map(l => ({ lancId: l._id, data: dataBaixa(l), desc: l.desc || '', op: l.op || '', valor: valorDe(l), dias: Math.abs(W.diasEntre(dataBaixa(l), item.data) || 0) })).sort((a, b) => a.dias - b.dias);
  }
  /** Corrige a data do pagamento (a que a conciliação usa). O vencimento não muda. */
  function corrigirDataPagamento(l, data, por, agora) {
    if (!l || !W.realizado(l)) return { ok: false, msg: 'Só lançamento realizado tem data de pagamento.' };
    if (!W.ehISO(data)) return { ok: false, msg: 'Data inválida.' };
    const antes = l.liquidadoEm; l.liquidadoEm = data;
    l.alteracoes = (l.alteracoes || []).concat([{ em: agora || new Date().toISOString(), por: por || '', acao: `data do pagamento de ${W.dataBR(antes)} para ${W.dataBR(data)}` }]);
    return { ok: true };
  }
  /** Pago por outra conta: o lançamento passa a ser conciliado com o extrato dela. */
  function mudarConta(db, l, contaId, por, agora) {
    const c = contasAtivas(db).find(x => x.id === contaId); if (!l || !c) return { ok: false, msg: 'Conta não encontrada.' };
    l.contaId = c.id; delete l.contaAutomatica; if (l.grupoConciliacao) desvincularGrupo(db, l.grupoConciliacao);
    l.alteracoes = (l.alteracoes || []).concat([{ em: agora || new Date().toISOString(), por: por || '', acao: 'pago pela conta ' + (c.banco || '') + ' ' + (c.nome || '') }]);
    return { ok: true };
  }
  /** Lançamento → conta: o campo `contaId` vence; senão o extrato que o casou; senão a única conta da empresa. */
  function contaDoLanc(db, l, porLanc) {
    if (l.contaId) return l.contaId;
    if (porLanc && porLanc.has(l._id)) return porLanc.get(l._id);
    const cs = contasAtivas(db).filter(c => ehBanco(c) && (c.empresa || 'WindGate') === (l.empresa || 'WindGate'));
    return cs.length === 1 ? cs[0].id : '';
  }
  /** Saldo inicial e final de um extrato (OFX traz o final; o inicial sai da soma dos movimentos). */
  function saldosExtrato(e) {
    const soma = r2((e.transacoes || []).reduce((a, t) => a + num(t.valor), 0));
    const fim = e.saldo == null || e.saldo === '' ? null : r2(e.saldo);
    const ini = e.saldoInicial != null && e.saldoInicial !== '' ? r2(e.saldoInicial) : (fim != null && Array.isArray(e.transacoes) ? r2(fim - soma) : null);
    return { ini, fim, entradas: r2((e.transacoes || []).filter(t => t.valor > 0).reduce((a, t) => a + num(t.valor), 0)), saidas: r2((e.transacoes || []).filter(t => t.valor < 0).reduce((a, t) => a - num(t.valor), 0)) };
  }

  /**
   * Caixa hoje = soma do saldo do ÚLTIMO extrato de cada conta bancária, com a data de cada um.
   * Nunca "recebido − pago" (conta vencida sem baixa não é dinheiro em caixa). Função única: Financeiro, Torre e ficha.
   * Extrato sem conta cadastrada (contaId vazio) entra pela chave banco+conta.
   */
  function caixaHoje(db, empresa, hoje) {
    const h = hoje || W.hojeISO();
    const ext = ((db && db.hubExtratos) || []).filter(e => e && e.saldo != null && e.saldo !== '' && empOk(empresa, e.empresa));
    const chave = e => e.contaId || [e.empresa || 'WindGate', e.banco || '', e.contaNome || ''].join('|');
    const ultimo = {};
    ext.forEach(e => { const k = chave(e), a = ultimo[k]; if (!a || String(e.mes) > String(a.mes) || (e.mes === a.mes && String(e.em || '') > String(a.em || ''))) ultimo[k] = e; });
    const nomes = Object.fromEntries(contasAtivas(db).map(c => [c.id, c]));
    const fimDoMes = m => { const [y, mm] = String(m).split('-').map(Number); return y && mm ? new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10) : ''; };
    const contas = Object.values(ultimo).map(e => {
      const c = nomes[e.contaId] || {}, data = W.ehISO(String(e.ate || '').slice(0, 10)) ? String(e.ate).slice(0, 10) : (W.ehISO(String(e.em || '').slice(0, 10)) && String(e.em).slice(0, 7) === e.mes ? String(e.em).slice(0, 10) : fimDoMes(e.mes));
      return { contaId: e.contaId || '', empresa: e.empresa || c.empresa || 'WindGate', banco: e.banco || c.banco || '', nome: e.contaNome || c.nome || '', mes: e.mes, data: data > h ? h : data, saldo: r2(e.saldo), extratoId: e._id || '' };
    }).sort((a, b) => a.empresa.localeCompare(b.empresa) || a.banco.localeCompare(b.banco));
    const vencidos = ((db && db.fin) || []).filter(l => l && !W.realizado(l) && !W.transferencia(l) && empOk(empresa, l.empresa) && W.vencDe(l) && W.vencDe(l) < h);
    return { total: r2(contas.reduce((a, c) => a + c.saldo, 0)), contas, temExtrato: contas.length > 0, maisAntigo: contas.map(c => c.data).sort()[0] || '',
      vencidosSemBaixa: vencidos.length, distorcido: vencidos.length > 0 };
  }

  /* ---------- Semelhança de nomes (favorecido × fornecedor/cliente) ---------- */
  const PALAVRAS_VAZIAS = new Set(['ltda', 'eireli', 'epp', 'me', 'sa', 'cia', 'comercio', 'servicos', 'industria', 'importacao', 'exportacao', 'do', 'da', 'de', 'dos', 'das', 'e', 'the', 'co', 'limited', 'ltd']);
  const tokens = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length >= 3 && !PALAVRAS_VAZIAS.has(t));
  function parecido(a, b) {
    const A = new Set(tokens(a)), B = tokens(b); if (!A.size || !B.length) return 0;
    const comuns = new Set(B.filter(t => A.has(t))).size;
    return comuns / Math.min(A.size, new Set(B).size);
  }

  /* =====================================================================
     PARTE 1 — Comprovante → sugestão de lançamento
     ===================================================================== */
  const TIPOS_COMPROVANTE = ['pix', 'ted', 'doc', 'boleto', 'transferência entre contas', 'tarifa', 'câmbio', 'outro'];
  /** Normaliza a leitura (da IA ou digitada): campo que não veio fica vazio, nunca inventado. */
  function normalizarLeitura(d) {
    const x = d || {}, p = x.pagador || {}, f = x.favorecido || {};
    const tipo = TIPOS_COMPROVANTE.includes(String(x.tipo || '').toLowerCase()) ? String(x.tipo).toLowerCase() : (x.tipo ? 'outro' : '');
    const conf = {}; Object.entries(x.confianca || {}).forEach(([k, v]) => { if (isFinite(+v)) conf[k] = Math.max(0, Math.min(1, +v)); });
    return { tipo, data: W.ehISO(x.data) ? W.soData(x.data) : '', valor: Math.abs(r2(String(x.valor == null ? '' : x.valor).replace(',', '.'))) || null,
      banco: txt(x.banco), conta: txt(x.conta), pagador: { nome: txt(p.nome), documento: dig(p.documento || p.cnpj || p.cpf) },
      favorecido: { nome: txt(f.nome), documento: dig(f.documento || f.cnpj || f.cpf), banco: txt(f.banco) },
      idTransacao: txt(x.idTransacao), linhaDigitavel: dig(x.linhaDigitavel), descricao: txt(x.descricao).slice(0, 300), legenda: txt(x.legenda).slice(0, 120), confianca: conf };
  }
  function empresaDoDoc(db, doc) {
    const d = dig(doc); if (d.length < 8) return '';
    const cn = Object.assign({ WindGate: '58762606000144' }, cfgFiscal(db).cnpjs || {});
    const e = Object.entries(cn).find(([, c]) => dig(c) && (dig(c) === d || (d.length === 14 && dig(c).slice(0, 8) === d.slice(0, 8))));
    return e ? e[0] : '';
  }
  function empresaDoBanco(db, banco) {
    if (!txt(banco)) return '';
    const cs = contasAtivas(db).filter(c => parecido(c.banco, banco) > 0 || String(banco).toLowerCase().includes(String(c.banco || '').toLowerCase()));
    const emps = [...new Set(cs.map(c => c.empresa || 'WindGate'))];
    return emps.length === 1 ? emps[0] : '';
  }
  const opDoTexto = (db, s) => { const m = /\bOP\s*-?\s*(\d{1,4})\b/i.exec(String(s || '')); if (!m) return ''; const id = 'OP' + m[1]; return (db.ops || []).some(o => o && o.id === id) ? id : ''; };
  /** Texto que acompanha o print (a legenda do WhatsApp, por exemplo "captação abgail op20"):
      vira a descrição do lançamento novo, e a OP citada liga o lançamento à operação. */
  function legendaDoComprovante(db, texto) {
    const t = txt(texto).replace(/\s+/g, ' ').slice(0, 120);
    const m = /\bOP\s*-?\s*(\d{1,4})\b/i.exec(t);
    return { desc: t, op: opDoTexto(db, t), opCitada: m ? 'OP' + m[1] : '' };
  }
  const clienteDaOp = (db, op) => { const o = (db.ops || []).find(x => x && x.id === op); if (!o) return null; return (db.crm || []).find(c => c && (c.empresa === o.cliente || c.nome === o.cliente)) || { empresa: o.cliente }; };

  /** Comprovante já lançado? Mesmo idTransacao, ou mesmo valor + data + favorecido. */
  function duplicadoDe(db, lt, outro) {
    return (db.fin || []).find(l => l && l.comprovante && lt.idTransacao && l.comprovante.idTransacao === lt.idTransacao)
      || (lt.valor && lt.data ? (db.fin || []).find(l => l && W.realizado(l) && Math.abs(valorDe(l) - lt.valor) < 0.01 && dataBaixa(l) === lt.data
        && (parecido(outro.nome, (l.contraparte || {}).nome) > 0 || (outro.documento && dig((l.contraparte || {}).documento) === outro.documento) || parecido(outro.nome, l.desc) > 0)) : null) || null;
  }

  /**
   * Sugestão para um comprovante lido. Devolve { acao: 'baixa'|'novo'|'duplicado', alvoId, campos, avisos }.
   * Só sugere: quem grava é aplicarComprovante, depois da confirmação.
   */
  function sugerirComprovante(db, leitura, opts) {
    const o = opts || {}, lt = normalizarLeitura(leitura), avisos = [], leg = legendaDoComprovante(db, txt(o.legenda) || lt.legenda);
    if (leg.opCitada && !leg.op) avisos.push(`O texto cita ${leg.opCitada}, que não está nas operações: confira a operação.`);
    const eP = empresaDoDoc(db, lt.pagador.documento), eF = empresaDoDoc(db, lt.favorecido.documento);
    const transf = !!(eP && eF) || lt.tipo === 'transferência entre contas';
    let tipo = eF && !eP ? 'Receita' : 'Despesa';
    if (!eP && !eF) { if (lt.tipo !== 'tarifa') avisos.push('Nem o pagador nem o favorecido é SF ou JeT pelo CNPJ: confira se é entrada ou saída.'); }
    const empresa = (tipo === 'Receita' ? eF : eP) || empresaDoBanco(db, lt.banco) || o.empresa || '';
    if (!empresa) avisos.push('Empresa não identificada pela conta de origem: escolha SF ou JeT.');
    const outro = tipo === 'Receita' ? lt.pagador : lt.favorecido;
    const dup = duplicadoDe(db, lt, outro);
    if (dup) return { acao: 'duplicado', alvoId: dup._id, duplicadoDe: { _id: dup._id, data: dataBaixa(dup), desc: dup.desc || '', valor: valorDe(dup) }, leitura: lt, campos: {},
      avisos: [`Comprovante já lançado em ${W.dataBR(dataBaixa(dup))}: ${dup.desc || dup.categoria || ''} (${W.fmtBRL(valorDe(dup))}).`] };
    if (!lt.valor) avisos.push('Valor não lido no comprovante: digite antes de confirmar.');
    if (!lt.data) avisos.push('Data não lida no comprovante: digite antes de confirmar.');

    /* Previsto que bate: mesmo valor (R$ 0,01), vencimento até 5 dias, mesma empresa, nome parecido. */
    const cand = (db.fin || []).filter(l => l && !W.realizado(l) && !W.transferencia(l)
      && (tipo === 'Receita') === W.ehReceita(l) && lt.valor && Math.abs(valorDe(l) - lt.valor) < 0.011
      && (!lt.data || Math.abs(W.diasEntre(W.vencDe(l), lt.data) || 0) <= 5) && (!empresa || (l.empresa || 'WindGate') === empresa))
      .map(l => { const cli = clienteDaOp(db, l.op); const sim = Math.max(parecido(outro.nome, l.desc), parecido(outro.nome, (l.contraparte || {}).nome), cli ? parecido(outro.nome, cli.empresa || cli.nome) : 0,
        outro.documento && (dig((l.contraparte || {}).documento) === outro.documento || (cli && dig(cli.cnpj) === outro.documento)) ? 1 : 0);
        return { l, sim, dias: Math.abs(W.diasEntre(W.vencDe(l), lt.data || W.vencDe(l)) || 0) }; })
      .sort((a, b) => (leg.op ? (b.l.op === leg.op) - (a.l.op === leg.op) : 0) || b.sim - a.sim || a.dias - b.dias);
    const alvo = cand.length === 1 ? cand[0] : (leg.op && cand.find(c => c.l.op === leg.op)) || cand.find(c => c.sim > 0);
    const contraparte = { nome: outro.nome, documento: outro.documento,
      tipo: transf ? 'interno' : lt.tipo === 'tarifa' ? 'banco' : /darf|gnre|\bdae\b|receita federal|sefaz|secretaria da fazenda/i.test(outro.nome + ' ' + lt.descricao) ? 'governo' : tipo === 'Receita' ? 'cliente' : 'fornecedor' };
    const comprov = { tipo: lt.tipo, idTransacao: lt.idTransacao, linhaDigitavel: lt.linhaDigitavel, confianca: lt.confianca };
    if (alvo) {
      if (!alvo.sim) avisos.push('O nome do favorecido não confere com o lançamento previsto: confira antes de dar baixa.');
      const l = alvo.l;
      return { acao: 'baixa', alvoId: l._id, leitura: lt, avisos,
        alvo: { _id: l._id, desc: l.desc || '', op: l.op || '', valor: valorDe(l), vencimento: W.vencDe(l), por: l.por || '' },
        campos: { tipo: l.tipo, valor: lt.valor || valorDe(l), data: lt.data || W.hojeISO(), empresa: l.empresa || empresa || 'WindGate', op: l.op || '', categoria: l.categoria || '',
          desc: l.desc || '', contraparte: (l.contraparte && l.contraparte.nome) ? l.contraparte : contraparte, comprovante: comprov } };
    }
    /* Lançamento novo. */
    const textoTodo = [lt.descricao, outro.nome, lt.favorecido.nome, lt.pagador.nome].join(' ');
    let op = leg.op || opDoTexto(db, textoTodo);
    if (!op && outro.documento) {
      const cli = (db.crm || []).find(c => c && dig(c.cnpj) === outro.documento);
      const ops = cli ? (db.ops || []).filter(x => x && x.cliente === (cli.empresa || cli.nome) && W.ativa(x)) : [];
      if (ops.length === 1) op = ops[0].id;
    }
    const imposto = contraparte.tipo === 'governo';
    const categoria = transf ? 'Transferência' : imposto ? (op ? 'Imposto importação' : 'Imposto geral') : '';
    const desc = (leg.desc || lt.descricao || [lt.tipo ? lt.tipo.toUpperCase() : '', outro.nome].filter(Boolean).join(' · ') || 'Comprovante').slice(0, 120);
    const campos = { tipo, valor: lt.valor, data: lt.data || W.hojeISO(), empresa: empresa || 'WindGate', op: op || 'WindGate', categoria, desc, contraparte, comprovante: comprov,
      custo: op ? W.classeDe({ desc, categoria }) : '', naturezaContabil: !op && lt.tipo === 'tarifa' ? 'Tarifas e juros bancários' : '', transf };
    if (lt.tipo === 'tarifa') campos.semNota = { motivo: 'tarifa', obs: '' };
    else if (transf) campos.semNota = { motivo: 'transferencia', obs: '' };
    else if (imposto) campos.semNota = { motivo: 'imposto', obs: '' };
    if (!op && !transf && lt.tipo !== 'tarifa' && !leg.opCitada) avisos.push('Operação não identificada: escolha a operação ou deixe como despesa da empresa.');
    return { acao: 'novo', alvoId: null, leitura: lt, avisos, campos };
  }

  /**
   * Aplica a sugestão CONFIRMADA por uma pessoa. Devolve { lanc, novo } ou { erro, codigo }.
   * Regras: duplicidade bloqueia; quem só lança não mexe na baixa de outra pessoa.
   */
  function aplicarComprovante(db, s, ctx) {
    const c = ctx || {}, quem = c.quem || '', agora = c.agora || new Date().toISOString(), link = txt(c.link);
    const k = Object.assign({}, (s && s.campos) || {}), lt = normalizarLeitura(s && s.leitura);
    if (!(num(k.valor) > 0)) return { erro: 'Informe o valor.', codigo: 400 };
    if (k.op && W.ehMae((db.ops || []).find(x => x && x.id === k.op))) return { erro: 'O contêiner não recebe lançamento: escolha a filha, ou use Pagamento do contêiner no Custeio dele.', codigo: 409 };
    if (!W.ehISO(k.data)) return { erro: 'Informe a data.', codigo: 400 };
    const outro = k.contraparte || {};
    const dup = duplicadoDe(db, { idTransacao: txt((k.comprovante || {}).idTransacao) || lt.idTransacao, valor: r2(k.valor), data: W.soData(k.data) }, { nome: outro.nome, documento: dig(outro.documento) });
    if (dup && !(s.acao === 'baixa' && dup._id === s.alvoId && !W.realizado(dup))) return { erro: `Comprovante já lançado em ${W.dataBR(dataBaixa(dup))}: ${dup.desc || ''} (${W.fmtBRL(valorDe(dup))}).`, codigo: 409, duplicadoDe: dup._id };
    const comprovante = Object.assign({ link, tipo: lt.tipo, idTransacao: lt.idTransacao, linhaDigitavel: lt.linhaDigitavel, confianca: lt.confianca }, k.comprovante || {},
      { link, lidoPorIA: !!c.lidoPorIA, confirmadoPor: quem, confirmadoEm: agora });
    const contraparte = { nome: txt(outro.nome), documento: dig(outro.documento), tipo: txt(outro.tipo) || (k.tipo === 'Receita' ? 'cliente' : 'fornecedor') };
    const reg = (l, acao) => (l.alteracoes || []).concat([{ em: agora, por: quem, acao }]);
    if (s.acao === 'baixa') {
      const atual = (db.fin || []).find(l => l && l._id === s.alvoId);
      if (!atual) return { erro: 'O lançamento previsto não existe mais.', codigo: 404 };
      if (typeof W.travaFabrica === 'function' && W.travaFabrica(db, atual).bloqueia) return { erro: 'Pagamento à fábrica travado: há filha do contêiner sem recebimento. Só o Samir libera.', codigo: 409 };
      if (W.realizado(atual) && !c.podeAlterarBaixaAlheia && atual.baixaPor && atual.baixaPor !== quem) return { erro: `Este lançamento já foi baixado por ${atual.baixaPor}: só quem pode excluir altera a baixa de outra pessoa.`, codigo: 403 };
      const l = JSON.parse(JSON.stringify(atual));
      W.realizar(l, r2(k.valor), W.soData(k.data));
      l.baixaPor = quem; if (link) l.comp = link;
      l.comprovante = comprovante;
      if (!(l.contraparte && l.contraparte.nome) && contraparte.nome) l.contraparte = contraparte;
      if (k.semNota && k.semNota.motivo && !l.semNota && !(l.notas || []).length) l.semNota = { motivo: k.semNota.motivo, obs: txt(k.semNota.obs) };
      l.alteracoes = reg(l, 'baixa pelo comprovante' + (c.lidoPorIA ? ' (lido por IA)' : ''));
      return { lanc: l, novo: false };
    }
    const l = { _id: c.novoId || W.novoId(), data: W.soData(k.data), vencimento: W.soData(k.data), liquidadoEm: W.soData(k.data), op: txt(k.op) || 'WindGate', tipo: k.tipo === 'Receita' ? 'Receita' : 'Despesa',
      categoria: txt(k.categoria), fixo: false, desc: txt(k.desc).slice(0, 120) || 'Comprovante', valor: r2(k.valor), valorPago: r2(k.valor), valorPrevisto: null, status: 'Realizado',
      empresa: k.empresa === 'JeT' ? 'JeT' : 'WindGate', comp: link, nf: '', por: quem, baixaPor: quem, criadoEm: agora, origem: 'comprovante', contraparte, comprovante };
    if (k.transf) l.transf = true;
    if (txt(k.custo)) l.custo = txt(k.custo);
    if (txt(k.naturezaContabil)) l.naturezaContabil = txt(k.naturezaContabil);
    if (k.contaId) l.contaId = k.contaId;
    if (k.semNota && k.semNota.motivo) l.semNota = { motivo: k.semNota.motivo, obs: txt(k.semNota.obs) };
    l.alteracoes = reg(l, 'lançado pelo comprovante' + (c.lidoPorIA ? ' (lido por IA)' : ''));
    return { lanc: l, novo: true };
  }

  /* =====================================================================
     PARTE 2 — Fechamento do trimestre
     ===================================================================== */
  /** Notas que podem cobrir um lançamento: mesmo CNPJ, valor igual ou parcela, até 30 dias, mesma operação.
      Parcela seguinte de uma nota já em parte vinculada (mesmo CNPJ e operação) vale fora dos 30 dias. */
  function sugerirNotas(db, l) {
    const doc = dig((l.contraparte || {}).documento), d = dataBaixa(l), v = valorDe(l);
    const usado = notaId => r2((db.fin || []).filter(x => x && x._id !== l._id).reduce((a, x) => a + (x.notas || []).filter(n => n && n.notaId === notaId).reduce((s, n) => s + num(n.valorVinculado), 0), 0));
    return (db.hubNotas || []).filter(n => n && (n.empresa || 'WindGate') === (l.empresa || 'WindGate') && !(l.notas || []).some(x => x && x.notaId === n._id)).map(n => {
      const cnpj = doc && [dig(n.emitenteCnpj), dig(n.destCnpj)].includes(doc), mesmaOp = !!(l.op && n.op && l.op === n.op);
      const dias = Math.abs(W.diasEntre(n.data, d) || 0), resta = r2(num(n.valor) - usado(n._id));
      const valorBate = Math.abs(num(n.valor) - v) < 0.01, parcela = v > 0 && v <= resta + 0.005;
      return { nota: n, cnpj, mesmaOp, dias, resta, valorBate, parcela, score: (cnpj ? 4 : 0) + (mesmaOp ? 3 : 0) + (valorBate ? 2 : parcela ? 1 : 0) - dias / 30 };
    }).filter(x => (x.cnpj || x.mesmaOp) && (x.valorBate || x.parcela) && (x.dias <= 30 || (x.cnpj && x.mesmaOp && x.parcela && x.resta < num(x.nota.valor) - 0.005))).sort((a, b) => b.score - a.score);
  }

  /** Transferências entre contas próprias e SF ↔ JeT: as duas pontas se casam (mesmo valor, até 3 dias, sentidos opostos). */
  function casarTransferencias(lista) {
    const ts = lista.filter(l => l && W.transferencia(l) && W.realizado(l)), par = new Map();
    ts.forEach(a => {
      if (par.has(a._id)) return;
      const b = ts.find(x => x !== a && !par.has(x._id) && W.ehReceita(x) !== W.ehReceita(a) && Math.abs(valorDe(x) - valorDe(a)) < 0.01 && Math.abs(W.diasEntre(dataBaixa(x), dataBaixa(a)) || 0) <= 3
        && ((x.empresa || 'WindGate') !== (a.empresa || 'WindGate') || (x.contaId && a.contaId && x.contaId !== a.contaId)));
      if (b) { par.set(a._id, b._id); par.set(b._id, a._id); }
    });
    return { pares: par, semPar: ts.filter(l => !par.has(l._id)) };
  }

  /**
   * Fechamento de um trimestre (ex.: '2026-T3') para uma empresa (ou 'todas').
   * Movimento do banco sem lançamento é casado como na conciliação (mesmo valor,
   * até 3 dias, mesmo sentido) — a mesma regra que o extrato usa ao entrar.
   */
  function fechamento(db, tri, empresa, hoje) {
    const h = hoje || W.hojeISO(), meses = W.mesesDoTrimestre(tri), ini = meses[0] + '-01', fim = ultimoDia(meses[2]);
    const cfg = cfgFiscal(db), contas = contasAtivas(db, empresa), idsContas = new Set((cfg.contas || []).map(c => c && c.id));
    const fin = (db.fin || []).filter(Boolean), porId = new Map(fin.map(l => [l._id, l]));
    const extratosTodos = (db.hubExtratos || []).filter(e => e && meses.includes(e.mes) && empOk(empresa, e.empresa));
    const P = { semLancamento: [], semBanco: [], semClassificacao: [], semContraparte: [], semNota: [], semComprovante: [], notasOrfas: [], faltaExtrato: [], extratoSemMovimentos: [],
      contaSemCadastro: [], lancSemConta: [], transfSemPar: [], saldoDiferente: [], extratoQuebrado: [], grupoDiferente: [] };

    /* Lançamento ↔ movimento: o casado no extrato vale; o que sobrou casa pela regra da conciliação. */
    const usados = new Set(), porLanc = new Map(), movs = [];
    /* Grupos (vários com um): valem quando a soma bate; senão viram pendência e cada lado fica solto. */
    const grupos = new Map();
    extratosTodos.forEach(e => (e.transacoes || []).forEach(t => { if (t.grupo) { const g = grupos.get(t.grupo) || { movs: [], lancs: [] }; g.movs.push({ e, t }); grupos.set(t.grupo, g); } }));
    fin.forEach(l => { if (l.grupoConciliacao && grupos.has(l.grupoConciliacao)) grupos.get(l.grupoConciliacao).lancs.push(l); });
    grupos.forEach((g, gid) => {
      const sm = r2(g.movs.reduce((a, x) => a + Math.abs(num(x.t.valor)), 0)), sl = r2(g.lancs.reduce((a, l) => a + valorDe(l), 0));
      g.ok = g.lancs.length > 0 && Math.abs(sm - sl) < 0.005 && g.lancs.every(W.realizado);
      if (!g.ok) P.grupoDiferente.push({ grupo: gid, banco: sm, sistema: sl, data: g.movs[0].t.data, memo: g.movs.map(x => x.t.memo).join(' + '), valor: r2(sm - sl), lancIds: g.lancs.map(l => l._id) });
      else g.lancs.forEach(l => { usados.add(l._id); porLanc.set(l._id, g.movs[0].e.contaId); });
    });
    extratosTodos.forEach(e => (e.transacoes || []).forEach((t, i) => { if (t.lancId && porId.has(t.lancId) && !t.grupo) { usados.add(t.lancId); porLanc.set(t.lancId, e.contaId); } }));
    const primeiroDoGrupo = new Set();
    extratosTodos.forEach(e => (e.transacoes || []).forEach((t, i) => {
      const g = t.grupo && grupos.get(t.grupo);
      if (g && g.ok) {
        const primeiro = !primeiroDoGrupo.has(t.grupo); primeiroDoGrupo.add(t.grupo);
        movs.push({ chave: e._id + ':' + i, extratoId: e._id, contaId: e.contaId, empresa: e.empresa || 'WindGate', mes: e.mes, data: t.data, memo: t.memo || '', valor: r2(t.valor), fitid: t.id || '', lanc: g.lancs[0], lancs: g.lancs, grupo: t.grupo, primeiroDoGrupo: primeiro, auto: false, ignorado: false });
        return;
      }
      let l = t.lancId && !t.grupo && porId.get(t.lancId) || null, auto = false;
      if (!l) {
        l = fin.find(x => !usados.has(x._id) && W.realizado(x) && (x.empresa || 'WindGate') === (e.empresa || 'WindGate') && (!x.contaId || x.contaId === e.contaId)
          && Math.abs(valorDe(x) - Math.abs(num(t.valor))) < 0.01 && (num(t.valor) < 0) === !W.ehReceita(x) && Math.abs(W.diasEntre(dataBaixa(x), t.data) || 0) <= 3) || null;
        if (l) { usados.add(l._id); porLanc.set(l._id, e.contaId); auto = true; }
      }
      movs.push({ chave: e._id + ':' + i, extratoId: e._id, contaId: e.contaId, empresa: e.empresa || 'WindGate', mes: e.mes, data: t.data, memo: t.memo || '', valor: r2(t.valor), fitid: t.id || '', lanc: l, auto, ignorado: t.decisao === 'ignorado' });
    }));

    /* Extratos: cadastro da conta, meses faltando, sem movimentos. */
    extratosTodos.forEach(e => { if (!idsContas.has(e.contaId)) P.contaSemCadastro.push({ extratoId: e._id, banco: e.banco, conta: e.contaNome, mes: e.mes }); if (!Array.isArray(e.transacoes)) P.extratoSemMovimentos.push({ extratoId: e._id, banco: e.banco, conta: e.contaNome, mes: e.mes }); });
    contas.filter(ehBanco).forEach(c => meses.forEach(m => { if (m < h.slice(0, 7) && !extratosTodos.some(e => e.contaId === c.id && e.mes === m)) P.faltaExtrato.push({ contaId: c.id, banco: c.banco, conta: c.nome, empresa: c.empresa, mes: m }); }));

    /* Cada movimento: lançamento e o que o lançamento precisa ter. */
    let completos = 0;
    movs.forEach(m => {
      const base = { chave: m.chave, extratoId: m.extratoId, contaId: m.contaId, data: m.data, memo: m.memo, valor: m.valor };
      if (!m.lanc) { P.semLancamento.push(Object.assign(base, { ignorado: m.ignorado })); return; }
      if (m.lancs) {
        /* Grupo: cada lançamento é conferido uma vez só, no primeiro movimento dele. */
        const ss = m.lancs.map(situacao);
        if (m.primeiroDoGrupo) m.lancs.forEach((l, k) => { const s = ss[k], item = Object.assign({}, base, { lancId: l._id, desc: l.desc || '', op: l.op || '', valor: W.ehReceita(l) ? valorDe(l) : -valorDe(l), grupo: m.grupo });
          if (!s.classificado) P.semClassificacao.push(item); if (!s.contraparte) P.semContraparte.push(item); if (!s.nota) P.semNota.push(Object.assign({ notaLink: s.notaLink }, item)); if (!s.comprovante) P.semComprovante.push(item); });
        if (ss.every(s => s.completo)) completos++;
        return;
      }
      const s = situacao(m.lanc), item = Object.assign(base, { lancId: m.lanc._id, desc: m.lanc.desc || '', op: m.lanc.op || '', auto: m.auto });
      if (!s.classificado) P.semClassificacao.push(item);
      if (!s.contraparte) P.semContraparte.push(item);
      if (!s.nota) P.semNota.push(Object.assign({ notaLink: s.notaLink }, item));
      if (!s.comprovante) P.semComprovante.push(item);
      if (s.completo) completos++;
    });

    /* Lançamentos realizados no trimestre sem movimento no banco; sem conta; transferências sem a outra ponta. */
    const doTri = fin.filter(l => W.realizado(l) && empOk(empresa, l.empresa) && dataBaixa(l) >= ini && dataBaixa(l) <= fim);
    doTri.forEach(l => {
      const conta = contaDoLanc(db, l, porLanc);
      if (!conta) { P.lancSemConta.push({ lancId: l._id, desc: l.desc || '', valor: valorDe(l), data: dataBaixa(l), empresa: l.empresa || 'WindGate' }); return; }
      if (!usados.has(l._id) && extratosTodos.some(e => e.contaId === conta && e.mes === dataBaixa(l).slice(0, 7) && Array.isArray(e.transacoes)))
        P.semBanco.push({ lancId: l._id, desc: l.desc || '', op: l.op || '', valor: valorDe(l), data: dataBaixa(l), contaId: conta, tipo: l.tipo });
    });
    const tr = casarTransferencias(fin.filter(l => W.realizado(l) && dataBaixa(l) >= W.mesSoma(meses[0], -1) + '-25' && dataBaixa(l) <= fim));
    tr.semPar.filter(l => dataBaixa(l) >= ini && empOk(empresa, l.empresa)).forEach(l => P.transfSemPar.push({ lancId: l._id, desc: l.desc || '', valor: valorDe(l), data: dataBaixa(l), empresa: l.empresa || 'WindGate', tipo: l.tipo }));

    /* Notas do trimestre sem lançamento ("nota órfã"), salvo quando têm motivo registrado. */
    const vinc = new Set(); fin.forEach(l => (l.notas || []).forEach(n => { if (n && n.notaId) vinc.add(n.notaId); if (n && n.chave) vinc.add('ch:' + n.chave); }));
    (db.hubNotas || []).filter(n => n && W.trimestreDe(n.data) === tri && empOk(empresa, n.empresa) && !vinc.has(n._id) && !(n.chave && vinc.has('ch:' + n.chave)) && !(n.semLancamento && n.semLancamento.motivo))
      .forEach(n => P.notasOrfas.push({ notaId: n._id, numero: n.numero || '', tipo: n.tipo || '', emitente: n.emitente || '', destinatario: n.destinatario || '', valor: num(n.valor), data: n.data, op: n.op || '' }));

    /* Saldo por conta e mês: extrato × sistema (abertura do extrato + lançamentos da conta). */
    const porConta = contas.filter(ehBanco).map(c => {
      let abertura = null, anterior = null;
      const linhas = meses.map(m => {
        const e = extratosTodos.find(x => x.contaId === c.id && x.mes === m) || null, s = e ? saldosExtrato(e) : { ini: null, fim: null, entradas: 0, saidas: 0 };
        if (abertura == null && s.ini != null && m === meses[0]) abertura = s.ini;
        if (e && anterior != null && s.ini != null && Math.abs(anterior - s.ini) >= 0.005) P.extratoQuebrado.push({ contaId: c.id, banco: c.banco, conta: c.nome, mes: m, esperado: anterior, veio: s.ini });
        if (s.fim != null) anterior = s.fim;
        const sistema = abertura == null ? null : r2(abertura + fin.filter(l => W.realizado(l) && contaDoLanc(db, l, porLanc) === c.id && dataBaixa(l) >= ini && dataBaixa(l) <= ultimoDia(m))
          .reduce((a, l) => a + (W.ehReceita(l) ? 1 : -1) * valorDe(l), 0));
        const dif = sistema == null || s.fim == null ? null : r2(sistema - s.fim);
        if (dif != null && Math.abs(dif) >= 0.005) P.saldoDiferente.push({ contaId: c.id, banco: c.banco, conta: c.nome, mes: m, extrato: s.fim, sistema, dif });
        return { mes: m, temExtrato: !!e, extratoId: e ? e._id : '', saldoInicial: s.ini, saldoFinal: s.fim, entradas: s.entradas, saidas: s.saidas, sistema, dif };
      });
      return { conta: c, meses: linhas };
    });

    const total = movs.length, qtdPend = Object.values(P).reduce((a, x) => a + x.length, 0);
    return { tri, empresa: empresa || 'todas', meses, contas, porConta, movimentos: movs, pendencias: P, qtdPendencias: qtdPend, total, completos,
      pct: total ? completos / total : 0, pronto: contas.length > 0 && qtdPend === 0, entrega: (((cfg.entregas || {})[tri]) || null) };
  }

  /* Rótulos das pendências (tela e pacote). */
  const PENDENCIAS = [
    ['semLancamento', 'Movimento do banco sem lançamento'], ['semBanco', 'Lançamento realizado que não está no banco'], ['semClassificacao', 'Lançamento sem classificação'],
    ['semContraparte', 'Lançamento sem contraparte (nome e CNPJ/CPF)'], ['semNota', 'Sem nota e sem motivo'], ['semComprovante', 'Sem comprovante'],
    ['notasOrfas', 'Nota do trimestre sem lançamento'], ['faltaExtrato', 'Extrato do mês faltando'], ['extratoSemMovimentos', 'Extrato sem movimentos (envie o OFX)'],
    ['contaSemCadastro', 'Conta do extrato sem cadastro'], ['lancSemConta', 'Lançamento sem conta bancária'], ['transfSemPar', 'Transferência sem a outra ponta'], ['grupoDiferente', 'Vínculo de vários com um que não fecha mais'],
    ['saldoDiferente', 'Saldo do sistema diferente do extrato'], ['extratoQuebrado', 'Extrato não continua o saldo do mês anterior']
  ];

  /* ---------- Planilha do contador: linhas prontas (o servidor só escreve o .xlsx) ---------- */
  function notaTexto(db, l) {
    if (W.transferencia(l) && !(l.notas || []).length) return 'sem nota: transferência';
    if ((l.notas || []).length) return l.notas.map(n => { const r = (db.hubNotas || []).find(x => x && (x._id === n.notaId || (n.chave && x.chave === n.chave))) || {};
      return [({ entrada: 'NF entrada', saida: 'NF saída', servico: 'NFS-e' }[r.tipo] || 'nota'), 'nº ' + (n.numero || r.numero || ''), n.chave || r.chave || '', r.xmlLink || r.pdfLink || ''].filter(Boolean).join(' · '); }).join(' | ');
    if (l.semNota && l.semNota.motivo) { const m = motivosSemNota(db).find(x => x[0] === l.semNota.motivo); return 'sem nota: ' + (m ? m[1] : l.semNota.motivo) + (txt(l.semNota.obs) ? ' — ' + txt(l.semNota.obs) : ''); }
    return txt(l.nf) ? 'nota anexada (link): ' + l.nf : '';
  }
  const COLUNAS_PACOTE = ['Data', 'Histórico do banco', 'Valor', 'Saldo', 'Lançamento', 'Natureza/categoria', 'Operação', 'Cliente/fornecedor', 'CNPJ/CPF', 'Nota fiscal', 'Comprovante', 'Conferido por'];
  function linhasPacote(db, f) {
    const porConta = f.porConta.map(pc => {
      const ab = pc.meses.find(m => m.saldoInicial != null); let saldo = ab ? ab.saldoInicial : 0;
      const movs = f.movimentos.filter(m => m.contaId === pc.conta.id).sort((a, b) => String(a.data).localeCompare(String(b.data)));
      const linhas = movs.map(m => { saldo = r2(saldo + m.valor); const l = m.lanc || {}; const c = l.contraparte || {};
        return [m.data, m.memo, m.valor, saldo, l._id || '', [l.categoria, l.naturezaContabil, l.custo ? W.CLASSE_ROTULO && W.CLASSE_ROTULO[l.custo] || l.custo : ''].filter(Boolean).join(' · ') || (W.transferencia(l) ? 'Transferência' : ''),
          l.op || '', c.nome || (W.transferencia(l) ? 'Transferência interna' : ''), c.documento || '', m.lanc ? notaTexto(db, l) : 'SEM LANÇAMENTO', l.comp || (l.comprovante && l.comprovante.link) || '',
          l.comprovante && l.comprovante.confirmadoPor || l.baixaPor || l.por || '']; });
      return { conta: pc.conta, linhas };
    });
    const resumo = [];
    f.porConta.forEach(pc => pc.meses.forEach(m => resumo.push([`${pc.conta.empresa === 'JeT' ? 'JeT' : 'SF'} · ${pc.conta.banco || ''} ${pc.conta.nome || ''}`.trim(), m.mes, m.entradas, m.saidas, m.saldoFinal, m.sistema, m.dif])));
    const vincula = n => (db.fin || []).filter(l => l && (l.notas || []).some(x => x && (x.notaId === n._id || (x.chave && x.chave === n.chave)))).map(l => l._id).join(', ');
    const notas = (db.hubNotas || []).filter(n => n && W.trimestreDe(n.data) === f.tri && empOk(f.empresa, n.empresa)).sort((a, b) => String(a.data).localeCompare(String(b.data)))
      .map(n => [n.data, n.tipo || '', n.numero || '', n.chave || '', n.emitente || '', n.emitenteCnpj || '', n.destinatario || '', n.destCnpj || '', num(n.valor), vincula(n) || (n.semLancamento && n.semLancamento.motivo ? 'sem lançamento: ' + n.semLancamento.motivo : ''), n.xmlLink || '', n.pdfLink || '']);
    return { porConta, resumo, notas };
  }

  /* =====================================================================
     Financeiro em 3 telas (Parte 3): Carteira · Caixa do mês · Indicadores.
     Uma função por tela, usada no Financeiro e na Torre: a mesma conta em todo lugar.
     ===================================================================== */
  const somaV = xs => xs.reduce((a, l) => a + W.valorDe(l), 0);
  const ehEstudo = o => /^(ESTUDO|EXPO)/i.test((o && o.id) || '');
  const CAIXA_MINIMO_PADRAO = 34000;
  const caixaMinimo = db => { const v = +((((db || {}).hubPainel || {})._financeiro || {}).caixaMinimo); return v > 0 ? v : CAIXA_MINIMO_PADRAO; };
  const diaMais = (d, n) => { const x = new Date(String(d).slice(0, 10) + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const fimDoMes = d => { const [a, m] = String(d).slice(0, 7).split('-').map(Number); return new Date(Date.UTC(a, m, 0, 12)).toISOString().slice(0, 10); };
  /** Última passagem da operação para uma das etapas (data). */
  const passouPara = (db, id, etapas) => (db.opStatusHist || []).filter(x => x && x.op === id && etapas.includes(x.para) && x.em).map(x => String(x.em).slice(0, 10)).sort().pop() || '';
  /** FCL (contêiner cheio): pela cotação da operação (ou da mãe). */
  function ehFCL(db, o) { const q = W.cotacaoDaOp ? W.cotacaoDaOp(db, o) : null; const m = q && q.fields && q.fields.modalCntr; return m ? m !== 'LCL' : true; }

  /**
   * Carteira de operações. Por operação: recebido = receita − falta receber; pago = recebido − caixa hoje;
   * falta pagar = custo − pago; lucro a realizar = falta receber − falta pagar; lucro garantido = recebido − custo
   * só com tudo pago. Contêiner compartilhado = uma linha da mãe (filhas em `filhas`), sem contar em dobro.
   * filtro: 'andamento' (padrão) · 'mes' (concluídas no mês) · 'todas'.
   */
  function carteiraOps(db, empresa, filtro, hoje) {
    const h = hoje || W.hojeISO(), f = filtro || 'andamento', emp = empresa || 'todas';
    const ops = Object.fromEntries((db.ops || []).filter(o => o && o.id).map(o => [o.id, o]));
    const rs = Object.fromEntries(W.resultadoPorOp(db, emp).map(r => [r.op, r]));
    const abertos = (db.fin || []).filter(l => l && W.daOperacao(l) && !W.realizado(l) && !W.transferencia(l) && !W.ehEmprestimo(l) && W.empresaOk(l, emp));
    const linha = (id, ids) => {
      const zs = ids.map(i => rs[i]).filter(Boolean);
      const s = k => zs.reduce((a, r) => a + (r[k] || 0), 0);
      const receita = s('receita'), custo = s('despesa'), lucro = receita - custo, caixa = s('caixa'), faltaReceber = s('rp');
      const recebido = receita - faltaReceber, pago = recebido - caixa, faltaPagar = custo - pago, lucroRealizar = faltaReceber - faltaPagar;
      const garantido = pago >= custo - 0.005 && custo > 0 ? recebido - custo : 0;
      const prox = abertos.filter(l => ids.includes(l.op)).sort((a, b) => W.vencDe(a).localeCompare(W.vencDe(b)));
      let proximo = null;
      if (prox.length) { const d = W.vencDe(prox[0]), t = W.ehReceita(prox[0]), mesmo = prox.filter(l => W.vencDe(l) === d && W.ehReceita(l) === t);
        proximo = { data: d, receber: t, valor: somaV(mesmo), desc: mesmo.length > 1 ? `${mesmo.length} lançamentos` : (prox[0].descCliente || prox[0].desc || ''), vencido: d < h }; }
      const o = ops[id] || {}, margem = receita ? lucro / receita : null;
      return { op: id, cliente: o.cliente || '', status: o.status || '', receita, custo, lucro, margem, caixa, recebido, pago, faltaReceber, faltaPagar, lucroRealizar, garantido, proximo,
        abaixo: (margem != null && margem < 0.10) || (ehFCL(db, o) && lucro < 30000 && receita > 0) };
    };
    const noFiltro = o => {
      if (f === 'todas') return true;   // inclui estudo e operação sem cadastro (Resultado por operação mostra tudo)
      if (!o || ehEstudo(o)) return false;
      if (f === 'mes') return ['entregue', 'concluida'].includes(o.status) && passouPara(db, o.id, ['entregue', 'concluida']).slice(0, 7) === h.slice(0, 7);
      return W.emAndamento(o);
    };
    const grupos = {};
    Object.keys(rs).forEach(id => { const o = ops[id]; const chave = o && o.maeId && ops[o.maeId] ? o.maeId : id; (grupos[chave] = grupos[chave] || new Set([chave])).add(id); });
    const linhas = Object.entries(grupos).filter(([id]) => noFiltro(ops[id])).map(([id, set]) => {
      const ids = [...set], filhasIds = ids.filter(i => i !== id), mae = W.ehMae(ops[id]) || filhasIds.length > 0;
      const l = linha(id, ids);
      if (mae) { l.filhas = filhasIds.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).map(i => linha(i, [i])); l.cliente = l.filhas.map(x => (ops[x.op] || {}).cliente).filter(Boolean).join(' + ') || l.cliente; l.mae = true; }
      return l;
    }).filter(l => l.receita || l.custo).sort((a, b) => b.lucro - a.lucro);
    const t = k => linhas.reduce((a, l) => a + l[k], 0);
    const total = { n: linhas.length, receita: t('receita'), custo: t('custo'), lucro: t('lucro'), caixa: t('caixa'), faltaReceber: t('faltaReceber'), faltaPagar: t('faltaPagar'), lucroRealizar: t('lucroRealizar'), garantido: t('garantido') };
    total.margem = total.receita ? total.lucro / total.receita : null;
    return { linhas, total, abaixo: linhas.filter(l => l.abaixo) };
  }

  /**
   * Caixa do mês: caixa hoje (extratos) + a receber − a pagar das operações − a pagar fixas = fim do mês.
   * Com operação = operação; sem operação = fixa. Transferências SF ↔ JeT ficam fora. Vencido sem baixa entra
   * como de hoje (ainda vai entrar/sair) e deixa o caixa "pode estar distorcido".
   */
  function caixaDoMes(db, empresa, hoje) {
    const h = hoje || W.hojeISO(), emp = empresa || 'todas', fim = fimDoMes(h), fimSeg = fimDoMes(diaMais(fim, 1)), minimo = caixaMinimo(db);
    const cx = caixaHoje(db, emp, h);
    const abertos = (db.fin || []).filter(l => l && !W.realizado(l) && !W.transferencia(l) && W.empresaOk(l, emp));
    const ateFim = abertos.filter(l => W.vencDe(l) <= fim);
    const rec = ateFim.filter(W.ehReceita), pagOps = ateFim.filter(l => !W.ehReceita(l) && W.daOperacao(l)), pagFix = ateFim.filter(l => !W.ehReceita(l) && !W.daOperacao(l));
    const vencidos = abertos.filter(l => W.vencDe(l) < h);
    const receber = somaV(rec), pagarOps = somaV(pagOps), pagarFixas = somaV(pagFix), base = cx.temExtrato ? cx.total : 0;
    const fimMes = base + receber - pagarOps - pagarFixas;
    /* Linha do caixa dia a dia até o fim do mês seguinte; barras por semana. */
    const porDia = {};
    abertos.filter(l => W.vencDe(l) <= fimSeg).forEach(l => { const d = W.vencDe(l) < h ? h : W.vencDe(l); porDia[d] = (porDia[d] || 0) + (W.ehReceita(l) ? 1 : -1) * W.valorDe(l); });
    const serie = []; let saldo = base, cruza = null;
    for (let d = h; d <= fimSeg; d = diaMais(d, 1)) { saldo += porDia[d] || 0; serie.push({ data: d, saldo }); if (cruza == null && saldo < minimo) cruza = d; }
    const semanas = [];
    for (let d = h; d <= fimSeg; d = diaMais(d, 7)) {
      const ate = diaMais(d, 6), noIntervalo = l => { const v = W.vencDe(l) < h ? h : W.vencDe(l); return v >= d && v <= ate; };
      const xs = abertos.filter(noIntervalo); semanas.push({ de: d, ate, entra: somaV(xs.filter(W.ehReceita)), sai: somaV(xs.filter(l => !W.ehReceita(l))) });
    }
    const sete = abertos.filter(l => W.vencDe(l) >= h && W.vencDe(l) <= diaMais(h, 6)).sort((a, b) => W.vencDe(a).localeCompare(W.vencDe(b)));
    /* Saídas do mês: quanto já saiu (pago no mês) e o total do mês (pago + em aberto até o fim). */
    const mes = h.slice(0, 7), pagoNoMes = (db.fin || []).filter(l => l && W.realizado(l) && !W.ehReceita(l) && !W.transferencia(l) && W.empresaOk(l, emp) && String(l.liquidadoEm || W.vencDe(l)).slice(0, 7) === mes);
    const saidas = k => { const pg = somaV(pagoNoMes.filter(k)), ab = somaV(abertos.filter(l => !W.ehReceita(l) && k(l) && W.vencDe(l).slice(0, 7) <= mes)); return { pago: pg, total: pg + ab }; };
    return { hoje: h, fim, caixa: cx, receber, receberVencido: somaV(rec.filter(l => W.vencDe(l) < h)), nReceber: rec.length, pagarOps, pagarFixas, fimMes, minimo, abaixoMinimo: fimMes < minimo,
      vencidos: { n: vencidos.length, pagamentos: vencidos.filter(l => !W.ehReceita(l)).length, recebimentos: vencidos.filter(W.ehReceita).length, valor: somaV(vencidos) },
      distorcido: vencidos.length > 0, serie, semanas, cruzaMinimo: cruza, proximos7: sete.slice(0, 10), nProximos7: sete.length,
      saidasMes: { operacoes: saidas(W.daOperacao), fixas: saidas(l => !W.daOperacao(l)) } };
  }

  /**
   * Indicadores de gestão (12 cartões, cada um com valor, meta e alerta) e as séries dos 3 gráficos.
   * Sem dado para calcular: valor null (a tela mostra "—", nunca um número inventado).
   */
  function indicadoresGestao(db, empresa, hoje, ptaxHoje) {
    const h = hoje || W.hojeISO(), emp = empresa || 'todas', mes = h.slice(0, 7);
    const s = W.saudeFinanceira(db, h, emp), fixas = s.fixasMes || 0;
    const ops = Object.fromEntries((db.ops || []).filter(o => o && o.id).map(o => [o.id, o]));
    const rs = Object.fromEntries(W.resultadoPorOp(db, emp).map(r => [r.op, r]));
    const contratoNoMes = m => W.fechadasNoMes(db, m).filter(id => rs[id]);
    const lucroMes = m => contratoNoMes(m).reduce((a, id) => a + rs[id].resultado, 0);
    const receitaMes = m => contratoNoMes(m).reduce((a, id) => a + rs[id].receita, 0);
    const meses12 = W.mesesAte(mes, 12), ult3 = W.mesesAte(mes, 3);
    const lucroFechado = lucroMes(mes);
    const rec3 = ult3.reduce((a, m) => a + receitaMes(m), 0), luc3 = ult3.reduce((a, m) => a + lucroMes(m), 0), margem3 = rec3 ? luc3 / rec3 : null;
    const cart = carteiraOps(db, emp, 'andamento', h);
    /* Concluídas: custo real (despesas lançadas) × custo da cotação. */
    const concl = Object.values(ops).filter(o => ['entregue', 'concluida'].includes(o.status) && !W.ehMae(o) && !ehEstudo(o) && rs[o.id]);
    const prevReal = concl.map(o => { const q = W.cotacaoDaOp ? W.cotacaoDaOp(db, o) : null, c = q && W.custoCotacao ? W.custoCotacao(q) : null; return c && c.total > 0 ? { op: o.id, previsto: c.total, real: rs[o.id].despesa } : null; }).filter(Boolean);
    const pv = prevReal.reduce((a, x) => a + x.previsto, 0), rl = prevReal.reduce((a, x) => a + x.real, 0), desvio = pv ? rl / pv - 1 : null;
    const exp = W.exposicaoCambio ? W.exposicaoCambio(db, ptaxHoje, h) : null, exposicao = exp && exp.impactoSemContrato != null ? exp.impactoSemContrato : null;
    const lim3 = W.mesesAte(mes, 3)[0] + '-01';
    const prazos = Object.values(ops).filter(o => !W.ehMae(o) && !ehEstudo(o)).map(o => { const e = passouPara(db, o.id, ['entregue', 'concluida']), c = W.dataContratoDaOp ? W.dataContratoDaOp(db, o) : ''; return e && e >= lim3 && c ? W.diasEntre(c, e) : null; }).filter(x => x != null && x >= 0);
    const prazoMedio = prazos.length ? Math.round(prazos.reduce((a, b) => a + b, 0) / prazos.length) : null;
    const abertasR = (db.fin || []).filter(l => l && W.ehReceita(l) && !W.realizado(l) && !W.transferencia(l) && !W.ehEmprestimo(l) && W.empresaOk(l, emp));
    const totR = somaV(abertasR), venc5 = somaV(abertasR.filter(l => (W.diasEntre(W.vencDe(l), h) || 0) > 5)), inad = totR ? venc5 / totR : null;
    const crm = W.indicadoresCrm ? W.indicadoresCrm(db, h, 90) : null;
    const propostas = (db.crmOps || []).filter(n => n && W.negocioAberto && W.negocioAberto(n) && W.faseDe && W.faseDe(n) === 'proposta');
    const funil = crm ? propostas.reduce((a, n) => a + (+n.valor || 0), 0) * (crm.conversao != null ? crm.conversao : 0.5) : null;
    const d = W.dre(db, mes, emp), porSocio = d && d.porSocio != null ? d.porSocio : null;
    const atrasados = (db.fin || []).filter(l => l && !W.ehReceita(l) && !W.realizado(l) && W.empresaOk(l, emp) && W.vencDe(l) < h && (W.ehEmprestimo(l) || /imposto|tribut|inss|dctf|darf|das\b|fgts/i.test((l.categoria || '') + ' ' + (l.naturezaContabil || '') + ' ' + (l.desc || ''))));
    const impVenc = atrasados.filter(l => !W.ehEmprestimo(l));
    const cor = (ruim, atencao) => (ruim ? 'vermelho' : atencao ? 'ambar' : 'verde');
    const cards = [
      { k: 'lucroMes', l: 'Lucro bruto fechado no mês', v: lucroFechado, tipo: 'brl', meta: fixas ? 2 * fixas : null, ctx: fixas ? 'meta 2× fixas' : 'contratos do mês', cor: fixas ? cor(lucroFechado < 2 * fixas) : 'neutro', ir: 'resop' },
      { k: 'equilibrio', l: 'Ponto de equilíbrio', v: fixas && margem3 > 0 ? fixas / margem3 : null, tipo: 'brl', ctx: 'vender por mês para empatar', cor: 'neutro' },
      { k: 'margem3', l: 'Margem média s/ receita', v: margem3, tipo: 'pct', meta: 0.15, ctx: '3 meses · meta 15%', cor: margem3 == null ? 'neutro' : cor(margem3 < 0.15) },
      { k: 'abaixo', l: 'Ops abaixo do mínimo', v: cart.abaixo.length, tipo: 'n', ctx: cart.abaixo.slice(0, 3).map(x => x.op).join(' · ') || 'nenhuma', cor: cor(cart.abaixo.length > 0), ir: 'carteira' },
      { k: 'desvio', l: 'Desvio previsto × real', v: desvio, tipo: 'pctSinal', meta: 0.05, ctx: `${prevReal.length} concluída(s) · limite +5%`, cor: desvio == null ? 'neutro' : cor(desvio > 0.05) },
      { k: 'exposicao', l: 'Exposição cambial', v: exposicao, tipo: 'brl', meta: 20000, ctx: exp ? `US$ ${Math.round(exp.usdSemContrato || 0).toLocaleString('pt-BR')} sem câmbio` : 'sem PTAX', cor: exposicao == null ? 'neutro' : cor(exposicao > 20000), ir: 'cambio' },
      { k: 'prazo', l: 'Prazo médio', v: prazoMedio, tipo: 'dias', meta: 110, ctx: 'contrato → entrega · 3 meses', cor: prazoMedio == null ? 'neutro' : cor(prazoMedio > 110) },
      { k: 'inad', l: 'Inadimplência', v: inad, tipo: 'pct', meta: 0.10, ctx: 'vencido +5 dias ÷ a receber', cor: inad == null ? 'neutro' : cor(inad > 0.10), ir: 'contas' },
      { k: 'concentracao', l: 'Concentração', v: s.concentracaoTop5 || null, tipo: 'pct', meta: 0.60, ctx: '5 maiores clientes · 12 meses', cor: s.concentracaoTop5 == null ? 'neutro' : cor(s.concentracaoTop5 > 0.60) },
      { k: 'funil', l: 'Funil ponderado', v: funil, tipo: 'brl', meta: fixas ? 2 * fixas : null, ctx: `${propostas.length} proposta(s) × conversão 3 meses`, cor: funil == null || !fixas ? 'neutro' : cor(funil < 2 * fixas), ir: 'crm' },
      { k: 'socio', l: 'Lucro por sócio no mês', v: porSocio, tipo: 'brl', ctx: 'lucro antes do IR ÷ 2', cor: 'neutro', ir: 'fin' },
      { k: 'atraso', l: 'Impostos e dívidas em atraso', v: somaV(atrasados), tipo: 'brl', ctx: `${impVenc.length} imposto(s) · ${atrasados.length - impVenc.length} empréstimo(s)`, cor: cor(impVenc.length > 0, atrasados.length > 0), ir: 'contas' }];
    const graficos = {
      lucroFixas: meses12.map(m => ({ mes: m, lucro: lucroMes(m), fixas: (s.porMes.find(x => x.mes === m) || {}).despesas || 0 })),
      margemMes: meses12.map(m => { const r = receitaMes(m); return { mes: m, margem: r ? lucroMes(m) / r : null }; }),
      previstoReal: prevReal.slice(-12) };
    return { cards, graficos, fixasMes: fixas };
  }
  /** Caixa mínimo (Configurações). */
  function salvarCaixaMinimo(db, valor, por, agora) {
    const v = +valor; if (!(v >= 0)) return { ok: false, msg: 'Valor inválido.' };
    db.hubPainel = db.hubPainel || {}; db.hubPainel._financeiro = Object.assign({}, db.hubPainel._financeiro, { caixaMinimo: v, por: por || '', em: agora || new Date().toISOString() });
    return { ok: true };
  }

  return { carteiraOps, caixaDoMes, indicadoresGestao, caixaMinimo, salvarCaixaMinimo, CAIXA_MINIMO_PADRAO, fimDoMes, caixaHoje, TIPOS_CONTA, ehBanco, contasBancarias, migrarContas, movimentoDaChave, vincularGrupo, desvincularGrupo, vincularUm, sugestoesConciliacao, corrigirDataPagamento, mudarConta, MOTIVOS_SEM_NOTA, MOTIVO_EXIGE_OBS, motivosSemNota, NATUREZAS, naturezas, TIPOS_CONTRAPARTE, SEM_DOCUMENTO, TIPOS_COMPROVANTE,
    situacaoLanc: situacao, contraparteOk, notaOk, comprovanteOk, classificado, somaNotas, contasAtivas, contaDoLanc, saldosExtrato, parecido,
    normalizarLeitura, empresaDoDoc, sugerirComprovante, legendaDoComprovante, aplicarComprovante, sugerirNotas, casarTransferencias, fechamento, PENDENCIAS,
    notaTexto, COLUNAS_PACOTE, linhasPacote };
});
