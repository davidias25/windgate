/* Hub 2.0 — Torre de Controle por função.
   Cada pessoa vê os painéis do seu perfil (W.PERFIS), na ordem que escolher.
   A diretoria pode montar a torre de outra pessoa e todos podem fixar recados. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;

  const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const FASE_DA_ETAPA = { cotacao: 0, contrato: 0, producao: 1, preparacao_embarque: 1, container_enviado_porto: 1, embarcado: 2, chegada: 3, logistica: 4, documentacao: 4, entregue: 4, concluida: 4, travada: 0 };
  const FASES = ['Fechamento', 'Produção/Embarque', 'Trânsito', 'Desembaraço', 'Entrega'];
  const meuOp = (o, nome) => String(o.resp || '').split(/[\s/,]+/).includes(nome);

  let verComo = null;          // diretoria: ver a torre de outra pessoa
  let filtroEtapa = null, soMinhas = false;

  /* ---------- Dados derivados (um só cálculo por render) ---------- */
  function contexto(k) {
    const db = H.db, hoje = W.hojeISO(), nome = H.nomeUsuario(k);
    const perfil = W.perfilDe(db, k), cap = c => perfil.caps.includes(c);
    const ativas = db.ops.filter(o => o && o.id && W.ativa(o));
    const opMap = Object.fromEntries(db.ops.filter(o => o && o.id).map(o => [o.id, o]));

    const pend = [], aRevisar = [];
    ativas.forEach(o => {
      const l = db.checklists[o.id]; if (!Array.isArray(l)) return;
      const faseOp = FASE_DA_ETAPA[o.status] == null ? 0 : FASE_DA_ETAPA[o.status];
      l.forEach((it, i) => {
        if (!it) return;
        const fi = FASES.indexOf(it.fase);
        if (it.status === 'pendente' && fi <= faseOp) pend.push({ o, it, i, atrasado: fi < faseOp || (it.prazo && it.prazo < hoje) });
        if (it.status === 'coletado') aRevisar.push({ o, it, i });
      });
    });
    pend.sort((a, b) => (b.atrasado - a.atrasado) || String(a.o.eta || '9').localeCompare(String(b.o.eta || '9')));

    const fretesFechados = new Set((db.fretes || []).filter(f => f && f.status === 'Fechado').map(f => f.op));
    const preEmbarque = ativas.filter(o => ['contrato', 'producao', 'preparacao_embarque', 'container_enviado_porto'].includes(o.status)).map(o => {
      const falta = [];
      if (!fretesFechados.has(o.id)) falta.push('frete não fechado');
      if (['preparacao_embarque', 'container_enviado_porto'].includes(o.status)) {
        if (!o.navio) falta.push('sem navio'); if (!o.embarque) falta.push('sem data de embarque');
        if (!(o.containers || []).length) falta.push('sem contêiner');
      }
      return { o, falta };
    }).filter(x => x.falta.length);
    const transito = ativas.filter(o => ['embarcado', 'container_enviado_porto', 'chegada'].includes(o.status))
      .sort((a, b) => String(a.eta || '9').localeCompare(String(b.eta || '9')));

    const em3 = somaDias(hoje, -3), ate10 = somaDias(hoje, 10), ate7 = somaDias(hoje, 7);
    const clientes = [];
    ativas.forEach(o => {
      const p = W.prazoInfo(db, o, hoje);
      if (W.soData(o.statusEm) >= em3) clientes.push({ o, motivo: `entrou em ${W.stMeta(o.status).l}`, tipo: 'etapa' });
      else if (o.eta && W.soData(o.eta) >= hoje && W.soData(o.eta) <= ate10 && ['embarcado', 'container_enviado_porto'].includes(o.status)) clientes.push({ o, motivo: `chega em ${W.diasEntre(hoje, o.eta)} dia(s)`, tipo: 'eta' });
      else if (p.sit === 'atrasado') clientes.push({ o, motivo: `${W.stMeta(o.status).l} com ${p.atraso} dia(s) de atraso`, tipo: 'atraso' });
    });

    const fin = (db.fin || []).filter(l => l && !W.transferencia(l));
    const vencidosSemBaixa = fin.filter(l => !W.realizado(l) && W.vencDe(l) && W.vencDe(l) < hoje);
    const semComprovante = fin.filter(l => W.realizado(l) && !l.comp && W.mesDe(l.liquidadoEm || W.vencDe(l)) === hoje.slice(0, 7));
    const pagarSemana = W.contasAbertas(db, 'Despesa', ate7, 'todas');
    const aAutorizar = W.contasAbertas(db, 'Despesa', ate10, 'todas').filter(l => !l.autorizadoEm);
    const receberSemana = W.contasAbertas(db, 'Receita', ate7, 'todas');
    const cotacoesAprovar = (db.qindex || []).filter(q => q && q.status === 'wait');
    const tarefas = (db.agendaTasks || []).filter(t => t && t.resp === nome && t.status !== 'feita')
      .sort((a, b) => String(a.prazo || '9').localeCompare(String(b.prazo || '9')));
    const recados = W.recadosPara(db, k, hoje);
    const alertas = W.alertas(db, hoje).filter(a => a.tela !== 'fin' || cap('fin.ver') || cap('fin.lancar'));
    const atrasadas = ativas.filter(o => W.prazoInfo(db, o, hoje).sit === 'atrasado');
    const chegando = ativas.filter(o => { const d = W.diasEntre(hoje, o.eta); return d != null && d >= 0 && d <= 15 && ['embarcado', 'container_enviado_porto'].includes(o.status); });
    const mes = hoje.slice(0, 7), fechadas = W.fechadasNoMes(db, mes);
    const meta = +(((db.hubPainel || {})._meta || {}).mensal || {})[mes] || 0;
    return { db, k, nome, hoje, perfil, cap, ativas, opMap, pend, aRevisar, preEmbarque, transito, clientes, vencidosSemBaixa, semComprovante,
      pagarSemana, aAutorizar, receberSemana, cotacoesAprovar, tarefas, recados, alertas, atrasadas, chegando, mes, fechadas, meta };
  }

  /* ---------- Painéis ---------- */
  const vazio = t => `<p class="empty">${t}</p>`;
  const linhaOp = o => `<b class="mono">${esc(o.id)}</b> <span class="note">${esc(o.cliente || '')}</span>`;
  const mais = (n, lim) => n > lim ? `<p class="note" style="padding:6px 14px">+ ${n - lim} item(ns)</p>` : '';

  const P = {
    resumo(c) {
      const k = [];
      const kpi = (lbl, v, d, cls, alvo) => k.push(`<${alvo ? `button data-ir="${alvo}"` : 'div'} class="kpi"><span class="lbl">${lbl}</span><span class="v">${v}</span><span class="d ${cls || ''}">${d}</span></${alvo ? 'button' : 'div'}>`);
      kpi('Operações ativas', c.ativas.length, `${c.chegando.length} chegam em 15 dias`, '', 'ops');
      kpi('Fora do prazo', c.atrasadas.length, c.atrasadas.length ? c.atrasadas.slice(0, 3).map(o => o.id).join(', ') : 'tudo no prazo', c.atrasadas.length ? 'bad' : 'good');
      const id = c.perfil.id;
      if (id === 'documentos') {
        kpi('Documentos a coletar', c.pend.length, c.pend.filter(x => x.atrasado).length + ' atrasado(s)', c.pend.some(x => x.atrasado) ? 'bad' : '');
        kpi('Clientes a atualizar', c.clientes.length, 'mudança de etapa, chegada ou atraso');
      }
      if (id === 'frete') {
        kpi('Pendências de frete', c.preEmbarque.length, 'antes do embarque', c.preEmbarque.length ? 'bad' : 'good');
        kpi('Em trânsito', c.transito.length, c.transito.filter(o => !o.tracking && !(o.containers || []).length).length + ' sem tracking');
        kpi('A lançar / conferir', c.vencidosSemBaixa.length + c.semComprovante.length, `${c.vencidosSemBaixa.length} sem baixa · ${c.semComprovante.length} sem comprovante`, c.vencidosSemBaixa.length ? 'bad' : '', 'lanc');
      }
      if (id === 'operacoes' || id === 'diretoria') {
        const p = W.painelMes(c.db, c.mes, 'todas', c.hoje);
        if (id === 'operacoes') kpi('Docs para revisar', c.aRevisar.length, 'coletados, aguardando você');
        kpi('A receber no mês', W.fmtBRLk(p.receber), p.vencidoReceber ? W.fmtBRLk(p.vencidoReceber) + ' vencido' : 'nada vencido', p.vencidoReceber ? 'bad' : '', 'contas');
        kpi('A pagar no mês', W.fmtBRLk(p.pagar), p.vencidoPagar ? W.fmtBRLk(p.vencidoPagar) + ' vencido' : 'nada vencido', p.vencidoPagar ? 'bad' : '', 'contas');
        if (id === 'diretoria') kpi('Aguardando você', c.aAutorizar.length + c.cotacoesAprovar.length, `${c.aAutorizar.length} pagamento(s) · ${c.cotacoesAprovar.length} cotação(ões)`, c.aAutorizar.length + c.cotacoesAprovar.length ? 'bad' : 'good');
      }
      kpi('Fechadas no mês', c.fechadas.length + (c.meta ? ' / ' + c.meta : ''), c.meta ? Math.round(c.fechadas.length / c.meta * 100) + '% da meta do time' : 'meta do time não definida', c.meta && c.fechadas.length >= c.meta ? 'good' : '');
      return { largo: true, cru: `<div class="kpis">${k.join('')}</div>` };
    },

    etapas(c) {
      const etapas = W.STATUS_OP.filter(s => !W.FINALIZADAS.includes(s.k));
      return { largo: true, cru: `<div class="pipe" aria-label="Operações por etapa">${etapas.map(s => { const n = c.ativas.filter(o => o.status === s.k); const late = n.filter(o => W.prazoInfo(c.db, o, c.hoje).sit === 'atrasado').length;
        return `<button class="stage${filtroEtapa === s.k ? ' on' : ''}" data-f="${s.k}"><div class="n" style="color:${s.c}">${n.length}</div><div class="t">${esc(s.l)}</div>${late ? `<span class="late">${late} atras.</span>` : ''}</button>`; }).join('')}</div>` };
    },

    operacoes(c) {
      let lista = filtroEtapa ? c.ativas.filter(o => o.status === filtroEtapa) : c.ativas.slice();
      const temMinhas = c.ativas.some(o => meuOp(o, c.nome));
      if (soMinhas && temMinhas) lista = lista.filter(o => meuOp(o, c.nome));
      lista.sort((a, b) => W.prazoInfo(c.db, b, c.hoje).atraso - W.prazoInfo(c.db, a, c.hoje).atraso || W.FLUXO.indexOf(b.status) - W.FLUXO.indexOf(a.status));
      return { largo: true, acoes: `${filtroEtapa ? `<button class="btn sm" data-f="">${esc(W.stMeta(filtroEtapa).l)} ✕</button>` : ''}${temMinhas ? `<button class="btn sm ${soMinhas ? 'blue' : ''}" data-minhas>Só as minhas</button>` : ''}<span class="note">${lista.length}</span>`,
        corpo: H.tabelaOps(lista, { compacta: true }) };
    },

    alertas(c) {
      return { corpo: `<div class="box-b">${c.alertas.length ? c.alertas.slice(0, 8).map(a => `<div class="alert ${a.nivel}"><span class="s"></span><div><b>${esc(a.titulo)}</b><small>${esc(a.detalhe || '')}</small></div>${a.op ? `<button class="btn sm" data-op="${esc(a.op)}">Abrir</button>` : a.tela ? `<button class="btn sm" data-ir="${c.cap('fin.ver') ? a.tela : 'lanc'}">Ver</button>` : ''}</div>`).join('') : vazio('Nenhum alerta. Tudo em dia.')}</div>` };
    },

    recados(c) {
      const quem = r => r.para === 'todos' ? 'para todos' : r.para === c.k ? 'para você' : 'para ' + esc(H.nomeUsuario(r.para));
      return { acoes: `<button class="btn sm blue" data-recado>+ Recado</button>`,
        corpo: `<div class="box-b list">${c.recados.length ? c.recados.map(r => `<div class="row recado ${r.prio === 'alta' ? 'alta' : ''}"><div><b>${esc(r.texto)}</b>${r.op ? ` · <a href="#" data-op="${esc(r.op)}">${esc(r.op)}</a>` : ''}<br>
          <small class="note">${esc(r.por || '')} · ${W.dataBR(r.em)} · ${quem(r)}${r.ate ? ' · até ' + W.dataBR(r.ate) : ''}</small></div>
          <div class="btns"><button class="btn sm" data-feito="${esc(r._id)}">Feito</button>${r.por === H.nomeUsuario(H.userKey) || W.pode(c.db, H.userKey, 'recado.outros') ? `<button class="btn ghost sm" data-delrec="${esc(r._id)}" title="Remover para todos">✕</button>` : ''}</div></div>`).join('')
          : vazio('Nenhum recado. Use “+ Recado” para fixar uma prioridade aqui.')}</div>` };
    },

    tarefas(c) {
      return { acoes: `<a class="btn sm" href="/?aba=agenda">Agenda</a>`,
        corpo: `<div class="box-b list">${c.tarefas.length ? c.tarefas.slice(0, 8).map(t => { const atr = t.prazo && t.prazo < c.hoje;
          return `<div class="row"><div><b>${esc(t.t || '')}</b><br><small class="note">${t.prazo ? (atr ? '<span style="color:var(--crit)">venceu ' + W.dataBR(t.prazo) + '</span>' : 'até ' + W.dataBR(t.prazo)) : 'sem prazo'}${t.prio ? ' · ' + esc(t.prio) : ''}${t.por && t.por !== c.nome ? ' · de ' + esc(t.por) : ''}</small></div><button class="btn sm" data-tarefa="${esc(t._id)}">Concluir</button></div>`; }).join('') + mais(c.tarefas.length, 8)
          : vazio('Nenhuma tarefa aberta para você.')}</div>` };
    },

    coletar(c) {
      return { acoes: `<span class="note">da etapa atual de cada operação</span>`,
        corpo: c.pend.length ? `<div class="tw"><table><thead><tr><th>Operação</th><th>Documento</th><th>Fase</th><th></th></tr></thead><tbody>${c.pend.slice(0, 10).map(x => `<tr class="click" data-op="${esc(x.o.id)}"><td>${linhaOp(x.o)}</td><td>${esc(x.it.titulo)}${x.atrasado ? ' <span class="pill crit">atrasado</span>' : ''}</td><td class="note">${esc(x.it.fase)}</td><td class="num"><span class="note">abrir ›</span></td></tr>`).join('')}</tbody></table></div>${mais(c.pend.length, 10)}`
          : vazio('Nenhum documento pendente para a etapa atual das operações.') };
    },

    revisar(c) {
      return { acoes: `<span class="note">dupla análise: quem revisa não pode ser quem coletou</span>`,
        corpo: c.aRevisar.length ? `<div class="tw"><table><thead><tr><th>Operação</th><th>Documento</th><th>Coletado por</th><th></th></tr></thead><tbody>${c.aRevisar.slice(0, 10).map(x => `<tr class="click" data-op="${esc(x.o.id)}"><td>${linhaOp(x.o)}</td><td>${esc(x.it.titulo)}${x.it.link ? ` · <a href="${esc(x.it.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">abrir arquivo</a>` : ''}</td><td>${esc(x.it.coletadoPor || '—')}</td><td class="num"><span class="note">revisar ›</span></td></tr>`).join('')}</tbody></table></div>${mais(c.aRevisar.length, 10)}`
          : vazio('Nada aguardando revisão.') };
    },

    clientes(c) {
      return { acoes: `<span class="note">mensagem pronta para WhatsApp</span>`,
        corpo: `<div class="box-b list">${c.clientes.length ? c.clientes.slice(0, 10).map(x => `<div class="row"><div>${linhaOp(x.o)}<br><small class="note">${esc(x.motivo)}</small></div><div class="btns"><button class="btn sm" data-msg="${esc(x.o.id)}" data-tipo="${x.tipo}">Copiar mensagem</button><button class="btn ghost sm" data-op="${esc(x.o.id)}">Ficha</button></div></div>`).join('') + mais(c.clientes.length, 10)
          : vazio('Nenhum cliente precisando de atualização hoje.')}</div>` };
    },

    fretes(c) {
      const neg = (c.db.fretes || []).filter(f => f && f.status === 'Negociando' && (!f.resp || f.resp === c.nome)).length;
      return { acoes: `<a class="btn sm" href="/?aba=frete">Cotações de frete${neg ? ' · ' + neg + ' negociando' : ''}</a>`,
        corpo: c.preEmbarque.length ? `<div class="tw"><table><thead><tr><th>Operação</th><th>Etapa</th><th>O que falta</th></tr></thead><tbody>${c.preEmbarque.slice(0, 10).map(x => `<tr class="click" data-op="${esc(x.o.id)}"><td>${linhaOp(x.o)}</td><td>${H.pillStatus(x.o.status)}</td><td>${x.falta.map(f => `<span class="pill warn">${esc(f)}</span>`).join(' ')}</td></tr>`).join('')}</tbody></table></div>${mais(c.preEmbarque.length, 10)}`
          : vazio('Frete e embarque em dia para as operações antes do embarque.') };
    },

    transito(c) {
      return { acoes: `<button class="btn sm" data-ir="mapa">Mapa</button>`,
        corpo: c.transito.length ? `<div class="tw"><table><thead><tr><th>Operação</th><th>Navio</th><th>ETA</th><th class="num">Faltam</th><th>Tracking</th></tr></thead><tbody>${c.transito.slice(0, 10).map(o => { const d = W.diasEntre(c.hoje, o.eta);
          return `<tr class="click" data-op="${esc(o.id)}"><td>${linhaOp(o)}</td><td>${esc(o.navio || '—')}</td><td class="mono">${W.dataBR(o.eta)}</td><td class="num">${d == null ? '—' : d < 0 ? 'chegou' : d + ' d'}</td><td>${o.tracking ? `<a href="${esc(o.tracking)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">armador ↗</a>` : (o.containers || []).length ? '<span class="note">contêiner ok</span>' : '<span class="pill warn">sem tracking</span>'}</td></tr>`; }).join('')}</tbody></table></div>`
          : vazio('Nenhuma operação no mar agora.') };
    },

    lancar(c) {
      const linhas = c.vencidosSemBaixa.map(l => ({ l, o: 'Venceu sem baixa' })).concat(c.semComprovante.map(l => ({ l, o: 'Pago sem comprovante' })));
      return { acoes: `<button class="btn sm blue" data-novolanc>+ Lançamento</button>`,
        corpo: linhas.length ? `<div class="tw"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead><tbody>${linhas.slice(0, 10).map(({ l, o }) => `<tr><td class="mono">${W.dataBR(W.vencDe(l))}<br><span class="pill ${o.startsWith('Venceu') ? 'crit' : 'warn'}">${o}</span></td><td>${esc(l.desc || l.categoria || '—')}<br><small class="note mono">${esc(l.op || '')} · ${W.ehReceita(l) ? 'receber' : 'pagar'}</small></td><td class="num">${W.fmtBRL(l.valor)}</td>
          <td class="num">${W.realizado(l) ? `<button class="btn sm" data-ed="${esc(l._id)}">Anexar</button>` : `<button class="btn sm" data-baixa="${esc(l._id)}">Dar baixa</button>`}</td></tr>`).join('')}</tbody></table></div>${mais(linhas.length, 10)}`
          : vazio('Nada para lançar ou conferir. Tudo com baixa e comprovante.') };
    },

    pagar(c) {
      return { acoes: `<button class="btn sm" data-ir="contas">Contas</button>`,
        corpo: c.pagarSemana.length ? `<div class="tw"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th class="num">Valor</th><th>Autorização</th><th></th></tr></thead><tbody>${c.pagarSemana.slice(0, 10).map(l => `<tr><td class="mono">${W.dataBR(W.vencDe(l))}${W.vencDe(l) < c.hoje ? ' <span class="pill crit">vencido</span>' : ''}</td><td>${esc(l.desc || l.categoria || '—')} <span class="note mono">${esc(l.op || '')}</span></td><td class="num"><b>${W.fmtBRL(l.valor)}</b></td><td>${l.autorizadoEm ? `<span class="pill ok">ok · ${esc(l.autorizadoPor || '')}</span>` : '<span class="pill warn">aguardando Samir</span>'}</td><td class="num"><button class="btn sm" data-baixa="${esc(l._id)}">Pagar</button></td></tr>`).join('')}</tbody></table></div>${mais(c.pagarSemana.length, 10)}`
          : vazio('Nenhum pagamento nos próximos 7 dias.') };
    },

    caixa(c) {
      const s = l => l.reduce((a, x) => a + (+x.valor || 0), 0);
      const rv = c.receberSemana.filter(l => W.vencDe(l) < c.hoje), pv = c.pagarSemana.filter(l => W.vencDe(l) < c.hoje);
      const p = W.painelMes(c.db, c.mes, 'todas', c.hoje);
      return { acoes: `<button class="btn sm" data-ir="fin">Painel & DRE</button>`, corpo: `<div class="box-b"><table class="mini"><tbody>
        <tr><td>A receber em 7 dias</td><td class="num"><b>${W.fmtBRL(s(c.receberSemana))}</b></td><td class="note">${c.receberSemana.length} conta(s)${rv.length ? ` · <span style="color:var(--crit)">${rv.length} vencida(s)</span>` : ''}</td></tr>
        <tr><td>A pagar em 7 dias</td><td class="num"><b>${W.fmtBRL(s(c.pagarSemana))}</b></td><td class="note">${c.pagarSemana.length} conta(s)${pv.length ? ` · <span style="color:var(--crit)">${pv.length} vencida(s)</span>` : ''}</td></tr>
        <tr><td>Saldo da semana</td><td class="num ${s(c.receberSemana) - s(c.pagarSemana) < 0 ? 'neg' : 'pos'}"><b>${W.fmtBRL(s(c.receberSemana) - s(c.pagarSemana))}</b></td><td class="note">entradas − saídas previstas</td></tr>
        <tr><td>Realizado no mês</td><td class="num ${p.resultadoRealizado < 0 ? 'neg' : 'pos'}"><b>${W.fmtBRL(p.resultadoRealizado)}</b></td><td class="note">recebido ${W.fmtBRLk(p.recebido)} − pago ${W.fmtBRLk(p.pago)}</td></tr></tbody></table></div>` };
    },

    aprovacoes(c) {
      const linhas = c.aAutorizar.slice(0, 8).map(l => `<div class="row"><div><b>${W.fmtBRL(l.valor)}</b> · ${esc(l.desc || l.categoria || '—')} <span class="note mono">${esc(l.op || '')}</span><br><small class="note">vence ${W.dataBR(W.vencDe(l))}${l.por ? ' · lançado por ' + esc(l.por) : ''}</small></div><button class="btn sm blue" data-aut="${esc(l._id)}">Autorizar</button></div>`)
        .concat(c.cotacoesAprovar.slice(0, 6).map(q => `<div class="row"><div><b>Cotação ${esc(q.label || q.id || '')}</b><br><small class="note">${esc(q.cliente || '')} · de ${esc(q.criadoPor || '—')}</small></div><a class="btn sm" href="/?aba=cotacoes">Revisar</a></div>`));
      return { acoes: `<span class="note">pagamentos até 10 dias e cotações</span>`, corpo: `<div class="box-b list">${linhas.length ? linhas.join('') : vazio('Nada aguardando sua aprovação.')}</div>` };
    },

    vendas(c) {
      const hoje = c.hoje, amanha = somaDias(hoje, 1);
      const ns = (c.db.crmOps || []).filter(n => n && W.negocioAberto(n) && (c.perfil.id === 'diretoria' ? true : n.resp === c.nome))
        .map(n => ({ n, sla: W.slaNegocio(n, hoje), px: n.proxData || n.prazo }))
        .filter(x => x.sla.sit !== 'ok' || (x.px && x.px <= amanha))
        .sort((a, b) => (b.sla.sit === 'atrasado') - (a.sla.sit === 'atrasado') || String(a.px || '9').localeCompare(String(b.px || '9')));
      const novos = (c.db.hubPedidos || []).filter(p => p && p.status === 'novo').length;
      const cli = id => (c.db.crm || []).find(x => x && x._id === id);
      return { acoes: `<button class="btn sm" data-ir="pedidos">Pedidos${novos ? ' · ' + novos + ' novo(s)' : ''}</button><button class="btn sm" data-ir="crm">Funil</button>`,
        corpo: `<div class="box-b list">${ns.length ? ns.slice(0, 8).map(x => `<div class="row"><div><b>${esc(W.nomeCliente(cli(x.n.clienteId)) || x.n.titulo)}</b> · <span class="note">${esc(W.faseMeta(W.faseDe(x.n)).l)}${c.perfil.id === 'diretoria' ? ' · ' + esc(x.n.resp || '') : ''}</span><br>
          <small class="${x.sla.sit === 'atrasado' ? 'neg' : 'note'}">${esc(x.n.prox || 'Definir próxima ação')}${x.px ? ' · ' + W.dataBR(x.px) : ''}${x.sla.sit === 'atrasado' ? ' · ' + esc(x.sla.motivo) : ''}</small></div><button class="btn sm" data-ir="crm">Abrir</button></div>`).join('') + mais(ns.length, 8)
          : vazio('Nenhum negócio pedindo ação hoje.')}</div>` };
    },

    equipe(c) {
      const pessoas = Object.keys(c.db.users || {}).filter(k => W.perfilDe(c.db, k).id !== 'diretoria').map(k => ({ k, d: W.desempenho(c.db, H.nomeUsuario(k), c.mes, c.hoje), perfil: W.perfilDe(c.db, k) }));
      const pct = c.meta ? Math.min(100, Math.round(c.fechadas.length / c.meta * 100)) : 0;
      return { largo: true, acoes: `${W.pode(c.db, H.userKey, 'meta.editar') ? '<button class="btn sm" data-meta>Meta do mês</button>' : ''}<span class="note">${c.mes.split('-').reverse().join('/')}</span>`,
        corpo: `<div class="box-b"><div class="meta"><div><b>Meta do time · importações fechadas</b><br><small class="note">${c.fechadas.length ? esc(c.fechadas.join(', ')) : 'nenhuma ainda neste mês'}</small></div>
          <div class="meta-bar"><i style="width:${pct}%"></i></div><b>${c.fechadas.length}${c.meta ? ' / ' + c.meta : ''}</b></div></div>
          <div class="tw"><table><thead><tr><th>Pessoa</th><th class="num">Etapas avançadas</th><th class="num">Docs coletados</th><th class="num">Docs revisados</th><th class="num">Lançamentos</th><th class="num">Tarefas feitas</th><th class="num">Tarefas atrasadas</th><th class="num">Ops sob resp. (atrasadas)</th></tr></thead><tbody>
          ${pessoas.map(({ k, d, perfil }) => `<tr><td><b>${esc(d.nome)}</b><br><small class="note">${esc(perfil.nome)}</small></td><td class="num">${d.etapas}</td><td class="num">${d.coletados}</td><td class="num">${d.revisados}</td><td class="num">${d.lanc + d.baixas}</td><td class="num">${d.feitas}</td><td class="num ${d.atrasadas ? 'neg' : ''}">${d.atrasadas}</td><td class="num">${d.ops}${d.opsAtrasadas ? ` <span class="neg">(${d.opsAtrasadas})</span>` : ''}</td></tr>`).join('')}
          </tbody></table></div><p class="note" style="padding:8px 14px">Contagem do mês pelo que cada um registra no sistema. Documentos passam a contar com data a partir de agora. O ranking com pontuação e bonificação entra no bloco de Produtividade.</p>` };
    }
  };

  /* ---------- Tela ---------- */
  H.telas.torre = function (el) {
    const eu = H.userKey, podeOutros = W.pode(H.db, eu, 'torre.outros');
    if (!podeOutros || !(H.db.users || {})[verComo]) verComo = null;
    const k = verComo || eu;
    const c = contexto(k);
    const ids = W.torreDe(H.db, k);
    const pessoas = Object.keys(H.db.users || {});

    const blocos = ids.map(id => {
      const fn = P[id]; if (!fn) return '';
      let r; try { r = fn(c); } catch (e) { console.error(e); r = { corpo: `<p class="empty">Não consegui montar este painel.</p>` }; }
      if (r.cru) return `<section class="tp larga" data-p="${id}">${r.cru}</section>`;
      return `<section class="tp box ${r.largo ? 'larga' : ''}" data-p="${id}"><div class="box-h"><h2>${esc(W.PAINEIS[id].t)}</h2><div class="btns">${r.acoes || ''}</div></div>${r.corpo || ''}</section>`;
    }).join('');

    el.innerHTML = `
      <div class="head"><div><h1>Torre de Controle${k !== eu ? ' · ' + esc(H.nomeUsuario(k)) : ''}</h1><p class="sub"><b>${esc(c.perfil.nome)}</b> · ${esc(c.perfil.foco)}</p></div>
        <div class="btns">${podeOutros ? `<select class="inp" id="verComo" aria-label="Ver a torre de">${pessoas.map(p => `<option value="${esc(p)}" ${p === k ? 'selected' : ''}>${p === eu ? 'Minha torre' : 'Torre de ' + esc(H.nomeUsuario(p))}</option>`).join('')}</select>` : ''}
          <button class="btn" data-personalizar>Personalizar</button><button class="btn pri" data-nova>+ Nova operação</button></div></div>
      <div class="torre">${blocos || '<p class="empty">Nenhum painel escolhido. Use “Personalizar”.</p>'}</div>`;
    ligar(el, c);
  };

  function ligar(el, c) {
    const db = H.db;
    const vc = el.querySelector('#verComo'); if (vc) vc.onchange = () => { verComo = vc.value === H.userKey ? null : vc.value; H.render(); };
    el.querySelectorAll('[data-op]').forEach(x => x.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); H.ir('ficha', x.dataset.op); }));
    el.querySelectorAll('[data-ir]').forEach(x => x.addEventListener('click', () => H.ir(x.dataset.ir)));
    el.querySelectorAll('[data-f]').forEach(x => x.addEventListener('click', () => { filtroEtapa = x.dataset.f || null; H.render(); }));
    const mm = el.querySelector('[data-minhas]'); if (mm) mm.onclick = () => { soMinhas = !soMinhas; H.render(); };
    el.querySelector('[data-nova]').onclick = () => H.novaOperacao();
    el.querySelector('[data-personalizar]').onclick = () => personalizar(c.k);
    el.querySelectorAll('[data-recado]').forEach(b => b.onclick = () => novoRecado(c.k));
    el.querySelectorAll('[data-feito]').forEach(b => b.onclick = () => {
      const r = db.hubRecados.find(x => x && x._id === b.dataset.feito); if (!r) return H.render();
      r.feito = Object.assign({}, r.feito, { [c.k]: new Date().toISOString() }); H.salvar(); H.render();
    });
    el.querySelectorAll('[data-delrec]').forEach(b => b.onclick = () => {
      if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Remover?'; return; }
      db.hubRecados = db.hubRecados.filter(x => !(x && x._id === b.dataset.delrec)); H.salvar(); H.render();
    });
    el.querySelectorAll('[data-tarefa]').forEach(b => b.onclick = () => {
      const t = (db.agendaTasks || []).find(x => x && x._id === b.dataset.tarefa); if (!t) return H.render();
      t.status = 'feita'; t.doneAt = W.hojeISO(); H.salvar(); H.toast('Tarefa concluída'); H.render();
    });
    el.querySelectorAll('[data-msg]').forEach(b => b.onclick = async () => {
      const o = c.opMap[b.dataset.msg]; if (!o) return;
      const txt = mensagemCliente(o, b.dataset.tipo, c);
      try { await navigator.clipboard.writeText(txt); H.toast('Mensagem copiada. É só colar no WhatsApp.'); }
      catch (e) { H.modal('Mensagem para o cliente', `<textarea style="width:100%;min-height:160px">${esc(txt)}</textarea>`); }
    });
    el.querySelectorAll('[data-aut],[data-baixa],[data-ed]').length && H.ligarLanc && H.ligarLanc(el);
    const nl = el.querySelector('[data-novolanc]'); if (nl) nl.onclick = () => H.editarLanc(null);
    const mt = el.querySelector('[data-meta]'); if (mt) mt.onclick = () => editarMeta(c);
  }

  function mensagemCliente(o, tipo, c) {
    const ola = `Olá! Tudo bem? Aqui é da WindGate, sobre a sua importação ${o.id}${o.nome ? ' (' + o.nome + ')' : ''}.`;
    const fim = '\n\nQualquer dúvida, estou à disposição. — ' + H.nomeUsuario(H.userKey) + ' · WindGate';
    if (tipo === 'eta') return `${ola}\n\nA carga está em trânsito${o.navio ? ' no navio ' + o.navio : ''} e a chegada prevista ao porto${o.destinoPorto ? ' de ' + o.destinoPorto : ''} é ${W.dataBR(o.eta)}. Já estamos preparando a documentação para o desembaraço.${fim}`;
    if (tipo === 'atraso') return `${ola}\n\nPassando para atualizar: a etapa de ${W.stMeta(o.status).l.toLowerCase()} está levando mais tempo que o previsto. ${o.prox ? 'Próximo passo: ' + o.prox + '.' : 'Estamos acompanhando de perto e aviso assim que avançar.'}${fim}`;
    return `${ola}\n\nBoa notícia: a operação avançou para a etapa ${W.stMeta(o.status).l}.${o.prox ? ' Próximo passo: ' + o.prox + '.' : ''}${o.eta && ['embarcado', 'container_enviado_porto'].includes(o.status) ? ' Chegada prevista: ' + W.dataBR(o.eta) + '.' : ''}${fim}`;
  }

  /* ---------- Personalizar (ordem e painéis) ---------- */
  function personalizar(k) {
    const db = H.db, perm = W.paineisPermitidos(db, k);
    let atual = W.torreDe(db, k);
    const desenhar = m => {
      const fora = perm.filter(id => !atual.includes(id));
      m.querySelector('#plist').innerHTML = atual.map((id, i) => `<div class="row"><label><input type="checkbox" data-on="${id}" checked style="width:auto"> ${esc(W.PAINEIS[id].t)}</label><div class="btns"><button class="btn ghost sm" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button class="btn ghost sm" data-down="${i}" ${i < atual.length - 1 ? '' : 'disabled'} aria-label="Descer">↓</button></div></div>`).join('')
        + fora.map(id => `<div class="row" style="opacity:.6"><label><input type="checkbox" data-on="${id}" style="width:auto"> ${esc(W.PAINEIS[id].t)}</label></div>`).join('');
      m.querySelectorAll('[data-on]').forEach(x => x.onchange = () => { const id = x.dataset.on; atual = x.checked ? atual.concat([id]) : atual.filter(y => y !== id); desenhar(m); });
      m.querySelectorAll('[data-up]').forEach(x => x.onclick = () => { const i = +x.dataset.up; [atual[i - 1], atual[i]] = [atual[i], atual[i - 1]]; desenhar(m); });
      m.querySelectorAll('[data-down]').forEach(x => x.onclick = () => { const i = +x.dataset.down; [atual[i + 1], atual[i]] = [atual[i], atual[i + 1]]; desenhar(m); });
    };
    const m = H.modal(k === H.userKey ? 'Personalizar minha torre' : 'Torre de ' + H.nomeUsuario(k),
      `<p class="note" style="margin-bottom:10px">Marque os painéis e ajuste a ordem. Só aparecem os painéis que o perfil <b>${esc(W.perfilDe(db, k).nome)}</b> pode ver.</p><div class="list" id="plist"></div>`,
      '<button class="btn" id="ppad" style="margin-right:auto">Restaurar padrão</button><button class="btn" data-x>Cancelar</button><button class="btn blue" id="pok">Salvar</button>');
    desenhar(m);
    const gravar = paineis => { db.hubPainel[k] = { paineis, em: new Date().toISOString(), por: H.nomeUsuario(H.userKey) }; H.salvar(); H.fecharModal(); H.render(); };
    m.querySelector('#pok').onclick = () => { gravar(atual.slice()); H.toast('Torre salva'); };
    m.querySelector('#ppad').onclick = () => { gravar(null); H.toast('Torre de volta ao padrão do perfil'); };
  }

  /* ---------- Recados ---------- */
  function novoRecado(kPadrao) {
    const db = H.db, outros = W.pode(db, H.userKey, 'recado.outros');
    const pessoas = Object.keys(db.users || {});
    const ops = db.ops.filter(o => o && o.id && W.ativa(o)).map(o => o.id);
    const m = H.modal('Fixar recado na torre', `<div class="fields">
      <div class="f w4"><label class="lbl" for="rt">Recado</label><input id="rt" maxlength="200" placeholder="Ex.: Prioridade hoje: fechar o frete da OP24"></div>
      <div class="f w2"><label class="lbl" for="rp">Para</label><select id="rp">${outros ? `<option value="todos">Todos</option>${pessoas.map(p => `<option value="${esc(p)}" ${p === kPadrao ? 'selected' : ''}>${esc(H.nomeUsuario(p))}</option>`).join('')}` : `<option value="${esc(H.userKey)}">Só para mim</option>`}</select></div>
      <div class="f"><label class="lbl" for="rpr">Prioridade</label><select id="rpr"><option value="normal">Normal</option><option value="alta">Alta</option></select></div>
      <div class="f"><label class="lbl" for="ra">Mostrar até</label><input id="ra" type="date"></div>
      <div class="f w2"><label class="lbl" for="ro">Operação (opcional)</label><select id="ro"><option value="">—</option>${ops.map(o => `<option>${esc(o)}</option>`).join('')}</select></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="rok">Fixar</button>');
    m.querySelector('#rok').onclick = () => {
      const texto = m.querySelector('#rt').value.trim(); if (!texto) { H.toast('Escreva o recado'); return; }
      db.hubRecados.unshift({ _id: W.novoId(), texto, para: m.querySelector('#rp').value, prio: m.querySelector('#rpr').value, ate: m.querySelector('#ra').value || '',
        op: m.querySelector('#ro').value || '', por: H.nomeUsuario(H.userKey), em: new Date().toISOString(), feito: {} });
      H.salvar(); H.fecharModal(); H.toast('Recado fixado'); H.render();
    };
  }

  function editarMeta(c) {
    const db = H.db;
    const m = H.modal('Meta do time · ' + c.mes.split('-').reverse().join('/'), `<div class="fields"><div class="f w2"><label class="lbl" for="mm">Importações fechadas no mês</label><input id="mm" type="number" min="0" step="1" value="${c.meta || ''}"></div></div>
      <p class="note" style="margin-top:8px">Conta como fechada a operação que entrou em Contrato neste mês. Vale para Davi, Ívina e Matheus juntos.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="mok">Salvar</button>');
    m.querySelector('#mok').onclick = () => {
      const v = Math.max(0, parseInt(m.querySelector('#mm').value, 10) || 0);
      const meta = Object.assign({}, db.hubPainel._meta); meta.mensal = Object.assign({}, meta.mensal, { [c.mes]: v });
      db.hubPainel._meta = meta; H.salvar(); H.fecharModal(); H.toast('Meta salva'); H.render();
    };
  }
})();
