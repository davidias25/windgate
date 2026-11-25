/* Hub 2.0 — Torre de Controle por função (Partes 4 e 4B do prompt de 18/11).
   Abas Samir · Davi · Ívina · Matheus (cada um vê as que o perfil permite). Mesmo desenho em todas:
   6 cartões de número, "Travando" com alertas coloridos e botão, e os blocos da função. Personalizar
   troca os cartões e a ordem dos blocos, só com o permitido para o perfil, e fica salvo por usuário.
   Os números vêm de torre-regras.js e fin-regras.js: a mesma conta do Financeiro. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  const S = { aba: null };
  const k$ = v => (v == null ? '—' : W.fmtBRLk(v)), brl = v => W.fmtBRL(+v || 0);
  const CORES = { vermelho: ['var(--crit-soft)', 'var(--crit)'], ambar: ['var(--warn-soft)', 'var(--warn)'], azul: ['var(--info-soft)', 'var(--info)'], verde: ['var(--ok-soft)', 'var(--ok)'] };
  const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const vazio = t => `<p class="empty">${t}</p>`;

  /* Pessoa da aba: quem tem aquela função (a Torre do Matheus mostra as tarefas do Matheus, mesmo vista pelo Samir). */
  const pessoaDa = (db, f) => Object.keys(db.users || {}).find(k => W.funcaoDoUsuario(db, k) === f) || f;

  function contexto(aba) {
    const db = H.db, hoje = W.hojeISO(), pk = pessoaDa(db, aba), nome = H.nomeUsuario(pk);
    const ativas = db.ops.filter(o => o && o.id && W.ativa(o));
    const ptax = H.ptax && +H.ptax.venda;
    const tarefas = (db.agendaTasks || []).filter(t => t && t.resp === nome && t.status !== 'feita' && !(t.auto && t.auto.suspensa)).sort((a, b) => String(a.prazo || '9').localeCompare(String(b.prazo || '9')));
    const memo = {};
    const uma = (k, f) => (k in memo ? memo[k] : (memo[k] = f()));
    return { db, hoje, aba, pk, nome, ativas, ptax, tarefas, uma,
      trav: () => uma('trav', () => W.travandoAgora(db, hoje, { funcao: aba, ptax })),
      cart: () => uma('cart', () => W.carteiraOps(db, 'todas', 'andamento', hoje)),
      cx: () => uma('cx', () => W.caixaDoMes(db, 'todas', hoje)),
      lv: () => uma('lv', () => W.lancamentosVencidos(db, hoje)),
      equipe: () => uma('eq', () => W.equipeHoje(db, hoje)) };
  }

  /* ---------- 6 cartões ---------- */
  function cartao(id, c) {
    const db = c.db, h = c.hoje, ate7 = somaDias(h, 7);
    const soma = xs => xs.reduce((a, l) => a + (+l.valor || 0), 0);
    const atrasadas = c.ativas.filter(o => W.prazoInfo(db, o, h).sit === 'atrasado');
    const preparando = c.ativas.filter(o => o.status === 'preparacao_embarque' && !(W.freteDe && W.freteDe(db, W.alvoDe(db, o))));
    const F = {
      caixaHoje: () => { const x = W.caixaHoje(db, 'todas', h); return { v: x.temExtrato ? k$(x.total) : '—', d: x.temExtrato ? 'extratos ' + x.contas.map(y => W.dataBR(y.data).slice(0, 5)).filter((v, i, a) => a.indexOf(v) === i).join(', ') + (x.distorcido ? ' · pode estar distorcido' : '') : 'sem extrato', ir: 'financeiro|caixa' }; },
      fimMes: () => { const x = c.cx(); return { v: k$(x.fimMes), d: `${k$(x.caixa.total)} + ${k$(x.receber)} − ${k$(x.pagarOps + x.pagarFixas)}`, cor: x.abaixoMinimo ? 'var(--crit)' : 'var(--ok)', ir: 'financeiro|caixa' }; },
      lucroRealizar: () => { const x = c.cart(); return { v: k$(x.total.lucroRealizar), d: `${x.total.n} operação(ões) em andamento`, ir: 'financeiro|carteira' }; },
      fechadoMes: () => { const ids = W.fechadasNoMes(db, h.slice(0, 7)), rs = Object.fromEntries(W.resultadoPorOp(db, 'todas').map(r => [r.op, r])), luc = ids.reduce((a, id) => a + ((rs[id] || {}).resultado || 0), 0), meta = +(((db.hubPainel || {})._meta || {}).mensal || {})[h.slice(0, 7)] || 0;
        return { v: k$(luc), d: `lucro de ${ids.length} contrato(s)${meta ? ' · meta ' + meta + ' contratos' : ' · meta a definir'}`, cor: meta && ids.length >= meta ? 'var(--ok)' : null, ir: 'financeiro|indicadores' }; },
      opsAtrasadas: () => ({ v: String(atrasadas.length), d: atrasadas.slice(0, 3).map(o => o.id).join(' · ') || 'tudo no prazo', cor: atrasadas.length ? 'var(--crit)' : 'var(--ok)', ir: 'ops' }),
      aguardando: () => { const cot = (db.qindex || []).filter(q => q && q.status === 'wait').length, pag = W.contasAbertas(db, 'Despesa', somaDias(h, 10), 'todas').filter(l => !l.autorizadoEm).length, rj = c.trav().todos.filter(x => ['reajuste', 'freteAjuste', 'naoPago'].includes(x.k)).length;
        return { v: String(cot + pag + rj), d: `${cot} cotação(ões) · ${pag} pagamento(s)${rj ? ' · ' + rj + ' decisão(ões)' : ''}`, cor: 'var(--blue)', ir: 'contas' }; },
      opsAtivas: () => ({ v: String(c.ativas.length), d: `${atrasadas.length} atrasada(s) na etapa`, ir: 'ops' }),
      travando: () => { const t = c.trav(); return { v: String(t.total), d: t.itens.slice(0, 2).map(x => x.op || x.k).join(' · ') || 'nada travando', cor: t.total ? 'var(--crit)' : 'var(--ok)' }; },
      tarefasAtrasadas: () => { const n = c.tarefas.filter(t => t.prazo && t.prazo < h).length; return { v: String(n), d: 'escalam ao Samir em +3 dias', cor: n ? 'var(--warn)' : 'var(--ok)', ir: 'agenda' }; },
      cotacoesSamir: () => ({ v: String((db.qindex || []).filter(q => q && q.status === 'wait').length), d: 'aguardando aprovação', cor: 'var(--blue)', ir: 'cotacoes' }),
      pagar7: () => { const xs = W.contasAbertas(db, 'Despesa', ate7, 'todas'); return { v: k$(soma(xs)), d: `${xs.length} conta(s) · ${xs.filter(l => W.vencDe(l) < h).length} vencida(s)`, cor: 'var(--crit)', ir: 'contas' }; },
      receber7: () => { const xs = W.contasAbertas(db, 'Receita', ate7, 'todas'); return { v: k$(soma(xs)), d: `${xs.filter(l => W.vencDe(l) < h).length} vencida(s)`, ir: 'contas' }; },
      docsConferir: () => { let n = 0, atr = 0; c.ativas.forEach(o => (db.checklists[o.id] || []).forEach(it => { if (it && it.status === 'pendente') { n++; if (it.prazo && it.prazo < h) atr++; } })); return { v: String(n), d: `${atr} atrasado(s)`, cor: atr ? 'var(--warn)' : null, ir: 'docs' }; },
      minhasTarefas: () => ({ v: String(c.tarefas.length), d: `${c.tarefas.filter(t => t.prazo && t.prazo < h).length} atrasada(s)`, ir: 'agenda' }),
      clientesEsperando: () => { const ns = (db.crmOps || []).filter(n => n && W.negocioAberto(n) && (n.resp === c.nome) && W.slaNegocio(n, h).sit === 'atrasado'); return { v: String(ns.length), d: 'sem resposta no prazo da fase', cor: ns.length ? 'var(--warn)' : null, ir: 'crm' }; },
      chegadas30: () => { const xs = c.ativas.filter(o => o.eta && W.diasEntre(h, o.eta) >= 0 && W.diasEntre(h, o.eta) <= 30); return { v: String(xs.length), d: xs.slice(0, 3).map(o => o.id).join(' · ') || 'nenhuma', ir: 'mapa' }; },
      cobrancasHoje: () => { const xs = (db.fin || []).filter(l => l && W.ehReceita(l) && !W.realizado(l) && W.daOperacao(l) && W.vencDe(l) <= h); return { v: String(xs.length), d: 'parcelas vencidas ou de hoje', cor: xs.length ? 'var(--crit)' : null, ir: 'desembolso' }; },
      briefings: () => { const n = (db.hubBriefings || []).filter(b => b && b.status === 'recebido').length; return { v: String(n), d: 'formulários recebidos a tratar', ir: 'crm' }; },
      fretesFechar: () => ({ v: String(preparando.length), d: preparando.slice(0, 3).map(o => o.id).join(' · ') || 'nenhum', cor: preparando.length ? 'var(--warn)' : null }),
      cotacoesFrete: () => ({ v: String((db.fretes || []).filter(f => f && f.status === 'Negociando').length), d: 'negociando', ir: 'frete' }),
      noMar: () => { const xs = c.ativas.filter(o => o.status === 'embarcado'); return { v: String(xs.length), d: xs.slice(0, 3).map(o => o.id).join(' · ') || 'nenhuma', ir: 'mapa' }; },
      freeTime: () => { const xs = (W.conteineres ? W.conteineres(db, h) : []).filter(x => x.status === 'vencido' || x.status === 'atencao'); return { v: String(xs.length), d: 'acaba em até 3 dias ou vencido', cor: xs.length ? 'var(--crit)' : null, ir: 'conteineres' }; },
      lancVencidos: () => { const xs = c.lv().filter(x => !x.avisado); return { v: String(xs.length), d: k$(xs.reduce((a, x) => a + (+x.l.valor || 0), 0)) + ' sem baixa', cor: xs.length ? 'var(--crit)' : 'var(--ok)', ir: 'vencidos' }; },
      equipeAtrasadas: () => { const e = c.equipe(); return { v: String(e.reduce((a, p) => a + p.atrasadas, 0)), d: e.map(p => `${p.nome} ${p.atrasadas}`).join(' · '), ir: 'produtividade' }; } };
    const r = (F[id] || (() => ({ v: '—', d: '' })))();
    return `<button class="kpi" ${r.ir ? `data-ir="${esc(r.ir)}"` : 'disabled'} style="cursor:${r.ir ? 'pointer' : 'default'}"><span class="lbl">${esc(W.CARDS_TORRE[id].l)}</span><span class="v" style="color:${r.cor || 'var(--ink)'}">${esc(r.v)}</span><span class="d">${esc(r.d || '')}</span></button>`;
  }

  /* ---------- Blocos ---------- */
  const alerta = (cor, titulo, sub, amt, botao) => { const [bg, fg] = CORES[cor] || CORES.ambar;
    return `<div style="display:flex;gap:12px;align-items:center;border-radius:10px;padding:9px 12px;background:${bg}"><span style="width:10px;height:10px;border-radius:50%;flex:0 0 10px;background:${fg}"></span>
      <div style="flex:1;min-width:0"><b style="display:block;font-size:13.5px">${titulo}</b><span class="note">${sub}</span></div>${amt ? `<b class="num" style="color:${fg};white-space:nowrap">${amt}</b>` : ''}${botao || ''}</div>`; };
  const tagP = (txt, cor) => { const [bg, fg] = CORES[cor] || ['var(--surface-2)', 'var(--muted)']; return `<span class="pill" style="background:${bg};color:${fg}">${esc(txt)}</span>`; };
  const B = {
    travando(c) {
      const t = c.trav();
      return { t: c.aba === 'davi' ? 'Travando minhas operações' : 'Travando agora', nota: 'pelo valor em jogo', corpo: t.itens.length ? t.itens.map((x, i) => alerta(x.cor, esc(x.titulo), esc([x.sub, x.resp, x.dias ? `há ${x.dias} dia(s)` : ''].filter(Boolean).join(' · ')),
        x.valor != null ? esc(k$(x.valor)) : esc(x.valorTxt || ''), x.acao ? `<button class="btn ghost sm" data-trav="${i}">${esc(x.acao.l)}</button>` : '')).join('') + (t.total > t.itens.length ? `<p class="note">+ ${t.total - t.itens.length} item(ns)</p>` : '') : vazio('Nada travando. Tudo andando.') };
    },
    equipe(c) {
      const so = c.aba === 'davi' ? ['ivina', 'matheus'] : null, ps = W.equipeHoje(c.db, c.hoje, so), ponto = H.pontoEquipeHoje ? H.pontoEquipeHoje() : null;
      return { t: c.aba === 'davi' ? 'Meu time' : 'Equipe', nota: '+3 dias parado sobe para o Samir', corpo: ps.map(p => { const pt = ponto && ponto[p.k];
        return `<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line);flex-wrap:wrap"><button class="btn ghost sm" data-pessoa="${esc(p.nome)}" style="font-weight:700">${esc(p.nome)}</button><span class="note" style="flex:1">${esc(p.perfil)}</span>
          ${tagP(p.atrasadas + ' atrasada(s)', p.atrasadas ? 'vermelho' : null)}${p.opsAtrasadas ? tagP(p.opsAtrasadas + ' op(s) atrasada(s)', 'ambar') : ''}${tagP(p.subiram + ' subiram', p.subiram ? 'ambar' : null)}
          ${ponto ? (pt && pt.entrada ? tagP('entrou ' + pt.entrada + (pt.local ? ' · ' + pt.local : ''), 'verde') : tagP('sem ponto', 'vermelho')) : ''}</div>`; }).join('') || vazio('Ninguém no time.') };
    },
    etapas(c) {
      const es = W.porEtapa(c.db, c.hoje);
      return { t: 'Operações por etapa', nota: 'ponto vermelho = tem atraso', largo: true, corpo: `<div class="pipe">${es.map(e => `<button class="stage" data-etapa="${e.k}"><div class="n">${e.n}${e.atrasadas ? ' <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--crit)"></span>' : ''}</div><div class="t">${esc(e.l)}</div></button>`).join('')}</div>` };
    },
    proximos(c) {
      const fin = H.pode('fin.ver') && c.aba !== 'ivina', xs = W.proximos15(c.db, c.hoje, { fin });
      return { t: 'Próximos 15 dias', nota: fin ? 'chegadas e dinheiro grande' : 'chegadas', largo: true, corpo: xs.length ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">${xs.map(x => `<div style="border-left:3px solid ${x.tipo === 'pagar' ? 'var(--crit)' : x.tipo === 'receber' ? 'var(--ok)' : 'var(--blue)'};background:var(--surface-2);border-radius:8px;padding:7px 10px;font-size:13px"><b class="note" style="display:block">${W.dataBR(x.data).slice(0, 5)} · ${x.tipo}</b>${esc(x.texto)}${x.valor ? ' · ' + esc(k$(x.valor)) : ''}</div>`).join('')}</div>` : vazio('Nada nos próximos 15 dias.') };
    },
    tarefas(c) {
      const ts = c.tarefas.slice(0, 8);
      return { t: c.pk === H.userKey ? 'Minhas tarefas' : 'Tarefas de ' + c.nome, nota: 'toque para concluir', corpo: ts.length ? ts.map(t => { const atr = t.prazo && t.prazo < c.hoje, hj = t.prazo === c.hoje;
        return alerta(atr ? 'vermelho' : hj ? 'ambar' : 'azul', esc(t.t || ''), esc([t.prazo ? (atr ? 'venceu ' : 'até ') + W.dataBR(t.prazo) : 'sem prazo', t.prio || '', t.auto ? 'automática' : ''].filter(Boolean).join(' · ')), atr ? 'atrasada' : hj ? 'hoje' : '', `<button class="btn ghost sm" data-tarefa="${esc(t._id)}">Concluir</button>`); }).join('') + (c.tarefas.length > 8 ? `<p class="note">+ ${c.tarefas.length - 8} tarefa(s)</p>` : '') : vazio('Nenhuma tarefa aberta.') };
    },
    cotacoes(c) {
      const qs = (c.db.qindex || []).filter(q => q && ['wait', 'draft'].includes(q.status)).slice(0, 6);
      return { t: 'Cotações na fila', nota: 'do pedido à aprovação do Samir', corpo: qs.length ? qs.map(q => `<div style="display:flex;flex-direction:column;gap:4px;padding:4px 0"><div style="display:flex;justify-content:space-between;gap:8px"><button class="btn ghost sm" data-cot="${esc(q.id)}" style="font-weight:700">${esc(q.cliente || q.label || q.id)}</button><span class="note">${q.status === 'wait' ? 'aguardando Samir' : 'em montagem · ' + esc(q.criadoPor || '')}</span></div><div style="height:7px;border-radius:99px;background:var(--surface-2);overflow:hidden"><i style="display:block;height:100%;width:${q.status === 'wait' ? 90 : 35}%;background:${q.status === 'wait' ? 'var(--blue)' : 'var(--warn)'}"></i></div></div>`).join('') : vazio('Nenhuma cotação na fila.') };
    },
    docsOps(c) {
      const PRE = ['Fechamento', 'Produção/Embarque'], CHEG = ['Trânsito', 'Desembaraço'];
      const prog = (cl, fases) => { const xs = cl.filter(it => it && fases.includes(it.fase)); return xs.length ? Math.round(xs.filter(it => it.status !== 'pendente').length / xs.length * 100) : null; };
      const linhas = c.ativas.filter(o => !W.ehMae(o) && Array.isArray(c.db.checklists[o.id])).map(o => ({ o, pre: prog(c.db.checklists[o.id], PRE), ch: prog(c.db.checklists[o.id], CHEG) })).filter(x => x.pre != null || x.ch != null).sort((a, b) => (a.pre == null ? 101 : a.pre) - (b.pre == null ? 101 : b.pre)).slice(0, 8);
      const barra = (p, rot) => p == null ? '' : `<div style="flex:1"><div class="note">${rot} ${p}%</div><div style="height:7px;border-radius:99px;background:var(--surface-2);overflow:hidden"><i style="display:block;height:100%;width:${p}%;background:${p === 100 ? 'var(--ok)' : p < 50 ? 'var(--warn)' : 'var(--blue)'}"></i></div></div>`;
      return { t: 'Documentação por operação', nota: 'checklist pré-embarque e pré-chegada', corpo: linhas.length ? linhas.map(x => `<div style="display:flex;gap:12px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)"><button class="btn ghost sm" data-op="${esc(x.o.id)}" style="width:120px;justify-content:flex-start"><b class="mono">${esc(x.o.id)}</b></button>${barra(x.pre, 'pré-embarque')}${barra(x.ch, 'pré-chegada')}</div>`).join('') : vazio('Nenhum checklist em andamento.') };
    },
    clientes(c) {
      const h = c.hoje, cob = (c.db.fin || []).filter(l => l && W.ehReceita(l) && !W.realizado(l) && W.daOperacao(l) && W.vencDe(l) <= somaDias(h, 7)).sort((a, b) => W.vencDe(a).localeCompare(W.vencDe(b))).slice(0, 6);
      const ops = Object.fromEntries(c.db.ops.filter(o => o && o.id).map(o => [o.id, o]));
      return { t: 'Clientes e cobranças', nota: 'parcela vencida, desembolso a enviar, follow-up', corpo: cob.length ? cob.map(l => { const v = W.vencDe(l) < h;
        return alerta(v ? 'vermelho' : 'azul', esc(`${l.op} · ${(ops[l.op] || {}).cliente || ''}`), esc(`${l.descCliente || 'parcela'} · ${v ? 'vencida ' : 'vence '}${W.dataBR(W.vencDe(l)).slice(0, 5)} · ${v ? 'cobrar' : 'enviar desembolso'}`), esc(k$(l.valor)), `<button class="btn ghost sm" data-desemb="${esc(l.op)}">${v ? 'Cobrar' : 'Desembolso'}</button>`); }).join('') : vazio('Nenhuma cobrança nos próximos 7 dias.') };
    },
    fretes(c) {
      const vistos = new Set(), xs = c.ativas.filter(o => o.status === 'preparacao_embarque').map(o => W.alvoDe(c.db, o)).filter(a => a && !vistos.has(a.id) && vistos.add(a.id) && !(W.freteDe && W.freteDe(c.db, a)));
      return { t: 'Fretes a fechar', nota: 'produção concluída sem frete', corpo: xs.length ? xs.map(a => { const d = W.diasEntre(W.soData(a.statusEm || c.hoje), c.hoje) || 0;
        return alerta(d >= 5 ? 'vermelho' : 'ambar', esc(`${a.id} · ${a.cliente || 'contêiner'}`), esc(`parado há ${d} dia(s) em Preparando embarque`), `${(a.containers || []).length || 1} cntr`, `<button class="btn ghost sm" data-op="${esc(a.id)}">Fechar frete</button>`); }).join('') : vazio('Nenhum frete a fechar.') };
    },
    transito(c) {
      const xs = c.ativas.filter(o => o.status === 'embarcado' && o.eta).sort((a, b) => String(a.eta).localeCompare(String(b.eta))).slice(0, 8);
      return { t: 'Em trânsito', nota: 'até o ETA, pelo tracking', corpo: xs.length ? xs.map(o => { const ini = W.soData(o.embarque || o.statusEm || c.hoje), tot = Math.max(1, W.diasEntre(ini, o.eta) || 1), feito = Math.min(100, Math.max(0, Math.round((W.diasEntre(ini, c.hoje) || 0) / tot * 100))), falta = W.diasEntre(c.hoje, o.eta);
        return `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between"><button class="btn ghost sm" data-op="${esc(o.id)}"><b class="mono">${esc(o.id)}</b> ${esc(o.navio || '')}</button><span class="note">ETA ${W.dataBR(o.eta).slice(0, 5)} · ${falta < 0 ? 'chegou' : falta + ' dia(s)'}</span></div><div style="height:7px;border-radius:99px;background:var(--surface-2);overflow:hidden;margin-top:4px"><i style="display:block;height:100%;width:${feito}%;background:var(--blue)"></i></div></div>`; }).join('') : vazio('Nenhuma operação no mar.') };
    },
    lancVencidos(c) {
      const xs = c.lv().filter(x => !x.avisado), top = xs.slice(0, 5), resto = xs.slice(5);
      return { t: 'Lançamentos vencidos sem baixa', nota: '', acoes: '<button class="btn ghost sm" data-ir="vencidos">Ir para Lançamentos →</button>', corpo: top.length ? top.map(x => alerta(x.nivel === 'matheus' ? 'ambar' : 'vermelho', esc(`${W.daOperacao(x.l) ? x.l.op + ' · ' : ''}${x.l.desc || x.l.categoria || 'lançamento'}`),
        esc(`${W.ehReceita(x.l) ? 'receber' : 'pagar'} · venceu ${W.dataBR(W.vencDe(x.l)).slice(0, 5)} · há ${x.dias} dia(s)${x.nivel === 'davi' ? ' · já na Torre do Davi' : x.nivel === 'samir' ? ' · já na Torre do Samir' : ''}`), esc(brl(x.l.valor)),
        `<div class="btns"><button class="btn ghost sm" data-baixa2="${esc(x.l._id)}">Dar baixa</button><button class="btn ghost sm" data-avisar="${esc(x.l._id)}">Não pago · avisar Samir</button></div>`)).join('')
        + (resto.length ? `<p class="note">+ ${resto.length} lançamento(s) · ${esc(brl(resto.reduce((a, x) => a + (+x.l.valor || 0), 0)))}</p>` : '') : vazio('Nenhum lançamento vencido sem baixa.') };
    },
    ponto() { return { t: 'Meu ponto hoje', nota: '', corpo: H.pontoCardTorre ? H.pontoCardTorre() : '<button class="btn sm" data-ir="ponto">Abrir o ponto</button>' }; },
    recados(c) {
      const rs = W.recadosPara(c.db, c.pk, c.hoje).slice(0, 6);
      return { t: 'Recados', nota: '', acoes: '<button class="btn sm blue" data-recado>+ Recado</button>', corpo: rs.length ? rs.map(r => alerta(r.prio === 'alta' ? 'vermelho' : 'azul', esc(r.texto), esc(`${r.por || ''} · ${W.dataBR(r.em)}`), '', `<button class="btn ghost sm" data-feito="${esc(r._id)}">Feito</button>`)).join('') : vazio('Nenhum recado.') };
    }
  };

  /* ---------- Tela ---------- */
  H.telas.torre = function (el) {
    const db = H.db, abas = W.abasVisiveis(db, H.userKey);
    if (!abas.length) { el.innerHTML = '<div class="head"><div><h1>Torre de Controle</h1></div></div><div class="banner">Sua função não tem Torre. Use a Agenda e o Ponto no menu.</div>'; return; }
    if (!S.aba || !abas.includes(S.aba)) S.aba = W.funcaoDoUsuario(db, H.userKey) || abas[0];
    const c = contexto(S.aba), lay = W.layoutDe(db, H.userKey, S.aba);
    const blocos = lay.blocos.map(id => { let r; try { r = B[id](c); } catch (e) { console.error(e); r = { t: W.BLOCOS_TORRE[id].l, corpo: '<p class="empty">Não consegui montar este bloco.</p>' }; }
      return `<section class="box ${r.largo ? 'larga' : ''}" data-bloco="${id}"><div class="box-h"><h2>${esc(r.t)}</h2><div class="btns">${r.nota ? `<span class="note">${esc(r.nota)}</span>` : ''}${r.acoes || ''}</div></div><div class="box-b" style="display:flex;flex-direction:column;gap:8px">${r.corpo}</div></section>`; }).join('');
    const dia = new Date(c.hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    el.innerHTML = `<div class="head"><div><h1>Torre de Controle · ${esc(W.FUNCOES[S.aba])}</h1><p class="sub">${esc(W.perfilDe(db, c.pk).nome)} · ${esc(dia)}</p></div>
        <div class="btns"><button class="btn" data-personalizar>Personalizar</button>${H.novaOperacao && H.pode('fin.lancar') ? '<button class="btn pri" data-nova>+ Nova operação</button>' : ''}</div></div>
      ${abas.length > 1 ? `<div class="tabs" role="tablist" style="margin-bottom:12px">${abas.map(a => `<button role="tab" data-aba="${a}" aria-selected="${a === S.aba}">${esc(W.FUNCOES[a])}</button>`).join('')}</div>` : ''}
      <div class="kpis" style="margin-bottom:14px">${lay.cards.map(id => cartao(id, c)).join('')}</div>
      <div class="torre">${blocos || '<p class="empty">Nenhum bloco. Use “Personalizar”.</p>'}</div>`;
    ligar(el, c);
  };

  function ligar(el, c) {
    const db = H.db, eu = H.nomeUsuario(H.userKey);
    el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { S.aba = b.dataset.aba; H.render(); });
    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => { const [t, p] = b.dataset.ir.split('|'); if (t === 'vencidos') return H.lancVencidos && H.lancVencidos(); H.ir(t, p || null); });
    el.querySelectorAll('[data-op]').forEach(b => b.onclick = e => { e.stopPropagation(); H.ir('ficha', b.dataset.op); });
    el.querySelectorAll('[data-desemb]').forEach(b => b.onclick = () => H.ir('desembolso', b.dataset.desemb));
    el.querySelectorAll('[data-cot]').forEach(b => b.onclick = () => H.ir('cotacoes', b.dataset.cot));
    el.querySelectorAll('[data-etapa]').forEach(b => b.onclick = () => { H.filtroEtapaOps = b.dataset.etapa; H.ir('ops'); });
    el.querySelectorAll('[data-pessoa]').forEach(b => b.onclick = () => { H.agendaPessoa = b.dataset.pessoa; H.ir('agenda'); });
    const trav = c.trav().itens;
    el.querySelectorAll('[data-trav]').forEach(b => b.onclick = () => { const x = trav[+b.dataset.trav]; if (!x || !x.acao) return; const [t, p] = x.acao.ir; if (t === 'lanc' && p === 'vencidos') return H.lancVencidos(); H.ir(t, p || null); });
    el.querySelectorAll('[data-tarefa]').forEach(b => b.onclick = () => {
      const t = (db.agendaTasks || []).find(x => x && x._id === b.dataset.tarefa); if (!t) return H.render();
      if (W.concluirTarefa) W.concluirTarefa(t, eu, new Date().toISOString()); else { t.status = 'feita'; t.doneAt = W.hojeISO(); }
      H.salvar(); H.toast('Tarefa concluída'); H.render();
    });
    el.querySelectorAll('[data-baixa2]').forEach(b => b.onclick = () => { const l = db.fin.find(x => x && x._id === b.dataset.baixa2); if (l && H.darBaixa) H.darBaixa(l); });
    el.querySelectorAll('[data-avisar]').forEach(b => b.onclick = () => {
      const l = db.fin.find(x => x && x._id === b.dataset.avisar); const r = W.avisarSamirLanc(db, l, eu);
      if (!r.ok) return H.toast(esc(r.msg)); H.salvar(); H.toast('Samir avisado: o recado está na Torre dele.'); H.render();
    });
    el.querySelectorAll('[data-feito]').forEach(b => b.onclick = () => { const r = (db.hubRecados || []).find(x => x && x._id === b.dataset.feito); if (!r) return; r.feito = Object.assign({}, r.feito, { [c.pk]: new Date().toISOString() }); H.salvar(); H.render(); });
    el.querySelectorAll('[data-recado]').forEach(b => b.onclick = () => novoRecado(c.pk));
    const nv = el.querySelector('[data-nova]'); if (nv) nv.onclick = () => H.novaOperacao();
    el.querySelector('[data-personalizar]').onclick = () => personalizar(S.aba);
  }

  /* ---------- Personalizar: 6 cartões e a ordem dos blocos, só com o permitido para o perfil ---------- */
  function personalizar(aba) {
    const db = H.db, lay = W.layoutDe(db, H.userKey, aba), p = lay.permitidos;
    let cards = lay.cards.slice(), blocos = lay.blocos.slice();
    const m = H.modal('Personalizar · Torre ' + W.FUNCOES[aba], '<div id="pz"></div>', '<button class="btn" id="pzpad" style="margin-right:auto">Voltar ao padrão</button><button class="btn" data-x>Cancelar</button><button class="btn blue" id="pzok">Salvar</button>');
    const desenhar = () => {
      const fora = p.blocos.filter(id => !blocos.includes(id));
      m.querySelector('#pz').innerHTML = `<h3 class="h3">6 cartões do topo</h3><div class="fields">${[0, 1, 2, 3, 4, 5].map(i => `<div class="f"><label class="lbl" for="pzc${i}">Cartão ${i + 1}</label><select id="pzc${i}" data-card="${i}">${p.cards.map(id => `<option value="${id}" ${cards[i] === id ? 'selected' : ''}>${esc(W.CARDS_TORRE[id].l)}</option>`).join('')}</select></div>`).join('')}</div>
        <h3 class="h3" style="margin-top:12px">Blocos (marque e ordene)</h3><div class="list">${blocos.map((id, i) => `<div class="row"><label><input type="checkbox" data-bl="${id}" checked style="width:auto"> ${esc(W.BLOCOS_TORRE[id].l)}</label><div class="btns"><button class="btn ghost sm" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button class="btn ghost sm" data-down="${i}" ${i < blocos.length - 1 ? '' : 'disabled'} aria-label="Descer">↓</button></div></div>`).join('')}
        ${fora.map(id => `<div class="row" style="opacity:.6"><label><input type="checkbox" data-bl="${id}" style="width:auto"> ${esc(W.BLOCOS_TORRE[id].l)}</label></div>`).join('')}</div>`;
      m.querySelectorAll('[data-card]').forEach(s => s.onchange = () => { cards[+s.dataset.card] = s.value; });
      m.querySelectorAll('[data-bl]').forEach(x => x.onchange = () => { blocos = x.checked ? blocos.concat([x.dataset.bl]) : blocos.filter(y => y !== x.dataset.bl); desenhar(); });
      m.querySelectorAll('[data-up]').forEach(x => x.onclick = () => { const i = +x.dataset.up; [blocos[i - 1], blocos[i]] = [blocos[i], blocos[i - 1]]; desenhar(); });
      m.querySelectorAll('[data-down]').forEach(x => x.onclick = () => { const i = +x.dataset.down; [blocos[i + 1], blocos[i]] = [blocos[i], blocos[i + 1]]; desenhar(); });
    };
    desenhar();
    m.querySelector('#pzok').onclick = () => { const r = W.salvarLayout(db, H.userKey, aba, { cards, blocos }); if (!r.ok) return H.toast(esc(r.msg)); H.salvar(); H.fecharModal(); H.toast('Torre salva'); H.render(); };
    m.querySelector('#pzpad').onclick = () => { W.voltarPadrao(db, H.userKey, aba); H.salvar(); H.fecharModal(); H.toast('Torre de volta ao padrão da função'); H.render(); };
  }

  /* ---------- Recados ---------- */
  function novoRecado(kPadrao) {
    const db = H.db, outros = W.pode(db, H.userKey, 'recado.outros'), pessoas = Object.keys(db.users || {});
    const m = H.modal('Fixar recado na torre', `<div class="fields"><div class="f w4"><label class="lbl" for="rt">Recado</label><input id="rt" maxlength="200"></div>
      <div class="f w2"><label class="lbl" for="rp">Para</label><select id="rp">${outros ? `<option value="todos">Todos</option>${pessoas.map(p => `<option value="${esc(p)}" ${p === kPadrao ? 'selected' : ''}>${esc(H.nomeUsuario(p))}</option>`).join('')}` : `<option value="${esc(H.userKey)}">Só para mim</option>`}</select></div>
      <div class="f"><label class="lbl" for="rpr">Prioridade</label><select id="rpr"><option value="normal">Normal</option><option value="alta">Alta</option></select></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="rok">Fixar</button>');
    m.querySelector('#rok').onclick = () => {
      const texto = m.querySelector('#rt').value.trim(); if (!texto) return H.toast('Escreva o recado');
      if (!Array.isArray(db.hubRecados)) db.hubRecados = [];
      db.hubRecados.unshift({ _id: W.novoId(), texto, para: m.querySelector('#rp').value, prio: m.querySelector('#rpr').value, ate: '', op: '', por: H.nomeUsuario(H.userKey), em: new Date().toISOString(), feito: {} });
      H.salvar(); H.fecharModal(); H.toast('Recado fixado'); H.render();
    };
  }
})();
