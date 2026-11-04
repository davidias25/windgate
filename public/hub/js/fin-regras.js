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
  /** Lançamento → conta: o campo `contaId` vence; senão o extrato que o casou; senão a única conta da empresa. */
  function contaDoLanc(db, l, porLanc) {
    if (l.contaId) return l.contaId;
    if (porLanc && porLanc.has(l._id)) return porLanc.get(l._id);
    const cs = contasAtivas(db).filter(c => (c.empresa || 'WindGate') === (l.empresa || 'WindGate'));
    return cs.length === 1 ? cs[0].id : '';
  }
  /** Saldo inicial e final de um extrato (OFX traz o final; o inicial sai da soma dos movimentos). */
  function saldosExtrato(e) {
    const soma = r2((e.transacoes || []).reduce((a, t) => a + num(t.valor), 0));
    const fim = e.saldo == null || e.saldo === '' ? null : r2(e.saldo);
    const ini = e.saldoInicial != null && e.saldoInicial !== '' ? r2(e.saldoInicial) : (fim != null && Array.isArray(e.transacoes) ? r2(fim - soma) : null);
    return { ini, fim, entradas: r2((e.transacoes || []).filter(t => t.valor > 0).reduce((a, t) => a + num(t.valor), 0)), saidas: r2((e.transacoes || []).filter(t => t.valor < 0).reduce((a, t) => a - num(t.valor), 0)) };
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
      contaSemCadastro: [], lancSemConta: [], transfSemPar: [], saldoDiferente: [], extratoQuebrado: [] };

    /* Lançamento ↔ movimento: o casado no extrato vale; o que sobrou casa pela regra da conciliação. */
    const usados = new Set(), porLanc = new Map(), movs = [];
    extratosTodos.forEach(e => (e.transacoes || []).forEach((t, i) => { if (t.lancId && porId.has(t.lancId)) { usados.add(t.lancId); porLanc.set(t.lancId, e.contaId); } }));
    extratosTodos.forEach(e => (e.transacoes || []).forEach((t, i) => {
      let l = t.lancId && porId.get(t.lancId) || null, auto = false;
      if (!l) {
        l = fin.find(x => !usados.has(x._id) && W.realizado(x) && (x.empresa || 'WindGate') === (e.empresa || 'WindGate') && (!x.contaId || x.contaId === e.contaId)
          && Math.abs(valorDe(x) - Math.abs(num(t.valor))) < 0.01 && (num(t.valor) < 0) === !W.ehReceita(x) && Math.abs(W.diasEntre(dataBaixa(x), t.data) || 0) <= 3) || null;
        if (l) { usados.add(l._id); porLanc.set(l._id, e.contaId); auto = true; }
      }
      movs.push({ chave: e._id + ':' + i, extratoId: e._id, contaId: e.contaId, empresa: e.empresa || 'WindGate', mes: e.mes, data: t.data, memo: t.memo || '', valor: r2(t.valor), fitid: t.id || '', lanc: l, auto, ignorado: t.decisao === 'ignorado' });
    }));

    /* Extratos: cadastro da conta, meses faltando, sem movimentos. */
    extratosTodos.forEach(e => { if (!idsContas.has(e.contaId)) P.contaSemCadastro.push({ extratoId: e._id, banco: e.banco, conta: e.contaNome, mes: e.mes }); if (!Array.isArray(e.transacoes)) P.extratoSemMovimentos.push({ extratoId: e._id, banco: e.banco, conta: e.contaNome, mes: e.mes }); });
    contas.forEach(c => meses.forEach(m => { if (m < h.slice(0, 7) && !extratosTodos.some(e => e.contaId === c.id && e.mes === m)) P.faltaExtrato.push({ contaId: c.id, banco: c.banco, conta: c.nome, empresa: c.empresa, mes: m }); }));

    /* Cada movimento: lançamento e o que o lançamento precisa ter. */
    let completos = 0;
    movs.forEach(m => {
      const base = { chave: m.chave, extratoId: m.extratoId, contaId: m.contaId, data: m.data, memo: m.memo, valor: m.valor };
      if (!m.lanc) { P.semLancamento.push(Object.assign(base, { ignorado: m.ignorado })); return; }
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
    const porConta = contas.map(c => {
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
    ['contaSemCadastro', 'Conta do extrato sem cadastro'], ['lancSemConta', 'Lançamento sem conta bancária'], ['transfSemPar', 'Transferência sem a outra ponta'],
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

  return { MOTIVOS_SEM_NOTA, MOTIVO_EXIGE_OBS, motivosSemNota, NATUREZAS, naturezas, TIPOS_CONTRAPARTE, SEM_DOCUMENTO, TIPOS_COMPROVANTE,
    situacaoLanc: situacao, contraparteOk, notaOk, comprovanteOk, classificado, somaNotas, contasAtivas, contaDoLanc, saldosExtrato, parecido,
    normalizarLeitura, empresaDoDoc, sugerirComprovante, legendaDoComprovante, aplicarComprovante, sugerirNotas, casarTransferencias, fechamento, PENDENCIAS,
    notaTexto, COLUNAS_PACOTE, linhasPacote };
});
