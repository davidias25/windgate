/* =====================================================================
   WindGate Hub 2.0 — Torres por função (Partes 4 e 4B do prompt de 18/11). Sem tela.

   Samir fiscaliza: números do negócio, o que trava operação ou dinheiro e se a equipe cumpre prazo.
   Davi, Ívina e Matheus têm o mesmo desenho, com os números e os itens da função de cada um.
   - travandoAgora: o que trava operação, dinheiro ou indica erro, com o R$ em jogo, ordenado pelo valor.
   - equipeHoje, porEtapa, proximos15, lancamentosVencidos (escada do Matheus: +3 dias → Davi → Samir).
   - CARDS e BLOCOS por função, com a lista permitida pelo perfil (Ívina nunca vê custo, margem ou resultado)
     e a personalização salva por usuário (hubPainel['_torre2_<usuário>']).
   ===================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    const R = n => { try { return require('./' + n); } catch (e) { return {}; } };
    module.exports = fabrica(Object.assign({}, R('regras.js'), R('comex.js'), R('cotacao-regras.js'), R('cambio-regras.js'), R('contrato-regras.js'), R('fin-regras.js'), R('agenda-regras.js'), R('tarefas-auto.js')));
  } else Object.assign(raiz.WG, fabrica(raiz.WG));
})(typeof self !== 'undefined' ? self : this, function (W) {
  const r2 = v => Math.round((+v || 0) * 100) / 100;
  const soma = xs => xs.reduce((a, l) => a + W.valorDe(l), 0);
  const diaMais = (d, n) => { const x = new Date(String(d).slice(0, 10) + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const dias = (de, ate) => W.diasEntre(String(de).slice(0, 10), String(ate).slice(0, 10)) || 0;
  const respDe = o => String((o && o.resp) || '').trim();
  const FUNCOES = { samir: 'Samir', davi: 'Davi', ivina: 'Ívina', matheus: 'Matheus' };
  const FUNCAO_DO_PERFIL = { diretoria: 'samir', operacoes: 'davi', documentos: 'ivina', frete: 'matheus' };
  const funcaoDoUsuario = (db, k) => FUNCAO_DO_PERFIL[W.perfilDe(db, k).id] || null;
  /** Abas que a pessoa vê: Samir vê todas; Davi, a dele e as do time; os demais, só a própria. */
  function abasVisiveis(db, k) {
    const f = funcaoDoUsuario(db, k);
    if (f === 'samir') return ['samir', 'davi', 'ivina', 'matheus'];
    if (f === 'davi') return ['davi', 'ivina', 'matheus'];
    return f ? [f] : [];
  }
  const cfgTarefas = db => (W.configTarefas ? W.configTarefas(db).prazos : { diasParaSamir: 3 });

  /* ---------- Lançamentos vencidos sem baixa (Torre do Matheus) ---------- */
  /** Do mais antigo para o mais novo. `nivel`: matheus (até 3 dias) → davi (+3 sem baixa nem aviso) → samir (+3 + dias para o Samir). */
  function lancamentosVencidos(db, hoje) {
    const h = hoje || W.hojeISO(), lim = cfgTarefas(db).diasParaSamir || 3;
    return (db.fin || []).filter(l => l && !W.realizado(l) && !W.transferencia(l) && W.vencDe(l) && W.vencDe(l) < h)
      .sort((a, b) => W.vencDe(a).localeCompare(W.vencDe(b)))
      .map(l => { const d = dias(W.vencDe(l), h), avisado = !!l.cobradoSamirEm;
        return { l, dias: d, avisado, nivel: avisado ? 'avisado' : d > 3 + lim ? 'samir' : d > 3 ? 'davi' : 'matheus' }; });
  }
  /** "Não pago · avisar Samir": recado para o Samir com o lançamento, e o item marcado como cobrado (com a data). */
  function avisarSamirLanc(db, l, por, agora) {
    if (!l) return { ok: false, msg: 'Lançamento não encontrado.' };
    const t = agora || new Date().toISOString(), rec = W.ehReceita(l);
    l.cobradoSamirEm = t; l.cobradoSamirPor = por || '';
    if (!Array.isArray(db.hubRecados)) db.hubRecados = [];
    const r = { _id: W.novoId(), texto: `${rec ? 'Não recebido' : 'Não pago'}: ${l.desc || l.categoria || 'lançamento'} · ${W.fmtBRL(+l.valor || 0)} · venceu ${W.dataBR(W.vencDe(l))}`, para: 'samir', prio: 'alta', ate: '',
      op: W.daOperacao(l) ? l.op : '', lancId: l._id, tipo: 'nao-pago', por: por || '', em: t, feito: {} };
    db.hubRecados.unshift(r);
    return { ok: true, recado: r };
  }

  /* ---------- Travando agora ---------- */
  /**
   * Itens que travam operação, dinheiro, ou indicam erro. Cada um: { k, titulo, sub, op, valor, valorTxt, resp, dias, cor
   * (vermelho|ambar|azul), acao: { l, ir: [tela, param] }, funcoes }. Itens do mesmo tipo viram uma linha só.
   * opc: { funcao (filtra pelo que é da função), ptax, max (padrão 7) }.
   */
  function travandoAgora(db, hoje, opc) {
    const h = hoje || W.hojeISO(), o_ = opc || {}, out = [];
    const ops = (db.ops || []).filter(o => o && o.id), opMap = Object.fromEntries(ops.map(o => [o.id, o]));
    const ativas = ops.filter(o => W.emAndamento(o) && !/^(ESTUDO|EXPO)/i.test(o.id));
    const add = x => out.push(Object.assign({ valor: null, resp: '', dias: 0, cor: 'ambar', funcoes: ['samir', 'davi'] }, x));
    const finOp = id => (db.fin || []).filter(l => l && l.op === id && !W.transferencia(l));
    const alvo = o => (W.alvoDe ? W.alvoDe(db, o) : o);
    /* Pagamento que trava embarque. */
    const classe = l => (W.classeDe ? W.classeDe(l) : l.custo || '');
    const fabVenc = {};
    (db.fin || []).filter(l => l && !W.ehReceita(l) && !W.realizado(l) && W.vencDe(l) < h && classe(l) === 'fob' && opMap[l.op] && W.emAndamento(opMap[l.op]))
      .forEach(l => { const x = fabVenc[l.op] = fabVenc[l.op] || { v: 0, venc: W.vencDe(l), l }; x.v += W.valorDe(l); if (W.vencDe(l) < x.venc) x.venc = W.vencDe(l); });
    Object.entries(fabVenc).forEach(([op, x]) => add({ k: 'fabrica', titulo: `${op} · saldo à fábrica vencido`, sub: `vencido ${W.dataBR(x.venc).slice(0, 5)} · embarque parado`, op, valor: r2(x.v), resp: respDe(opMap[op]) || 'Davi', dias: dias(x.venc, h), cor: 'vermelho', acao: { l: 'Abrir', ir: ['ficha', op] } }));
    ativas.filter(o => o.status === 'preparacao_embarque' && !fabVenc[o.id]).forEach(o => {
      const fob = finOp(o.id).filter(l => !W.ehReceita(l) && classe(l) === 'fob'), tot = soma(fob), pago = soma(fob.filter(W.realizado));
      if (tot > 0 && pago < 0.7 * tot - 0.005) add({ k: 'fabrica70', titulo: `${o.id} · preparando embarque sem os 70% pagos`, sub: `pago ${Math.round(pago / tot * 100)}% do FOB`, op: o.id, valor: r2(0.7 * tot - pago), resp: respDe(o) || 'Davi', cor: 'vermelho', acao: { l: 'Abrir', ir: ['ficha', o.id] } });
    });
    /* Recebimento de cliente vencido há mais de 2 dias. */
    const recV = {};
    (db.fin || []).filter(l => l && W.ehReceita(l) && !W.realizado(l) && !W.transferencia(l) && W.daOperacao(l) && dias(W.vencDe(l), h) > 2)
      .forEach(l => { const x = recV[l.op] = recV[l.op] || { v: 0, venc: W.vencDe(l), l }; x.v += W.valorDe(l); if (W.vencDe(l) < x.venc) { x.venc = W.vencDe(l); x.l = l; } });
    Object.entries(recV).forEach(([op, x]) => { const o = opMap[op] || {};
      add({ k: 'receber', titulo: `${op} · ${o.cliente || 'cliente'}: ${x.l.descCliente || (W.numeroNaOp ? (W.numeroNaOp(db, x.l) || '') + 'ª parcela' : 'parcela')} vencida`, sub: `vencida ${W.dataBR(x.venc).slice(0, 5)} · cobrar`, op, valor: r2(x.v), resp: 'Ívina', dias: dias(x.venc, h), cor: 'vermelho', acao: { l: 'Cobrar', ir: ['desembolso', op] }, funcoes: ['samir', 'davi', 'ivina'] }); });
    /* Caixa negativo previsto (cobertura acumulada). */
    ativas.forEach(o => { const d = W.desembolsoOp(db, o.id, h), b = d.bloqueios[0];
      if (b) add({ k: 'cobertura', titulo: `${o.id} · caixa negativo previsto em ${W.dataBR(b.ate).slice(0, 5)}`, sub: `saem ${W.fmtBRL(b.totalDia)} e o recebido não cobre`, op: o.id, valor: r2(b.falta), resp: respDe(o) || 'Davi', dias: Math.max(0, -dias(h, b.ate)), cor: dias(h, b.ate) <= 7 ? 'vermelho' : 'ambar', acao: { l: 'Abrir', ir: ['desembolso', o.id] } }); });
    /* Documento que falta para a próxima etapa. */
    ativas.forEach(o => {
      const cl = (db.checklists || {})[o.id]; if (!Array.isArray(cl)) return;
      const pend = re => cl.filter(it => it && it.status === 'pendente' && re.test(it.titulo || ''));
      const fr = W.freteDe ? W.freteDe(db, alvo(o)) : null;
      if (fr) { const p = pend(/invoice|packing|draft|\bbl\b/i); if (p.length) add({ k: 'docs', titulo: `${o.id} · ${p.map(x => x.titulo).slice(0, 2).join(', ')} pendente`, sub: 'frete fechado: conferir antes do embarque', op: o.id, valorTxt: `${p.length} doc`, resp: 'Ívina', dias: dias(fr.em, h), acao: { l: 'Abrir', ir: ['ficha', o.id] }, funcoes: ['samir', 'davi', 'ivina'] }); }
      const eta = (alvo(o) || {}).eta || o.eta, ate = eta ? dias(h, eta) : null;
      if (ate != null && ate >= 0 && ate <= 30) { const p = pend(/despachante/i); if (p.length) add({ k: 'docs', titulo: `${o.id} · documentos ao despachante`, sub: `chega ${W.dataBR(eta).slice(0, 5)} · ${p.length} pendente(s)`, op: o.id, valorTxt: `${ate} dias`, resp: 'Ívina', acao: { l: 'Abrir', ir: ['ficha', o.id] }, funcoes: ['samir', 'davi', 'ivina'] }); }
      const lp = pend(/lpco|licen/i); if (lp.length) add({ k: 'lpco', titulo: `${o.id} · ${lp[0].titulo}`, sub: eta ? `chega ${W.dataBR(eta).slice(0, 5)} · DUIMP não registra sem ele` : 'pendente', op: o.id, valorTxt: ate != null ? `${Math.max(0, ate)} dias` : '', resp: 'Davi', cor: ate != null && ate <= 15 ? 'vermelho' : 'ambar', acao: { l: 'Abrir', ir: ['ficha', o.id] }, funcoes: ['samir', 'davi', 'ivina'] });
    });
    /* Desembaraço: canal com ação; DUIMP não registrada 2 dias depois da chegada. */
    (W.canaisComAcao ? W.canaisComAcao(db) : []).forEach(x => add({ k: 'canal', titulo: `${x.o.id} · DUIMP no canal ${x.canal.l.toLowerCase()}`, sub: 'acompanhar com o despachante', op: x.o.id, valorTxt: x.canal.l, resp: 'Ívina', cor: x.canal.k === 'amarelo' ? 'ambar' : 'vermelho', acao: { l: 'Abrir', ir: ['ficha', x.o.id] }, funcoes: ['samir', 'davi', 'ivina'] }));
    ativas.filter(o => !o.maeId && o.eta && dias(o.eta, h) > 2 && ['embarcado', 'container_enviado_porto', 'chegada'].includes(o.status) && !o.duimp)
      .forEach(o => add({ k: 'duimp', titulo: `${o.id} · DUIMP não registrada`, sub: `chegou ${W.dataBR(o.eta).slice(0, 5)}`, op: o.id, valorTxt: `${dias(o.eta, h)} dias`, resp: 'Davi', dias: dias(o.eta, h), cor: 'vermelho', acao: { l: 'Abrir', ir: ['ficha', o.id] }, funcoes: ['samir', 'davi', 'ivina'] }));
    /* Free time acabando em até 3 dias. */
    (W.conteineres ? W.conteineres(db, h) : []).filter(c => c.status === 'vencido' || (c.restantes != null && c.restantes <= 3 && c.status !== 'sem-descarga' && !/devolvido/.test(c.status)))
      .forEach(c => add({ k: 'freetime', titulo: `Contêiner ${c.c.numero} (${c.op}) · ${c.status === 'vencido' ? 'free time vencido' : 'free time acaba ' + W.dataBR(c.limite).slice(0, 5)}`, sub: 'risco de demurrage · devolver', op: c.op, valor: c.status === 'vencido' ? r2(c.custoUSD * (o_.ptax || 5.5)) : null, valorTxt: c.status === 'vencido' ? '' : `${Math.max(0, c.restantes)} dia(s)`, resp: 'Matheus', cor: c.status === 'vencido' ? 'vermelho' : 'ambar', acao: { l: 'Abrir', ir: ['conteineres'] }, funcoes: ['samir', 'davi', 'matheus'] }));
    /* Frete ainda não fechado 5 dias depois da produção terminar. */
    const vistos = new Set();
    ativas.filter(o => o.status === 'preparacao_embarque').forEach(o => { const a = alvo(o) || o; if (vistos.has(a.id)) return; vistos.add(a.id);
      if (W.freteDe && W.freteDe(db, a)) return; const d = dias(W.soData(a.statusEm || o.statusEm || h), h);
      if (d >= 5) add({ k: 'frete', titulo: `${a.id} · frete não fechado`, sub: `produção concluída há ${d} dias`, op: a.id, valorTxt: `${(a.containers || []).length || 1} cntr`, resp: 'Matheus', dias: d, acao: { l: 'Abrir', ir: ['ficha', a.id] }, funcoes: ['samir', 'davi', 'matheus'] }); });
    /* Erros de cadastro. */
    (W.tiposDivergentes ? W.tiposDivergentes(db) : []).forEach(x => add({ k: 'tipo', titulo: `${x.op} · tipo da operação divergente`, sub: `${x.onde.join(' · ')} × cotação ${x.cotacao}`, op: x.op, valorTxt: 'favorecido', resp: 'Davi', acao: { l: 'Decidir', ir: ['desembolso', x.op] } }));
    ativas.filter(o => !W.ehMae(o) && finOp(o.id).some(W.ehReceita)).forEach(o => {
      const est = W.estruturaDaOp ? W.estruturaDaOp(db, o) : null, f = est && W.favorecidoDe ? W.favorecidoDe(db, est) : null, asaas = (((db.hubPainel || {})._asaas) || {}).ativo;
      if (f && !asaas && !(f.banco || f.pix || f.conta)) add({ k: 'favorecido', titulo: `${o.id} · favorecido sem dados bancários`, sub: `${W.ESTRUTURAS && W.ESTRUTURAS[est] ? W.ESTRUTURAS[est].nome : est}: preencher em Contratos`, op: o.id, valorTxt: 'desembolso', resp: 'Davi', acao: { l: 'Abrir', ir: ['contratos'] } });
      const etaErr = W.etaInvalida ? W.etaInvalida(db, o) : ''; if (etaErr) add({ k: 'eta', titulo: `${o.id} · ETA inválido`, sub: etaErr, op: o.id, valorTxt: 'cadastro', resp: 'Davi', cor: 'vermelho', acao: { l: 'Abrir', ir: ['ficha', o.id] } });
    });
    ativas.filter(o => !W.ehMae(o) && !['cotacao', 'contrato', 'travada'].includes(o.status) && !finOp(o.id).length)
      .forEach(o => add({ k: 'semfin', titulo: `${o.id} · operação ativa sem lançamento financeiro`, sub: W.stMeta(o.status).l, op: o.id, valorTxt: 'cadastro', resp: 'Davi', acao: { l: 'Abrir', ir: ['ficha', o.id] } }));
    const dup = {};
    (db.fin || []).filter(l => l && W.daOperacao(l) && !W.transferencia(l)).forEach(l => { const c = [l.op, l.tipo, (+l.valor || 0).toFixed(2), W.vencDe(l), String(l.desc || '').trim().toLowerCase()].join('|'); (dup[c] = dup[c] || []).push(l); });
    Object.values(dup).filter(xs => xs.length > 1).forEach(xs => add({ k: 'duplicado', titulo: `${xs[0].op} · lançamento em dobro`, sub: `${xs.length}× ${xs[0].desc || xs[0].tipo} · ${W.dataBR(W.vencDe(xs[0]))}`, op: xs[0].op, valor: r2(W.valorDe(xs[0]) * (xs.length - 1)), resp: 'Matheus', acao: { l: 'Abrir', ir: ['lanc'] }, funcoes: ['samir', 'davi', 'matheus'] }));
    if (W.operacoesParecidas) { const pares = new Set();
      ativas.filter(o => !W.ehMae(o) && o.cliente).forEach(o => { const val = soma(finOp(o.id).filter(l => W.ehReceita(l) && !l.aditivo)); if (!(val > 0)) return;
        W.operacoesParecidas(db, o.cliente, val, [o.id]).filter(p => opMap[p.op] && W.emAndamento(opMap[p.op])).forEach(p => { const ch = [o.id, p.op].sort().join('×'); if (pares.has(ch)) return; pares.add(ch);
          add({ k: 'duplicada', titulo: `${ch.replace('×', ' e ')} · mesmo cliente e valor`, sub: 'aditivo, nova operação ou duplicada?', op: o.id, valor: r2(val), resp: 'Davi', cor: 'azul', acao: { l: 'Revisar', ir: ['ficha', o.id] } }); }); }); }
    /* Câmbio: reajuste esperando aprovação; exposição de uma operação acima de R$ 10 mil. */
    ativas.filter(o => W.regraDaOp && W.regraDaOp(o)).forEach(o => { (W.eventosDaOp(db, o, o_.ptaxes || {}) || []).filter(e => e.status === 'aguardando-samir').forEach(e => add({ k: 'reajuste', titulo: `${o.id} · reajuste cambial aguardando aprovação`, sub: e.rotulo, op: o.id, valor: r2(e.calculo && e.calculo.valor), resp: 'Samir', cor: 'azul', acao: { l: 'Aprovar', ir: ['ficha', o.id] } })); });
    if (o_.ptax && W.exposicaoCambio) { const ex = W.exposicaoCambio(db, o_.ptax, h);
      (ex.semContrato || []).forEach(x => { const o = opMap[x.op], ref = o && W.referenciaDaCotacao ? W.referenciaDaCotacao(db, o) : 0, imp = ref ? x.usd * (o_.ptax - ref) : 0;
        if (imp > 10000) add({ k: 'cambio', titulo: `${x.op} · exposição cambial`, sub: `US$ ${Math.round(x.usd).toLocaleString('pt-BR')} sem câmbio · PTAX ${o_.ptax.toFixed(4).replace('.', ',')}`, op: x.op, valor: r2(imp), resp: 'Davi', acao: { l: 'Abrir', ir: ['cambio'] } }); }); }
    /* Frete acima de 5% esperando o Samir. */
    if (W.variacaoFrete) ativas.filter(o => !o.maeId).forEach(o => { const v = W.variacaoFrete(db, o); if (v && v.pendente) add({ k: 'freteAjuste', titulo: `${o.id} · frete ${v.diferenca >= 0 ? '+' : ''}${(v.pct * 100).toFixed(1).replace('.', ',')}% sobre a cotação`, sub: v.semComprovante ? 'falta o comprovante do agente' : 'aprovar ajuste ou absorver', op: o.id, valor: r2(v.ajusteSugeridoUSD * (o_.ptax || 5.5)), resp: 'Samir', cor: 'azul', acao: { l: 'Decidir', ir: ['ficha', o.id] } }); });
    /* Margem baixa só enquanto há decisão a tomar (em cotação). */
    ops.filter(o => o.status === 'cotacao').forEach(o => { const c = W.custeioOp ? W.custeioOp(db, o.id, {}) : null;
      if (c && c.margemProjetada != null && c.receita > 0 && c.margemProjetada < 0.10) add({ k: 'margem', titulo: `${o.id} · margem ${(c.margemProjetada * 100).toFixed(1).replace('.', ',')}% em cotação`, sub: 'abaixo de 10%: decidir antes de fechar', op: o.id, valor: r2(c.receita * c.margemProjetada), resp: 'Davi', cor: 'azul', acao: { l: 'Abrir', ir: ['ficha', o.id] } }); });
    /* Lançamentos vencidos sem baixa: Samir vê o total; Davi, os que passaram de 3 dias sem aviso; o "não pago" avisado vira item do Samir. */
    const lv = lancamentosVencidos(db, h), semAviso = lv.filter(x => !x.avisado);
    if (semAviso.length) add({ k: 'vencidos', titulo: `${semAviso.filter(x => !W.ehReceita(x.l)).length} pagamento(s) e ${semAviso.filter(x => W.ehReceita(x.l)).length} recebimento(s) vencidos sem baixa`, sub: 'caixa do sistema distorcido · Matheus', valor: r2(soma(semAviso.map(x => x.l))), resp: 'Matheus', dias: semAviso[0].dias, cor: 'vermelho', acao: { l: 'Conferir', ir: ['lanc', 'vencidos'] }, funcoes: ['samir'] });
    const subiu = semAviso.filter(x => x.nivel !== 'matheus');
    if (subiu.length) add({ k: 'vencidosDavi', titulo: `${subiu.length} lançamento(s) vencidos há +3 dias sem baixa nem aviso`, sub: 'Matheus não deu baixa nem avisou o Samir', valor: r2(soma(subiu.map(x => x.l))), resp: 'Matheus', dias: subiu[0].dias, cor: 'vermelho', acao: { l: 'Conferir', ir: ['lanc', 'vencidos'] }, funcoes: ['davi'] });
    lv.filter(x => x.avisado).forEach(x => add({ k: 'naoPago', titulo: `${W.ehReceita(x.l) ? 'Não recebido' : 'Não pago'}: ${x.l.desc || 'lançamento'}`, sub: `Matheus avisou em ${W.dataBR(String(x.l.cobradoSamirEm).slice(0, 10)).slice(0, 5)} · venceu ${W.dataBR(W.vencDe(x.l)).slice(0, 5)}`, op: W.daOperacao(x.l) ? x.l.op : '', valor: r2(W.valorDe(x.l)), resp: 'Samir', dias: x.dias, cor: 'vermelho', acao: { l: 'Decidir', ir: ['lanc', 'vencidos'] }, funcoes: ['samir'] }));
    /* Função: o que é dela. Etapa atrasada entra para o Davi (impede a próxima etapa). */
    let lista = out;
    if (o_.funcao) {
      lista = out.filter(x => x.funcoes.includes(o_.funcao));
      if (o_.funcao === 'davi') ativas.filter(o => W.prazoInfo(db, o, h).sit === 'atrasado').forEach(o => { const p = W.prazoInfo(db, o, h);
        lista.push({ k: 'etapa', titulo: `${o.id} · ${p.dias != null ? p.dias + ' dias' : 'atrasada'} em ${W.stMeta(o.status).l}`, sub: `prazo-alvo ${p.alvo != null ? p.alvo + ' dias' : '—'} · ${o.cliente || ''}`, op: o.id, valor: null, valorTxt: `${p.atraso || 0} d atraso`, resp: respDe(o), dias: p.atraso || 0, cor: 'ambar', acao: { l: 'Abrir', ir: ['ficha', o.id] }, funcoes: ['davi'] }); });
      if (o_.funcao === 'ivina') lista.forEach(x => { if (x.k !== 'receber') { x.valor = null; } });   // nunca custo, margem ou resultado
    }
    /* Itens iguais numa linha só (mesmo tipo em várias operações). */
    const porTipo = {};
    lista.forEach(x => (porTipo[x.k] = porTipo[x.k] || []).push(x));
    const NOMES = { fabrica: 'saldos à fábrica vencidos', receber: 'parcelas de cliente vencidas', cobertura: 'operações com caixa negativo previsto', docs: 'documentos pendentes', frete: 'fretes não fechados', freetime: 'contêineres com free time acabando', favorecido: 'favorecidos sem dados bancários', semfin: 'operações ativas sem lançamento', duplicado: 'lançamentos em dobro', eta: 'ETAs inválidos', etapa: 'operações atrasadas na etapa', reajuste: 'reajustes cambiais aguardando aprovação' };
    const agrup = [];
    Object.entries(porTipo).forEach(([k, xs]) => {
      if (xs.length < 2 || !NOMES[k]) return agrup.push(...xs);
      const v = xs.every(x => x.valor == null) ? null : r2(xs.reduce((a, x) => a + (x.valor || 0), 0));
      const pior = xs.find(x => x.cor === 'vermelho') ? 'vermelho' : xs.find(x => x.cor === 'ambar') ? 'ambar' : 'azul';
      agrup.push(Object.assign({}, xs[0], { titulo: `${xs.length} ${NOMES[k]}`, sub: xs.map(x => x.op).filter(Boolean).slice(0, 4).join(' · ') + (xs.length > 4 ? '…' : ''), valor: v, valorTxt: v == null ? `${xs.length} itens` : '', dias: Math.max(...xs.map(x => x.dias || 0)), cor: pior, itens: xs,
        acao: xs[0].acao && xs[0].acao.ir[0] === 'ficha' ? { l: 'Ver', ir: ['ops'] } : xs[0].acao }));
    });
    const peso = { vermelho: 0, ambar: 1, azul: 2 };
    agrup.sort((a, b) => (b.valor || 0) - (a.valor || 0) || peso[a.cor] - peso[b.cor] || (b.dias || 0) - (a.dias || 0));
    return { itens: agrup.slice(0, o_.max || 7), total: agrup.length, todos: agrup };
  }

  /* ---------- Equipe (fiscalização) ---------- */
  function equipeHoje(db, hoje, so) {
    const h = hoje || W.hojeISO(), lim = cfgTarefas(db).diasParaSamir || 3, lv = lancamentosVencidos(db, h);
    return Object.keys(db.users || {}).filter(k => { const f = funcaoDoUsuario(db, k); return f && f !== 'samir' && (!so || so.includes(f)); }).map(k => {
      const nome = W.nomeDeUsuario ? W.nomeDeUsuario(db, k) : ((db.users[k] || {}).nome || k), f = funcaoDoUsuario(db, k);
      const ts = (db.agendaTasks || []).filter(t => t && t.resp === nome && t.status !== 'feita' && t.prazo && t.prazo < h && !(t.auto && t.auto.suspensa));
      const extra = f === 'matheus' ? lv.filter(x => !x.avisado) : [];
      const subiram = ts.filter(t => dias(t.prazo, h) > lim).length + extra.filter(x => x.dias > 3 + lim).length;
      const opsAtr = (db.ops || []).filter(o => o && W.ativa(o) && String(o.resp || '').split(/[\s/,]+/).includes(nome) && W.prazoInfo(db, o, h).sit === 'atrasado').length;
      return { k, nome, funcao: f, perfil: W.perfilDe(db, k).nome, atrasadas: ts.length + extra.length, tarefasAtrasadas: ts.length, lancVencidos: extra.length, subiram, opsAtrasadas: opsAtr };
    });
  }

  /* ---------- Operações por etapa ---------- */
  function porEtapa(db, hoje) {
    const h = hoje || W.hojeISO(), ativas = (db.ops || []).filter(o => o && o.id && W.ativa(o));
    return W.STATUS_OP.filter(s => !W.FINALIZADAS.includes(s.k) && s.k !== 'travada').map(s => { const xs = ativas.filter(o => o.status === s.k);
      return { k: s.k, l: s.l, n: xs.length, atrasadas: xs.filter(o => W.prazoInfo(db, o, h).sit === 'atrasado').length }; });
  }

  /* ---------- Próximos 15 dias ---------- */
  /** Chegadas, parcelas grandes a receber e pagamentos grandes a fazer (máx. 8). Sem `fin`, só as chegadas. */
  function proximos15(db, hoje, opc) {
    const h = hoje || W.hojeISO(), ate = diaMais(h, 15), o_ = opc || {}, grande = o_.grande || 20000, out = [];
    (db.ops || []).filter(o => o && o.id && W.ativa(o) && !o.maeId && o.eta && W.soData(o.eta) >= h && W.soData(o.eta) <= ate)
      .forEach(o => out.push({ data: W.soData(o.eta), tipo: 'chegada', texto: `${o.id} ${o.cliente || ''}`.trim(), op: o.id }));
    if (o_.fin !== false) (db.fin || []).filter(l => l && !W.realizado(l) && !W.transferencia(l) && W.vencDe(l) >= h && W.vencDe(l) <= ate && W.valorDe(l) >= grande)
      .forEach(l => out.push({ data: W.vencDe(l), tipo: W.ehReceita(l) ? 'receber' : 'pagar', texto: `${W.daOperacao(l) ? l.op + ' · ' : ''}${l.descCliente || l.desc || ''}`, valor: W.valorDe(l), op: W.daOperacao(l) ? l.op : '' }));
    return out.sort((a, b) => a.data.localeCompare(b.data) || (b.valor || 0) - (a.valor || 0)).slice(0, o_.max || 8);
  }

  /* ---------- Cards e blocos por função; personalizar ---------- */
  /* cap: exigida para entrar na lista da pessoa. fin = valor financeiro; equipe = equipe e ranking. */
  const CARDS = {
    caixaHoje: { l: 'Caixa hoje', cap: 'fin.ver' }, fimMes: { l: 'Caixa fim do mês', cap: 'fin.ver' }, lucroRealizar: { l: 'Lucro a realizar', cap: 'fin.resultado' },
    fechadoMes: { l: 'Fechado no mês', cap: 'fin.resultado' }, opsAtrasadas: { l: 'Ops atrasadas' }, aguardando: { l: 'Aguardando você', cap: 'fin.autorizar' },
    opsAtivas: { l: 'Ops ativas' }, travando: { l: 'Travando' }, tarefasAtrasadas: { l: 'Tarefas atrasadas' }, cotacoesSamir: { l: 'Cotações c/ Samir' },
    pagar7: { l: 'A pagar 7 dias', cap: 'fin.ver' }, receber7: { l: 'A receber 7 dias', cap: 'fin.ver' },
    docsConferir: { l: 'Docs para conferir' }, minhasTarefas: { l: 'Minhas tarefas' }, clientesEsperando: { l: 'Clientes esperando +24 h' }, chegadas30: { l: 'Chegadas em 30 dias' },
    cobrancasHoje: { l: 'Cobranças hoje' }, briefings: { l: 'Briefings pendentes' },
    fretesFechar: { l: 'Fretes a fechar' }, cotacoesFrete: { l: 'Cotações de frete' }, noMar: { l: 'No mar' }, freeTime: { l: 'Free time crítico' }, lancVencidos: { l: 'Lançamentos vencidos', cap: 'fin.lancar' },
    equipeAtrasadas: { l: 'Equipe: atrasadas', cap: 'equipe.ver' } };
  const BLOCOS = {
    travando: { l: 'Travando agora' }, equipe: { l: 'Equipe', cap: 'equipe.ver' }, etapas: { l: 'Operações por etapa' }, proximos: { l: 'Próximos 15 dias' },
    tarefas: { l: 'Minhas tarefas' }, cotacoes: { l: 'Cotações na fila' }, docsOps: { l: 'Documentação por operação' }, clientes: { l: 'Clientes e cobranças' },
    fretes: { l: 'Fretes a fechar' }, transito: { l: 'Em trânsito' }, lancVencidos: { l: 'Lançamentos vencidos sem baixa', cap: 'fin.lancar' }, ponto: { l: 'Meu ponto hoje' }, recados: { l: 'Recados' } };
  const PADRAO = {
    samir: { cards: ['caixaHoje', 'fimMes', 'lucroRealizar', 'fechadoMes', 'opsAtrasadas', 'aguardando'], blocos: ['travando', 'equipe', 'etapas', 'proximos'] },
    davi: { cards: ['opsAtivas', 'travando', 'tarefasAtrasadas', 'cotacoesSamir', 'pagar7', 'receber7'], blocos: ['travando', 'equipe', 'tarefas', 'cotacoes', 'etapas', 'ponto'] },
    ivina: { cards: ['docsConferir', 'minhasTarefas', 'clientesEsperando', 'chegadas30', 'cobrancasHoje', 'briefings'], blocos: ['docsOps', 'clientes', 'tarefas', 'ponto'] },
    matheus: { cards: ['fretesFechar', 'cotacoesFrete', 'noMar', 'freeTime', 'lancVencidos', 'minhasTarefas'], blocos: ['fretes', 'transito', 'lancVencidos', 'tarefas', 'ponto'] } };
  /* Ívina (documentos): nada de custo, margem ou resultado, mesmo que um dia ganhe fin.ver. */
  const SO_DIRETORIA = new Set(['lucroRealizar', 'fechadoMes', 'aguardando', 'caixaHoje', 'fimMes']);
  function permitidos(db, k) {
    const perf = W.perfilDe(db, k), cap = c => !c || perf.caps.includes(c), docs = perf.id === 'documentos';
    return { cards: Object.keys(CARDS).filter(id => cap(CARDS[id].cap) && !(docs && (CARDS[id].cap || SO_DIRETORIA.has(id)))),
      blocos: Object.keys(BLOCOS).filter(id => cap(BLOCOS[id].cap) && !(docs && BLOCOS[id].cap)) };
  }
  const chaveLayout = k => '_torre2_' + k;
  /** Layout que a pessoa vê numa aba: o que ela salvou (só o permitido) ou o padrão da função. */
  function layoutDe(db, k, funcao) {
    const p = permitidos(db, k), pad = PADRAO[funcao] || PADRAO.samir, s = ((((db || {}).hubPainel || {})[chaveLayout(k)]) || {})[funcao];
    const filtra = (xs, ok) => (xs || []).filter(x => ok.includes(x));
    const cards = filtra(s && s.cards ? s.cards : pad.cards, p.cards), blocos = filtra(s && s.blocos ? s.blocos : pad.blocos, p.blocos);
    return { cards: cards.slice(0, 6), blocos, personalizado: !!s, permitidos: p };
  }
  function salvarLayout(db, k, funcao, novo, agora) {
    const p = permitidos(db, k), cards = (novo.cards || []).filter(x => p.cards.includes(x)).slice(0, 6), blocos = (novo.blocos || []).filter(x => p.blocos.includes(x));
    if (cards.length !== 6) return { ok: false, msg: 'Escolha 6 cartões.' };
    db.hubPainel = db.hubPainel || {};
    const atual = Object.assign({}, db.hubPainel[chaveLayout(k)]); atual[funcao] = { cards, blocos, em: agora || new Date().toISOString() };
    db.hubPainel[chaveLayout(k)] = atual;
    return { ok: true };
  }
  function voltarPadrao(db, k, funcao) {
    const atual = Object.assign({}, (db.hubPainel || {})[chaveLayout(k)]); delete atual[funcao];
    db.hubPainel = db.hubPainel || {}; db.hubPainel[chaveLayout(k)] = atual;
    return { ok: true };
  }

  return { FUNCOES, funcaoDoUsuario, abasVisiveis, lancamentosVencidos, avisarSamirLanc, travandoAgora, equipeHoje, porEtapa, proximos15, CARDS_TORRE: CARDS, BLOCOS_TORRE: BLOCOS, PADRAO_TORRE: PADRAO, permitidosTorre: permitidos, layoutDe, salvarLayout, voltarPadrao };
});
