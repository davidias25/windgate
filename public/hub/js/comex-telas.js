/* Hub 2.0 — telas de comércio exterior: custeio & margem, câmbio & dólar,
   contêineres (free time), conta-corrente do cliente, motor tributário e
   transição 2027–2033, contratos, compliance, catálogo NCM, crédito,
   portais externos e a fila de exceções da Torre. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  const hoje = () => W.hojeISO();
  const n2 = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n4 = v => v ? (+v).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—';
  const usd = v => 'US$ ' + Math.round(+v || 0).toLocaleString('pt-BR');
  const pct = v => v == null || !isFinite(v) ? '—' : (v * 100).toFixed(1).replace('.', ',') + '%';
  const eu = () => H.nomeUsuario(H.userKey);
  const garantir = k => { if (!Array.isArray(H.db[k])) H.db[k] = []; return H.db[k]; };
  const painel = k => { H.db.hubPainel = H.db.hubPainel || {}; H.db.hubPainel[k] = H.db.hubPainel[k] || {}; return H.db.hubPainel[k]; };
  const opsAtivas = () => (H.db.ops || []).filter(o => o && o.id && W.ativa(o));
  const opById = id => (H.db.ops || []).find(o => o && o.id === id);
  const optOps = (sel, todas) => (todas ? (H.db.ops || []).filter(o => o && o.id) : opsAtivas()).map(o => `<option value="${esc(o.id)}" ${o.id === sel ? 'selected' : ''}>${esc(o.id)} · ${esc(o.cliente || '')}</option>`).join('');
  const val = (m, s) => { const x = m.querySelector(s); return x ? x.value.trim() : ''; };
  const numIn = (m, s) => { const t = val(m, s).replace(/\s/g, ''); if (!t) return 0; return /,/.test(t) ? +t.replace(/\./g, '').replace(',', '.') || 0 : +t || 0; };
  const cab = (titulo, sub, btns, lbl) => `<div class="head"><div>${lbl ? `<span class="lbl">${lbl}</span>` : ''}<h1>${titulo}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${btns ? `<div class="btns">${btns}</div>` : ''}</div>`;
  const kpi = (l, v, d, cls) => `<div class="kpi"><span class="lbl">${l}</span><span class="v ${cls || ''}">${v}</span>${d ? `<span class="d">${d}</span>` : ''}</div>`;
  const pill = (t, cor) => `<span class="pill" style="background:${cor}1A;color:${cor}">${esc(t)}</span>`;
  const COR = { ok: '#0E8A5F', atencao: '#B7791F', vencido: '#C53030', info: '#1F4FB4', cinza: '#6B7280' };

  /* ---------- Dólar do dia (PTAX) ---------- */
  H.ptax = null; let ptaxCarregando = false;
  H.carregarPtax = function () {
    if (H.ptax || ptaxCarregando) return Promise.resolve(H.ptax);
    ptaxCarregando = true;
    return H.api('/api/cambio/ptax').then(r => r.json()).then(j => { if (j.success) { H.ptax = j; if (['cambio', 'custeio', 'torre', 'ficha'].includes(H.estado.tela)) H.render(); } return H.ptax; }).catch(() => null).finally(() => { ptaxCarregando = false; });
  };
  const ptaxV = () => H.ptax && H.ptax.venda ? +H.ptax.venda : null;

  /* ---------- Torre: fila de exceções ---------- */
  H.torreExtra = H.torreExtra || {};
  H.torreExtra.excecoes = function (c) {
    if (!H.ptax) H.carregarPtax();
    const xs = W.excecoes(c.db, c.k || H.userKey, c.hoje, { ptax: ptaxV() });
    const cor = n => n >= 3 ? COR.vencido : n === 2 ? COR.atencao : COR.info;
    const linhas = xs.slice(0, 14).map(x => `<div class="row"><div><span class="dot-n" style="background:${cor(x.nivel)}"></span><b>${esc(x.titulo)}</b><br><small class="note">${esc(x.detalhe || '')}</small></div><button class="btn sm" data-irp="${esc(x.ir[0])}|${esc(x.ir[1] || '')}">Resolver</button></div>`);
    return { acoes: `<span class="note">${xs.length ? xs.length + ' item(ns) · só o que pede ação' : 'tudo em ordem'}</span>`, corpo: `<div class="box-b list">${linhas.length ? linhas.join('') + (xs.length > 14 ? `<p class="note" style="padding:6px 14px">+ ${xs.length - 14} item(ns)</p>` : '') : '<p class="empty">Nada fora do previsto agora.</p>'}</div>` };
  };

  /* ---------- Custeio & margem ---------- */
  H.telas.custeio = function (el, opId) {
    if (!H.pode('fin.resultado')) { el.innerHTML = '<div class="banner">Custeio e margem são da diretoria e do financeiro.</div>'; return; }
    if (!H.ptax) H.carregarPtax();
    const p = ptaxV();
    if (!opId) {
      const linhas = opsAtivas().map(o => ({ o, c: W.custeioOp(H.db, o.id, { ptax: p }) }));
      el.innerHTML = cab('Custeio & margem', 'Custo de cada operação em três momentos: simulado na cotação, previsto aprovado e realizado no Financeiro. O dólar ainda sem câmbio fechado é recalculado pela PTAX do dia.', p ? `<span class="pill">PTAX ${n4(p)}</span>` : '') +
        `<div class="box"><div class="tw"><table><thead><tr><th>Operação</th><th>Modalidade</th><th class="num">Receita</th><th class="num">Previsto</th><th class="num">Projetado</th><th class="num">Desvio</th><th class="num">Margem prevista</th><th class="num">Margem projetada</th><th class="num">US$ sem câmbio</th><th class="num">Efeito do dólar hoje</th></tr></thead><tbody>
        ${linhas.map(({ o, c }) => `<tr data-op="${esc(o.id)}" class="clic"><td><b class="mono">${esc(o.id)}</b> <span class="note">${esc(o.cliente || '')}</span>${c.previstoAprovado ? '' : ' ' + pill('sem previsto', COR.cinza)}</td><td>${esc(o.modalidade || '—')}</td>
          <td class="num">${W.fmtBRLk(c.receita)}</td><td class="num">${W.fmtBRLk(c.previsto)}</td><td class="num">${W.fmtBRLk(c.projetado)}</td>
          <td class="num" style="color:${c.desvio > 0.05 ? COR.vencido : c.desvio < -0.02 ? COR.ok : 'inherit'}">${pct(c.desvio)}</td><td class="num">${pct(c.margemPrevista)}</td>
          <td class="num" style="color:${c.margemProjetada != null && c.margemProjetada < 0.10 ? COR.vencido : 'inherit'}"><b>${pct(c.margemProjetada)}</b></td><td class="num">${c.usdAberto ? usd(c.usdAberto) : '—'}</td>
          <td class="num" style="color:${c.impactoAberto > 0 ? COR.vencido : c.impactoAberto < 0 ? COR.ok : 'inherit'}">${c.impactoAberto ? (c.impactoAberto > 0 ? '+' : '') + W.fmtBRLk(c.impactoAberto) : '—'}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">Nenhuma operação ativa.</td></tr>'}</tbody></table></div></div>
        <p class="note">Projetado = já pago + a pagar lançado + efeito do dólar sem contrato. Desvio acima de 5% e margem abaixo de 10% aparecem na Torre.</p>`;
      el.querySelectorAll('[data-op]').forEach(t => t.onclick = () => H.ir('custeio', t.dataset.op));
      return;
    }
    const o = opById(opId); if (!o) { el.innerHTML = '<div class="banner">Operação não encontrada.</div>'; return; }
    const c = W.custeioOp(H.db, o.id, { ptax: p }), av = W.avisosTributarios(H.db, o.eta || hoje());
    el.innerHTML = cab(`Custeio · ${esc(o.id)} · ${esc(o.cliente || '')}`, `${esc(o.nome || '')}${c.cotacao ? ' · cotação vinculada' : ' · sem cotação vinculada (o simulado fica zerado)'}${c.previstoAprovado ? ` · previsto aprovado por ${esc(c.aprovadoPor)} em ${W.dataBR(c.aprovadoEm)}` : ''}`,
      `<button class="btn" data-irp="ficha|${esc(o.id)}">Abrir operação</button>${H.aprova() ? '<button class="btn blue" id="aprov">Aprovar previsto</button>' : ''}`, '<a href="#custeio" data-volta>Custeio</a>') +
      `<div class="kpis">${kpi('Receita da operação', W.fmtBRLk(c.receita), W.fmtBRLk(c.receitaRecebida) + ' recebido')}${kpi('Custo previsto', W.fmtBRLk(c.previsto), 'simulado ' + W.fmtBRLk(c.simulado))}
        ${kpi('Custo projetado', W.fmtBRLk(c.projetado), 'desvio ' + pct(c.desvio), c.desvio > 0.05 ? 'neg' : '')}${kpi('Margem', pct(c.margemProjetada), 'prevista ' + pct(c.margemPrevista) + (c.margemSimulada != null ? ' · cotada ' + pct(c.margemSimulada) : ''), c.margemProjetada != null && c.margemProjetada < 0.10 ? 'neg' : '')}
        ${kpi('Lucro líquido projetado', c.lucroLiquido == null ? '—' : W.fmtBRLk(c.lucroLiquido), 'após IRPJ/CSLL 34% · ' + (c.lucroLiquido ? W.fmtBRLk(c.lucroLiquido / 2) + ' por sócio' : ''))}</div>
      ${av.length ? `<div class="banner">${av.map(esc).join(' ')}</div>` : ''}
      <div class="g2"><div class="box"><div class="box-h"><h2>Custo por classe</h2><span class="note">R$</span></div><div class="tw"><table><thead><tr><th>Classe</th><th class="num">Simulado</th><th class="num">Previsto</th><th class="num">Pago</th><th class="num">A pagar</th><th class="num">Projetado</th><th class="num">Desvio</th></tr></thead><tbody>
        ${c.linhas.filter(l => l.simulado || l.previsto || l.realizado || l.aPagar).map(l => `<tr><td>${esc(l.l)}</td><td class="num">${n2(l.simulado)}</td><td class="num">${n2(l.previsto)}</td><td class="num">${n2(l.realizado)}</td><td class="num">${n2(l.aPagar)}</td><td class="num"><b>${n2(l.projetado)}</b>${l.semLancamento ? '<br><small class="note">ainda pelo previsto</small>' : ''}</td><td class="num" style="color:${l.desvio > 0.05 ? COR.vencido : 'inherit'}">${pct(l.desvio)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sem custos lançados nem cotação vinculada.</td></tr>'}
        <tr><td><b>Total</b></td><td class="num"><b>${n2(c.simulado)}</b></td><td class="num"><b>${n2(c.previsto)}</b></td><td class="num"><b>${n2(c.realizado)}</b></td><td class="num"><b>${n2(c.aPagar)}</b></td><td class="num"><b>${n2(c.projetado - c.impactoAberto)}</b></td><td></td></tr></tbody></table></div></div>
      <div class="box"><div class="box-h"><h2>Câmbio da operação</h2><button class="btn sm" id="defusd">Dólar previsto</button></div><div class="box-b">
        <div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">${kpi('Dólar da operação', usd(c.usdTotal), 'FOB ' + usd(c.fobUSD) + ' + frete ' + usd(c.freteUSD))}${kpi('Taxa prevista', n4(c.taxaPrevista), 'usada no previsto')}
        ${kpi('Câmbio fechado', usd(c.usdFechado), c.taxaMedia ? 'taxa média ' + n4(c.taxaMedia) + ' · variação ' + W.fmtBRLk(c.variacaoCambial) : 'nenhum contrato', c.variacaoCambial > 0 ? 'neg' : '')}${kpi('Sem câmbio', usd(c.usdAberto), p ? 'pela PTAX ' + n4(p) + ': ' + (c.impactoAberto >= 0 ? '+' : '') + W.fmtBRLk(c.impactoAberto) : 'PTAX indisponível', c.impactoAberto > 0 ? 'neg' : '')}</div>
        <p class="note">Cada R$ 0,10 no dólar muda o custo desta operação em ${W.fmtBRLk(c.usdAberto * 0.1)} enquanto o câmbio não for fechado.</p>
        <div class="btns"><button class="btn sm" data-irp="cambio|">Contratos de câmbio</button><button class="btn sm" data-irp="contacorrente|${esc(o.id)}">Conta-corrente do cliente</button></div></div></div></div>
      <div class="box"><div class="box-h"><h2>Lançamentos da operação por classe de custo</h2><span class="note">corrija a classe quando o sistema errar: o realizado se ajusta</span></div><div class="tw"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Situação</th><th class="num">Valor</th><th>Classe</th></tr></thead><tbody>
        ${(H.db.fin || []).filter(l => l && l.op === o.id && l.tipo !== 'Receita' && !W.transferencia(l)).sort((a, b) => W.vencDe(a).localeCompare(W.vencDe(b))).map(l => `<tr><td class="mono">${W.dataBR(W.vencDe(l))}</td><td>${esc(l.desc || l.descricao || '—')}</td><td>${W.realizado(l) ? pill('pago', COR.ok) : pill('a pagar', COR.cinza)}</td><td class="num">${n2(l.valor)}</td>
          <td><select class="inp" data-cl="${esc(l._id)}">${W.CLASSES.map(([k, t]) => `<option value="${k}" ${W.classeDe(l) === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum custo lançado.</td></tr>'}</tbody></table></div></div>`;
    el.querySelector('[data-volta]').onclick = e => { e.preventDefault(); H.ir('custeio'); };
    el.querySelectorAll('[data-irp]').forEach(b => b.onclick = () => { const [t, x] = b.dataset.irp.split('|'); H.ir(t, x || null); });
    el.querySelectorAll('[data-cl]').forEach(s => s.onchange = () => { const l = (H.db.fin || []).find(x => x && x._id === s.dataset.cl); if (!l) return; l.custo = s.value; H.salvar(); H.render(); });
    el.querySelector('#defusd').onclick = () => {
      const m = H.modal('Dólar previsto da operação', `<div class="fields"><div class="f"><label class="lbl" for="fu">FOB (US$)</label><input id="fu" inputmode="decimal" value="${c.fobUSD || ''}"></div><div class="f"><label class="lbl" for="fr">Frete (US$)</label><input id="fr" inputmode="decimal" value="${c.freteUSD || ''}"></div><div class="f"><label class="lbl" for="tx">Taxa prevista (R$/US$)</label><input id="tx" inputmode="decimal" value="${c.taxaPrevista || (p || '')}"></div></div><p class="note">Sem cotação vinculada, informe aqui. Com cotação, estes campos substituem os dela.</p>`, '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="ok">Salvar</button>');
      m.querySelector('#ok').onclick = () => { const oa = opById(o.id); oa.custeio = Object.assign({}, oa.custeio || {}, { fobUSD: numIn(m, '#fu'), freteUSD: numIn(m, '#fr'), taxaPrevista: numIn(m, '#tx') }); H.salvar(); H.fecharModal(); H.render(); };
    };
    const ap = el.querySelector('#aprov'); if (ap) ap.onclick = () => {
      const base = c.previstoAprovado ? Object.fromEntries(c.linhas.map(l => [l.k, l.previsto])) : Object.fromEntries(c.linhas.map(l => [l.k, l.simulado]));
      const m = H.modal('Aprovar o custo previsto', `<p class="note">Vem preenchido com ${c.previstoAprovado ? 'o previsto atual' : 'o simulado da cotação'}. É a régua contra a qual o realizado é medido.</p><div class="fields">${W.CLASSES.filter(([k]) => k !== 'cambio').map(([k, l]) => `<div class="f"><label class="lbl" for="pv_${k}">${esc(l)}</label><input id="pv_${k}" inputmode="decimal" value="${base[k] ? (+base[k]).toFixed(2) : ''}"></div>`).join('')}<div class="f"><label class="lbl" for="pv_rec">Receita prevista (R$)</label><input id="pv_rec" inputmode="decimal" value="${c.receita ? c.receita.toFixed(2) : ''}"></div></div>`, '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="ok">Aprovar</button>');
      m.querySelector('#ok').onclick = () => { const v = {}; W.CLASSES.forEach(([k]) => { if (k !== 'cambio') v[k] = numIn(m, '#pv_' + k); });
        W.aprovarPrevisto(H.db, o.id, v, { receitaPrevista: numIn(m, '#pv_rec'), taxaPrevista: c.taxaPrevista, fobUSD: c.fobUSD, freteUSD: c.freteUSD }, eu()); H.salvar(); H.fecharModal(); H.toast('Previsto aprovado'); H.render(); };
    };
  };

  /* ---------- Câmbio & dólar ---------- */
  H.telas.cambio = function (el) {
    if (!H.pode('fin.ver')) { el.innerHTML = '<div class="banner">Câmbio é da diretoria e do financeiro.</div>'; return; }
    if (!H.ptax) H.carregarPtax();
    const p = ptaxV(), ex = W.exposicaoCambio(H.db, p, hoje()), banda = +((painel('_comex').bandaCambio) || 3);
    const cs = (H.db.hubCambio || []).filter(Boolean).sort((a, b) => String(b.liquidacao || b.dataFechamento || '').localeCompare(String(a.liquidacao || a.dataFechamento || '')));
    const alerta = p && ex.taxaMediaPrevista && (p - ex.taxaMediaPrevista) / ex.taxaMediaPrevista > banda / 100;
    el.innerHTML = cab('Câmbio & dólar', 'Contratos de câmbio de cada operação, dólar a pagar ainda sem câmbio e o efeito da PTAX do dia no custo. A taxa que vale é a do contrato fechado; a PTAX é a referência.', '<button class="btn blue" id="novo">+ Contrato de câmbio</button>') +
      `<div class="kpis">${kpi('PTAX venda (Banco Central)', p ? n4(p) : '…', H.ptax ? `${H.ptax.variacao != null ? (H.ptax.variacao >= 0 ? '+' : '') + (H.ptax.variacao * 100).toFixed(2).replace('.', ',') + '% no dia · ' : ''}${W.dataBR(H.ptax.em)}` : 'carregando', H.ptax && H.ptax.variacao > 0 ? 'neg' : '')}
        ${kpi('A pagar com câmbio previsto', usd(ex.usd), ex.taxaMediaPrevista ? 'taxa média prevista ' + n4(ex.taxaMediaPrevista) : '')}${kpi('Efeito da PTAX de hoje', ex.impacto == null ? '—' : (ex.impacto >= 0 ? '+' : '') + W.fmtBRLk(ex.impacto), 'sobre o previsto', ex.impacto > 0 ? 'neg' : '')}
        ${kpi('Dólar sem previsão de câmbio', usd(ex.usdSemContrato), ex.impactoSemContrato == null ? '' : 'efeito ' + (ex.impactoSemContrato >= 0 ? '+' : '') + W.fmtBRLk(ex.impactoSemContrato), ex.usdSemContrato ? 'neg' : '')}</div>
      ${alerta ? `<div class="banner">A PTAX está ${(((p - ex.taxaMediaPrevista) / ex.taxaMediaPrevista) * 100).toFixed(1).replace('.', ',')}% acima da taxa média prevista (alerta a partir de ${banda}%). Avalie fechar o câmbio das próximas semanas.</div>` : ''}
      <div class="g2"><div class="box"><div class="box-h"><h2>Dólar a pagar por semana</h2></div>${ex.semanas.length ? `<div class="box-b">${H.grafico ? H.grafico.barras(ex.semanas.map(s => W.dataBR(s.semana).slice(0, 5)), [{ nome: 'US$', valores: ex.semanas.map(s => s.usd), cor: 'var(--blue)' }], { h: 180, fmt: v => 'US$ ' + Math.round(v / 1000) + ' mil' }) : ''}</div>` : '<p class="empty">Nenhum câmbio previsto.</p>'}</div>
        <div class="box"><div class="box-h"><h2>Operações com dólar sem previsão de câmbio</h2></div><div class="tw"><table><thead><tr><th>Operação</th><th class="num">US$</th><th class="num">Taxa prevista</th><th></th></tr></thead><tbody>${ex.semContrato.map(x => `<tr><td><b class="mono">${esc(x.op)}</b> <span class="note">${esc(x.cliente || '')}</span></td><td class="num">${usd(x.usd)}</td><td class="num">${n4(x.taxaPrevista)}</td><td class="num"><button class="btn sm" data-prever="${esc(x.op)}" data-usd="${x.usd}">Prever câmbio</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Todo o dólar das operações ativas tem câmbio previsto ou fechado.</td></tr>'}</tbody></table></div></div></div>
      <div class="box"><div class="box-h"><h2>Contratos de câmbio</h2><label class="note">alerta da PTAX acima da prevista: <input id="banda" class="inp" style="width:60px" value="${banda}">%</label></div><div class="tw"><table><thead><tr><th>Operação</th><th>Empresa</th><th>Banco</th><th>Situação</th><th class="num">US$</th><th class="num">Taxa prevista</th><th class="num">Taxa fechada</th><th class="num">Variação</th><th>Pagamento</th><th></th></tr></thead><tbody>
        ${cs.map(x => { const v = x.taxa && x.taxaPrevista ? (+x.valorME) * (+x.taxa - +x.taxaPrevista) : null; return `<tr><td class="mono">${esc(x.op || '—')}</td><td>${esc(x.empresa || '')}</td><td>${esc(x.banco || '')}${x.contrato ? ` <span class="note mono">${esc(x.contrato)}</span>` : ''}</td><td>${pill(x.status || 'previsto', x.status === 'liquidado' ? COR.ok : x.status === 'fechado' ? COR.info : COR.atencao)}</td><td class="num">${usd(x.valorME)}</td><td class="num">${n4(x.taxaPrevista)}</td><td class="num">${n4(x.taxa)}</td><td class="num" style="color:${v > 0 ? COR.vencido : v < 0 ? COR.ok : 'inherit'}">${v == null ? '—' : (v >= 0 ? '+' : '') + W.fmtBRL(v)}</td><td class="mono">${W.dataBR(x.liquidacao)}</td><td class="num"><button class="btn ghost sm" data-ed="${esc(x._id)}">Editar</button></td></tr>`; }).join('') || '<tr><td colspan="10" class="empty">Nenhum contrato registrado.</td></tr>'}</tbody></table></div></div>
      <p class="note">Hedge (NDF) só com política escrita e exposição que justifique. Para 2 a 3 contratos por mês, fechar o câmbio na data certa costuma bastar.</p>`;
    const form = (x) => {
      x = x || { status: 'previsto', empresa: 'WindGate', moeda: 'USD', taxaPrevista: p || '' };
      const m = H.modal(x._id ? 'Contrato de câmbio' : 'Novo contrato de câmbio', `<div class="fields">
        <div class="f w2"><label class="lbl" for="cop">Operação</label><select id="cop"><option value="">—</option>${optOps(x.op, true)}</select></div>
        <div class="f"><label class="lbl" for="cem">Empresa</label><select id="cem">${['WindGate', 'JeT'].map(e => `<option ${x.empresa === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
        <div class="f"><label class="lbl" for="cst">Situação</label><select id="cst">${['previsto', 'fechado', 'liquidado'].map(e => `<option ${x.status === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
        <div class="f"><label class="lbl" for="cva">Valor (US$)</label><input id="cva" inputmode="decimal" value="${x.valorME || ''}"></div>
        <div class="f"><label class="lbl" for="ctp">Taxa prevista</label><input id="ctp" inputmode="decimal" value="${x.taxaPrevista || ''}"></div>
        <div class="f"><label class="lbl" for="ctx">Taxa fechada</label><input id="ctx" inputmode="decimal" value="${x.taxa || ''}"></div>
        <div class="f"><label class="lbl" for="cdf">Fechamento</label><input id="cdf" type="date" value="${esc(x.dataFechamento || '')}"></div>
        <div class="f"><label class="lbl" for="cli">Pagamento ao fornecedor</label><input id="cli" type="date" value="${esc(x.liquidacao || '')}"></div>
        <div class="f"><label class="lbl" for="cba">Banco / corretora</label><input id="cba" value="${esc(x.banco || '')}"></div>
        <div class="f"><label class="lbl" for="cnu">Nº do contrato</label><input id="cnu" value="${esc(x.contrato || '')}"></div>
        <div class="f w2"><label class="lbl" for="cfo">Fornecedor</label><input id="cfo" value="${esc(x.fornecedor || '')}"></div></div>`,
        `${x._id ? '<button class="btn ghost" id="del">Excluir</button>' : ''}<button class="btn" data-x>Cancelar</button><button class="btn blue" id="ok">Salvar</button>`);
      m.querySelector('#ok').onclick = () => {
        const r = { op: val(m, '#cop'), empresa: val(m, '#cem'), status: val(m, '#cst'), moeda: 'USD', valorME: numIn(m, '#cva'), taxaPrevista: numIn(m, '#ctp'), taxa: numIn(m, '#ctx'), dataFechamento: val(m, '#cdf'), liquidacao: val(m, '#cli'), banco: val(m, '#cba'), contrato: val(m, '#cnu'), fornecedor: val(m, '#cfo') };
        if (!r.valorME) return H.toast('Informe o valor em dólar.');
        if (r.status !== 'previsto' && !r.taxa) return H.toast('Contrato fechado precisa da taxa.');
        const lista = garantir('hubCambio'), a = x._id && lista.find(y => y._id === x._id);
        if (a) Object.assign(a, r, { atualizadoPor: eu(), atualizadoEm: new Date().toISOString() }); else lista.push(Object.assign({ _id: W.novoId(), por: eu(), em: new Date().toISOString() }, r));
        H.salvar(); H.fecharModal(); H.render();
      };
      const d = m.querySelector('#del'); if (d) d.onclick = () => { H.db.hubCambio = H.db.hubCambio.filter(y => y._id !== x._id); H.salvar(); H.fecharModal(); H.render(); };
    };
    el.querySelector('#novo').onclick = () => form();
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => form((H.db.hubCambio || []).find(y => y._id === b.dataset.ed)));
    el.querySelectorAll('[data-prever]').forEach(b => b.onclick = () => { const o = opById(b.dataset.prever); form({ op: b.dataset.prever, status: 'previsto', empresa: (o && o.empresa) || 'WindGate', valorME: Math.round(+b.dataset.usd), taxaPrevista: W.custeioOp(H.db, b.dataset.prever).taxaPrevista || p || '', liquidacao: (o && o.embarque) || '' }); });
    el.querySelector('#banda').onchange = e => { painel('_comex').bandaCambio = +String(e.target.value).replace(',', '.') || 3; H.salvar(); H.render(); };
  };

  /* ---------- Contêineres: relógio do free time ---------- */
  const ST_CONT = { vencido: ['em demurrage', COR.vencido], atencao: ['vence em até 2 dias', COR.atencao], ok: ['no prazo', COR.ok], 'sem-descarga': ['aguardando descarga', COR.cinza], devolvido: ['devolvido', COR.ok], 'devolvido-com-custo': ['devolvido com custo', COR.vencido] };
  function editarConteiner(opId, idx) {
    const o = opById(opId), c = o && o.containers && o.containers[idx]; if (!c) return;
    const m = H.modal(`Contêiner ${c.numero}`, `<div class="fields">
      <div class="f"><label class="lbl" for="ka">Armador</label><input id="ka" value="${esc(c.armador || o.armador || '')}"></div>
      <div class="f"><label class="lbl" for="kt">Tipo</label><input id="kt" value="${esc(c.tipo || '')}" placeholder="40'HQ, 20'DC, 40'RF"></div>
      <div class="f"><label class="lbl" for="kd">Descarga no porto</label><input id="kd" type="date" value="${esc(W.soData(c.descarga))}"></div>
      <div class="f"><label class="lbl" for="kf">Free time (dias)</label><input id="kf" inputmode="numeric" value="${esc(c.freeTime || '')}" placeholder="padrão ${W.freeTimeDe(H.db, c)}"></div>
      <div class="f"><label class="lbl" for="kv">Diária após o prazo (US$)</label><input id="kv" inputmode="decimal" value="${esc(c.diaria || '')}" placeholder="${/rf|reefer/i.test(c.tipo || '') ? 460 : 75}"></div>
      <div class="f"><label class="lbl" for="kr">Retirada do porto</label><input id="kr" type="date" value="${esc(W.soData(c.retirada))}"></div>
      <div class="f"><label class="lbl" for="kdv">Devolução do vazio</label><input id="kdv" type="date" value="${esc(W.soData(c.devolucao))}"></div>
      <div class="f"><label class="lbl" for="kfa">Fatura do armador (US$)</label><input id="kfa" inputmode="decimal" value="${esc(c.faturaArmador || '')}"></div>
      <div class="f w2"><label class="lbl" for="keir">EIR / comprovante de devolução (link)</label><input id="keir" value="${esc(c.eir || '')}"></div></div>
      <p class="note">Dia 1 do free time = dia da descarga. A ShipsGo preenche a descarga sozinha quando ligada.</p>`, '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="ok">Salvar</button>');
    m.querySelector('#ok').onclick = () => { const oa = opById(opId), ca = oa.containers[idx];
      Object.assign(ca, { armador: val(m, '#ka'), tipo: val(m, '#kt'), descarga: val(m, '#kd'), freeTime: +val(m, '#kf') || '', diaria: numIn(m, '#kv') || '', retirada: val(m, '#kr'), devolucao: val(m, '#kdv'), faturaArmador: numIn(m, '#kfa') || '', eir: val(m, '#keir') });
      H.salvar(); H.fecharModal(); H.render(); };
  }
  H.editarConteiner = editarConteiner;
  H.telas.conteineres = function (el) {
    const lista = W.conteineres(H.db, hoje()), ft = painel('_comex').freeTime || {};
    const venc = lista.filter(x => x.status === 'vencido'), aten = lista.filter(x => x.status === 'atencao');
    const custo = lista.reduce((a, x) => a + (x.custoUSD || 0), 0);
    el.innerHTML = cab('Contêineres & free time', 'Prazo grátis de cada contêiner a partir da descarga. Alerta 2 dias antes de vencer; depois disso, cada dia é diária de demurrage cobrada pelo armador.') +
      `<div class="kpis">${kpi('Contêineres acompanhados', lista.length, lista.filter(x => x.status === 'sem-descarga').length + ' aguardando descarga')}${kpi('Vencem em até 2 dias', aten.length, aten.map(x => x.c.numero).slice(0, 3).join(', '), aten.length ? 'neg' : '')}${kpi('Em demurrage', venc.length, venc.length ? 'devolver ou negociar hoje' : 'nenhum', venc.length ? 'neg' : '')}${kpi('Demurrage acumulada', usd(custo), 'estimada pelas diárias')}</div>
      <div class="box"><div class="tw"><table><thead><tr><th>Contêiner</th><th>Operação</th><th>Armador</th><th>Situação</th><th>Descarga</th><th class="num">Free time</th><th>Limite</th><th class="num">Dias</th><th class="num">Custo (US$)</th><th>Fatura × calculado</th><th></th></tr></thead><tbody>
      ${lista.map(x => { const [t, cor] = ST_CONT[x.status]; const fat = +x.c.faturaArmador; const dif = fat && x.custoUSD != null ? fat - x.custoUSD : null;
        return `<tr><td class="mono"><b>${esc(x.c.numero)}</b> <span class="note">${esc(x.c.tipo || '')}</span></td><td><a href="#" data-irp="ficha|${esc(x.op)}" class="mono">${esc(x.op)}</a> <span class="note">${esc(x.cliente || '')}</span></td><td>${esc(x.c.armador || '')}</td><td>${pill(t, cor)}</td><td class="mono">${W.dataBR(x.c.descarga)}</td><td class="num">${x.freeTime} d</td><td class="mono">${W.dataBR(x.limite)}</td>
          <td class="num">${x.status === 'sem-descarga' || /devolvido/.test(x.status) ? (x.excedidos ? '+' + x.excedidos : '—') : x.excedidos ? '+' + x.excedidos : x.restantes}</td><td class="num">${x.custoUSD ? usd(x.custoUSD) : '—'}</td><td>${dif == null ? '<span class="note">—</span>' : Math.abs(dif) < 1 ? pill('confere', COR.ok) : pill((dif > 0 ? 'fatura +' : 'fatura ') + usd(dif).replace('US$ ', 'US$ '), COR.vencido)}</td>
          <td class="num"><button class="btn ghost sm" data-ec="${esc(x.op)}|${x.idx}">Atualizar</button></td></tr>`; }).join('') || '<tr><td colspan="11" class="empty">Nenhum contêiner cadastrado nas operações.</td></tr>'}</tbody></table></div></div>
      <div class="box"><div class="box-h"><h2>Free time padrão por armador</h2><button class="btn sm" id="addft">+ Armador</button></div><div class="box-b">
        <p class="note">Sem armador cadastrado vale ${W.FREE_TIME_PADRAO.dry} dias (dry) e ${W.FREE_TIME_PADRAO.reefer} (reefer). Use o free time negociado em cada cotação de frete.</p>
        <div class="tw"><table><tbody>${Object.entries(ft).map(([a, d]) => `<tr><td>${esc(a)}</td><td class="num">${d} dias</td><td class="num"><button class="btn ghost sm" data-delft="${esc(a)}">Remover</button></td></tr>`).join('') || '<tr><td class="empty">Nenhum armador cadastrado.</td></tr>'}</tbody></table></div></div></div>`;
    el.querySelectorAll('[data-irp]').forEach(b => b.onclick = e => { e.preventDefault(); const [t, x] = b.dataset.irp.split('|'); H.ir(t, x); });
    el.querySelectorAll('[data-ec]').forEach(b => b.onclick = () => { const [op, i] = b.dataset.ec.split('|'); editarConteiner(op, +i); });
    el.querySelector('#addft').onclick = () => { const m = H.modal('Free time por armador', '<div class="fields"><div class="f w2"><label class="lbl" for="fa">Armador</label><input id="fa" placeholder="MSC, Maersk, CMA CGM…"></div><div class="f"><label class="lbl" for="fd">Dias</label><input id="fd" inputmode="numeric"></div></div>', '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="ok">Salvar</button>');
      m.querySelector('#ok').onclick = () => { const a = val(m, '#fa').toLowerCase(), d = +val(m, '#fd'); if (!a || !d) return H.toast('Informe armador e dias.'); const c = painel('_comex'); c.freeTime = Object.assign({}, c.freeTime || {}, { [a]: d }); H.salvar(); H.fecharModal(); H.render(); }; };
    el.querySelectorAll('[data-delft]').forEach(b => b.onclick = () => { const c = painel('_comex'); const f = Object.assign({}, c.freeTime || {}); delete f[b.dataset.delft]; c.freeTime = f; H.salvar(); H.render(); });
  };

  /* ---------- Conta-corrente do cliente e prestação de contas ---------- */
  let ccOp = null;
  function htmlPrestacao(cc) {
    const o = cc.op, linhas = cc.movimentos.filter(m => m.realizado && (cc.itemizado || m.entrada));
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Prestação de contas ${esc(o.id)}</title><style>body{font:12px/1.45 'IBM Plex Sans',Arial,sans-serif;color:#1d2433;margin:28px}h1{font-size:18px;color:#0B3D91;margin:0}h2{font-size:13px;color:#0B3D91;margin:18px 0 6px}table{width:100%;border-collapse:collapse}th,td{padding:5px 6px;border-bottom:1px solid #e3e7ee;text-align:left}th{background:#0B3D91;color:#fff;font-weight:600}.n{text-align:right;font-variant-numeric:tabular-nums}.t{font-weight:700}.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #CE0058;padding-bottom:8px}.s{color:#5b6475}</style></head><body>
      <div class="top"><div><h1>WindGate · Prestação de contas</h1><div class="s">Operação ${esc(o.id)} · ${esc(o.cliente || '')} · ${esc(o.nome || '')}</div></div><div class="s">Emitida em ${W.dataBR(hoje())}</div></div>
      <h2>${cc.itemizado ? 'Movimentação da conta da operação' : 'Pagamentos recebidos'}</h2><table><thead><tr><th>Data</th><th>Descrição</th><th class="n">Entrada (R$)</th>${cc.itemizado ? '<th class="n">Saída (R$)</th><th class="n">Saldo (R$)</th>' : ''}</tr></thead><tbody>
      ${linhas.map(m => `<tr><td>${W.dataBR(m.data)}</td><td>${esc(m.desc)}</td><td class="n">${m.entrada ? n2(m.entrada) : ''}</td>${cc.itemizado ? `<td class="n">${m.saida ? n2(m.saida) : ''}</td><td class="n">${n2(m.saldo)}</td>` : ''}</tr>`).join('')}</tbody></table>
      <h2>Resumo</h2><table><tbody><tr><td>Recebido do cliente</td><td class="n">${n2(cc.recebido)}</td></tr>${cc.itemizado ? `<tr><td>Pago por conta do cliente</td><td class="n">${n2(cc.pago)}</td></tr><tr><td>A pagar lançado</td><td class="n">${n2(cc.aPagar)}</td></tr>` : ''}<tr><td>A receber</td><td class="n">${n2(cc.aReceber)}</td></tr>
      ${cc.itemizado ? `<tr class="t"><td>Saldo final (${esc(cc.situacao)})</td><td class="n">${n2(Math.abs(cc.saldoFinal))}</td></tr>` : ''}</tbody></table>
      <p class="s" style="margin-top:22px">WindGate Importação & Comércio · SF Trading Ltda · CNPJ 58.762.606/0001-44</p><script>window.onload=()=>window.print()<\/script></body></html>`;
  }
  H.telas.contacorrente = function (el, opId) {
    if (!H.pode('fin.ver')) { el.innerHTML = '<div class="banner">Conta-corrente é do financeiro.</div>'; return; }
    ccOp = opId || ccOp || (opsAtivas()[0] || {}).id;
    const o = opById(ccOp);
    if (!o) { el.innerHTML = cab('Conta-corrente do cliente', 'Nenhuma operação.'); return; }
    const cc = W.contaCorrente(H.db, o.id, hoje());
    el.innerHTML = cab('Conta-corrente do cliente', 'Numerário pedido, recebido e gasto em cada operação, com o saldo a devolver ou cobrar e a prestação de contas para o cliente.', `<select class="inp" id="op">${optOps(o.id, true)}</select><button class="btn" id="num">Solicitar numerário</button><button class="btn blue" id="prest">Prestação de contas</button>`) +
      `${!o.modalidade ? '<div class="banner">Defina a modalidade da operação (na ficha). Em conta e ordem a prestação mostra cada despesa; em encomenda/própria, só o preço e os pagamentos.</div>' : ''}
      <div class="kpis">${kpi('Recebido do cliente', W.fmtBRLk(cc.recebido), W.fmtBRLk(cc.aReceber) + ' a receber')}${kpi('Pago a terceiros', W.fmtBRLk(cc.pago), W.fmtBRLk(cc.aPagar) + ' a pagar')}${kpi('Saldo hoje', W.fmtBRLk(cc.saldo), cc.saldo < 0 ? 'a WindGate está financiando' : 'dinheiro do cliente em caixa', cc.saldo < 0 ? 'neg' : '')}${kpi('Saldo final previsto', W.fmtBRLk(Math.abs(cc.saldoFinal)), cc.situacao, cc.saldoFinal < 0 && cc.itemizado ? 'neg' : '')}</div>
      ${cc.bloqueios.length ? `<div class="banner">${cc.bloqueios.length} pagamento(s) previsto(s) sem numerário suficiente: ${cc.bloqueios.slice(0, 3).map(b => `${esc(b.saida.desc || '')} em ${W.dataBR(b.ate)} (faltam ${W.fmtBRL(b.falta)})`).join('; ')}. Peça o numerário antes de pagar.</div>` : ''}
      <div class="box"><div class="tw"><table><thead><tr><th>Data</th><th>Descrição</th><th>Situação</th><th class="num">Entrada</th><th class="num">Saída</th><th class="num">Saldo realizado</th></tr></thead><tbody>
      ${cc.movimentos.map(m => `<tr><td class="mono">${W.dataBR(m.data)}</td><td>${esc(m.desc)}${m.classe ? ` <span class="note">${esc(W.CLASSE_ROTULO[m.classe])}</span>` : ''}</td><td>${m.realizado ? pill(m.entrada ? 'recebido' : 'pago', COR.ok) : pill('previsto', COR.cinza)}</td><td class="num">${m.entrada ? n2(m.entrada) : ''}</td><td class="num">${m.saida ? n2(m.saida) : ''}</td><td class="num">${m.realizado ? n2(m.saldo) : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sem lançamentos nesta operação.</td></tr>'}</tbody></table></div></div>`;
    el.querySelector('#op').onchange = e => H.ir('contacorrente', e.target.value);
    el.querySelector('#prest').onclick = () => { const w = window.open('', '_blank'); if (!w) return H.toast('O navegador bloqueou a janela. Permita pop-ups para este site.'); w.document.write(htmlPrestacao(cc)); w.document.close(); };
    el.querySelector('#num').onclick = () => {
      const m = H.modal('Solicitar numerário', `<div class="fields"><div class="f w2"><label class="lbl" for="nd">Para quê</label><input id="nd" placeholder="Impostos de nacionalização, frete, saldo da fábrica…"></div><div class="f"><label class="lbl" for="nv">Valor (R$)</label><input id="nv" inputmode="decimal"></div><div class="f"><label class="lbl" for="nvc">Vencimento</label><input id="nvc" type="date" value="${hoje()}"></div></div><p class="note">Cria a cobrança prevista no Financeiro desta operação e prepara a mensagem para o cliente.</p>`, '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="ok">Criar</button>');
      m.querySelector('#ok').onclick = () => { const v = numIn(m, '#nv'), d = val(m, '#nd') || 'Numerário'; if (!v) return H.toast('Informe o valor.');
        garantir('fin').push({ _id: W.novoId(), op: o.id, tipo: 'Receita', categoria: 'Numerário', desc: 'Numerário · ' + d, valor: v, status: 'Previsto', vencimento: val(m, '#nvc'), empresa: o.empresa || 'WindGate', cliente: o.cliente || '', por: eu(), criadoEm: new Date().toISOString() });
        H.salvar();
        const txt = `Olá! Para seguirmos com a operação ${o.id} (${o.nome || ''}), precisamos do numerário de ${W.fmtBRL(v)} referente a ${d}, até ${W.dataBR(val(m, '#nvc'))}. Assim que o valor entrar, efetuamos o pagamento. Qualquer dúvida, estamos à disposição. Equipe WindGate`;
        H.modal('Mensagem para o cliente', `<textarea class="inp" rows="6" style="width:100%" id="tx">${esc(txt)}</textarea>`, '<button class="btn blue" id="cp">Copiar</button>').querySelector('#cp').onclick = () => { try { navigator.clipboard.writeText(txt); H.toast('Copiado'); } catch (e) {} };
        H.render(); };
    };
  };

  /* ---------- Tributos: regras por data e transição 2027–2033 ---------- */
  H.telas.tributos = function (el) {
    if (!H.pode('fin.resultado')) { el.innerHTML = '<div class="banner">Motor tributário é da diretoria e do financeiro.</div>'; return; }
    const regras = W.regrasTributarias(H.db), t = W.tributosNaData(H.db, hoje()), t27 = W.tributosNaData(H.db, '2027-01-02');
    const cfg = painel('_transicao'), benef = +cfg.beneficioAnual || 0, marg = +cfg.margemAnual || 0;
    const sim = W.simularTransicao(H.db, benef, marg);
    const edita = H.aprova();
    el.innerHTML = cab('Tributos & transição', 'Toda regra tem início e fim de vigência: a mesma cotação recalcula pelo que vale na data de entrega. Alíquotas cheias de CBS e IBS ainda são estimativas até o Senado fixar; ajuste aqui quando sair.', edita ? '<button class="btn" id="padrao">Voltar ao padrão</button>' : '') +
      `<div class="kpis">${kpi('Hoje', 'Regra atual', `PIS/COFINS + ICMS; CBS ${t.cbs.aliq}% e IBS ${t.ibs.aliq}% só informativos na DUIMP`)}${kpi('A partir de 01/01/2027', 'CBS ' + t27.cbs.aliq + '%', 'PIS/COFINS extintos · IPI zerado (fora da ZFM)', 'neg')}${kpi('Benefício de ICMS de AL', '2032', 'vale até 31/12/2032; o IBS não admite incentivo estadual')}${kpi('2033', 'ICMS extinto', 'IBS cheio (estimado ' + W.tributosNaData(H.db, '2033-06-01').ibs.aliq + '%)')}</div>
      <div class="box"><div class="box-h"><h2>Simulador: o que sobra do benefício de AL até 2033</h2><span class="note">valores anuais de hoje, em R$</span></div><div class="box-b">
        <div class="fields"><div class="f"><label class="lbl" for="sb">Ganho anual com o benefício hoje</label><input id="sb" inputmode="decimal" value="${benef || ''}" placeholder="ex.: 600000"></div><div class="f"><label class="lbl" for="sm">Margem anual hoje</label><input id="sm" inputmode="decimal" value="${marg || ''}" placeholder="ex.: 1500000"></div><div class="f"><span class="lbl">&nbsp;</span><button class="btn blue" id="simular">Simular</button></div></div>
        ${benef ? `${H.grafico ? H.grafico.barras(sim.map(s => String(s.ano)), [{ nome: 'Margem', valores: sim.map(s => s.margem), cor: 'var(--blue)' }, { nome: 'Ganho do benefício', valores: sim.map(s => s.ganho), cor: 'var(--mag)' }], { h: 200 }) : ''}
        <div class="tw"><table><thead><tr><th>Ano</th><th class="num">ICMS que vale</th><th class="num">CBS</th><th class="num">IBS</th><th>Benefício AL</th><th class="num">Ganho do benefício</th><th class="num">Margem</th><th class="num">Perda vs hoje</th></tr></thead><tbody>${sim.map(s => `<tr><td>${s.ano}</td><td class="num">${Math.round(s.icmsFator * 100)}%</td><td class="num">${s.cbs}%</td><td class="num">${s.ibs}%</td><td>${s.beneficio ? 'sim' : '<b>não</b>'}</td><td class="num">${W.fmtBRLk(s.ganho)}</td><td class="num"><b>${W.fmtBRLk(s.margem)}</b></td><td class="num" style="color:${s.perda > 0 ? COR.vencido : 'inherit'}">${s.perda ? '−' + W.fmtBRLk(s.perda) : '—'}</td></tr>`).join('')}</tbody></table></div>
        <p class="note">Planejamento, não apuração: o ganho do benefício cai junto com o ICMS (90% em 2029 → 60% em 2032) e zera em 2033. Validar premissas com o Pedro.</p>` : '<p class="note">Informe o ganho anual com o benefício (diferença entre o ICMS cheio e o efetivo em AL) e a margem anual para ver ano a ano.</p>'}</div></div>
      <div class="box"><div class="box-h"><h2>Regras com vigência</h2><span class="note">${edita ? 'clique na alíquota para ajustar' : 'só a diretoria ajusta'}</span></div><div class="tw"><table><thead><tr><th>Tributo</th><th>De</th><th>Até</th><th class="num">Alíquota</th><th>Recolhe?</th><th>Fonte</th></tr></thead><tbody>
        ${regras.map((r, i) => `<tr${t.regras.includes(r) ? ' style="background:var(--blue-soft)"' : ''}><td><b>${esc(r.l)}</b>${r.estimativa ? ' ' + pill('estimativa', COR.atencao) : ''}</td><td class="mono">${W.dataBR(r.de)}</td><td class="mono">${r.ate >= '2099' ? '—' : W.dataBR(r.ate)}</td><td class="num">${r.aliq == null ? '—' : edita && r.aliq != null ? `<input class="inp" style="width:70px;text-align:right" data-al="${i}" value="${String(r.aliq).replace('.', ',')}">` : String(r.aliq).replace('.', ',') + '%'}</td><td>${r.recolhe === false ? 'não (teste)' : r.recolhe ? 'sim' : '—'}</td><td class="note">${esc(r.fonte || '')}</td></tr>`).join('')}</tbody></table></div></div>
      <p class="note">Linha destacada = vale hoje. Conta e ordem: a partir de 2027 o contribuinte de IBS/CBS na importação é o adquirente (LC 214/2025); confirmar com o Pedro antes de cada contrato novo.</p>`;
    el.querySelector('#simular').onclick = () => { cfg.beneficioAnual = numIn(el, '#sb'); cfg.margemAnual = numIn(el, '#sm'); H.salvar(); H.render(); };
    el.querySelectorAll('[data-al]').forEach(i => i.onchange = () => { const novo = regras.map(r => Object.assign({}, r)); novo[+i.dataset.al].aliq = +String(i.value).replace(',', '.') || 0; novo[+i.dataset.al].editadoPor = eu(); H.db.hubPainel._tributos = novo; H.salvar(); H.render(); });
    const pd = el.querySelector('#padrao'); if (pd) pd.onclick = () => { delete H.db.hubPainel._tributos; H.db.hubPainel._tributos = []; H.salvar(); H.render(); };
  };

  /* ---------- Contratos ---------- */
  H.telas.contratos = function (el) {
    const cs = (H.db.hubContratos || []).filter(Boolean);
    const faltam = opsAtivas().filter(o => ['conta e ordem', 'encomenda'].includes(o.modalidade) && !W.contratoDaOp(H.db, o));
    el.innerHTML = cab('Contratos de compra e venda', 'Contrato de conta e ordem ou encomenda por operação (ou guarda-chuva por cliente), com cláusula de reajuste tributário para 2027 em diante.', '<button class="btn" id="modelo">Gerar modelo</button><button class="btn blue" id="novo">+ Contrato</button>') +
      `${faltam.length ? `<div class="banner">${faltam.length} operação(ões) sem contrato: ${faltam.map(o => esc(o.id)).join(', ')}.</div>` : ''}
      <div class="box"><div class="tw"><table><thead><tr><th>Cliente</th><th>Abrangência</th><th>Modalidade</th><th>Assinado</th><th>Vigência</th><th>Reajuste tributário</th><th>Situação</th><th></th></tr></thead><tbody>
      ${cs.map(c => `<tr><td><b>${esc(c.cliente || '')}</b></td><td>${c.tipo === 'guarda-chuva' ? 'todas as operações' : esc(c.op || '')}</td><td>${esc(c.modalidade || '')}</td><td class="mono">${W.dataBR(c.assinadoEm)}</td><td class="mono">${W.dataBR(c.vigencia)}</td><td>${c.clausulaTributaria ? pill('sim', COR.ok) : pill('não', COR.vencido)}</td><td>${pill(c.status || 'rascunho', c.status === 'assinado' ? COR.ok : COR.atencao)}</td><td class="num">${c.link ? `<a class="btn ghost sm" href="${esc(c.link)}" target="_blank" rel="noopener">Arquivo</a>` : ''}<button class="btn ghost sm" data-ed="${esc(c._id)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Nenhum contrato registrado.</td></tr>'}</tbody></table></div></div>`;
    const form = c => { c = c || { status: 'rascunho', modalidade: 'conta e ordem', tipo: 'operacao', clausulaTributaria: true };
      const m = H.modal('Contrato', `<div class="fields"><div class="f w2"><label class="lbl" for="kc">Cliente</label><input id="kc" value="${esc(c.cliente || '')}"></div>
        <div class="f"><label class="lbl" for="kt">Abrangência</label><select id="kt"><option value="operacao" ${c.tipo !== 'guarda-chuva' ? 'selected' : ''}>Uma operação</option><option value="guarda-chuva" ${c.tipo === 'guarda-chuva' ? 'selected' : ''}>Guarda-chuva (todas)</option></select></div>
        <div class="f"><label class="lbl" for="ko">Operação</label><select id="ko"><option value="">—</option>${optOps(c.op, true)}</select></div>
        <div class="f"><label class="lbl" for="km">Modalidade</label><select id="km">${W.MODALIDADES.slice(0, 2).map(([k, l]) => `<option value="${k}" ${c.modalidade === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="f"><label class="lbl" for="ks">Situação</label><select id="ks">${['rascunho', 'enviado', 'assinado', 'cancelado'].map(s => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="f"><label class="lbl" for="ka">Assinado em</label><input id="ka" type="date" value="${esc(c.assinadoEm || '')}"></div><div class="f"><label class="lbl" for="kv">Vigência até</label><input id="kv" type="date" value="${esc(c.vigencia || '')}"></div>
        <div class="f w2"><label class="lbl" for="kl">Link do arquivo assinado</label><input id="kl" value="${esc(c.link || '')}"></div>
        <div class="f w2"><label class="lbl"><input type="checkbox" id="kr" ${c.clausulaTributaria ? 'checked' : ''}> Tem cláusula de reajuste tributário (CBS/IBS)</label></div></div>`, `${c._id ? '<button class="btn ghost" id="del">Excluir</button>' : ''}<button class="btn" data-x>Cancelar</button><button class="btn blue" id="ok">Salvar</button>`);
      m.querySelector('#ok').onclick = () => { const op = val(m, '#ko'), o = opById(op); const r = { cliente: val(m, '#kc') || (o && o.cliente) || '', tipo: val(m, '#kt'), op, modalidade: val(m, '#km'), status: val(m, '#ks'), assinadoEm: val(m, '#ka'), vigencia: val(m, '#kv'), link: val(m, '#kl'), clausulaTributaria: m.querySelector('#kr').checked };
        if (!r.cliente) return H.toast('Informe o cliente.'); const l = garantir('hubContratos'), a = c._id && l.find(x => x._id === c._id);
        if (a) Object.assign(a, r); else l.push(Object.assign({ _id: W.novoId(), por: eu(), em: new Date().toISOString() }, r)); H.salvar(); H.fecharModal(); H.render(); };
      const d = m.querySelector('#del'); if (d) d.onclick = () => { H.db.hubContratos = H.db.hubContratos.filter(x => x._id !== c._id); H.salvar(); H.fecharModal(); H.render(); };
    };
    el.querySelector('#novo').onclick = () => form();
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => form(cs.find(x => x._id === b.dataset.ed)));
    el.querySelector('#modelo').onclick = () => {
      const m = H.modal('Modelo de contrato', `<div class="fields"><div class="f w2"><label class="lbl" for="mo">Operação</label><select id="mo">${optOps('', true)}</select></div><div class="f"><label class="lbl" for="mm">Modalidade</label><select id="mm">${W.MODALIDADES.slice(0, 2).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div><textarea id="mt" class="inp" rows="14" style="width:100%;margin-top:8px"></textarea>`, '<button class="btn blue" id="cp">Copiar</button>');
      const at = () => { const o = opById(val(m, '#mo')) || {}; m.querySelector('#mt').value = W.modeloContrato({ cliente: o.cliente, op: o.id, produto: o.nome, modalidade: val(m, '#mm'), empresa: o.empresa === 'JeT' ? 'JET IMPORT' : undefined, cnpjEmpresa: o.empresa === 'JeT' ? '[CNPJ JeT]' : undefined }); };
      m.querySelector('#mo').onchange = at; m.querySelector('#mm').onchange = at; at();
      m.querySelector('#cp').onclick = () => { try { navigator.clipboard.writeText(m.querySelector('#mt').value); H.toast('Copiado'); } catch (e) {} };
    };
  };

  /* ---------- Compliance e habilitações ---------- */
  H.telas.compliance = function (el) {
    const xs = (H.db.hubCompliance || []).filter(Boolean).sort((a, b) => String(a.validade || '9').localeCompare(String(b.validade || '9')));
    const h = hoje();
    el.innerHTML = cab('Compliance & habilitações', 'Radar, certificados digitais, procurações e licenças das duas empresas, com aviso 30 dias antes de vencer. Na conta e ordem, o adquirente também precisa estar habilitado.', '<button class="btn" id="base">Criar itens básicos</button><button class="btn blue" id="novo">+ Item</button>') +
      `<div class="box"><div class="tw"><table><thead><tr><th>Tipo</th><th>Empresa / cliente</th><th>Detalhe</th><th>Validade</th><th>Situação</th><th></th></tr></thead><tbody>
      ${xs.map(c => { const d = W.ehISO(c.validade) ? W.diasEntre(h, c.validade) : null; const st = d == null ? ['sem validade', COR.cinza] : d < 0 ? ['vencido', COR.vencido] : d <= 30 ? [`vence em ${d} d`, COR.atencao] : ['em dia', COR.ok];
        return `<tr><td><b>${esc(c.tipo)}</b></td><td>${esc(c.empresa || '')}</td><td>${esc(c.titulo || '')}${c.limite ? ` <span class="note">limite ${esc(c.limite)}</span>` : ''}</td><td class="mono">${W.dataBR(c.validade)}</td><td>${pill(st[0], st[1])}</td><td class="num"><button class="btn ghost sm" data-ed="${esc(c._id)}">Editar</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">Nada cadastrado. Use "Criar itens básicos".</td></tr>'}</tbody></table></div></div>
      <p class="note">Radar na modalidade limitada pode impedir o registro de DUIMP: confirme a modalidade da SF e da JeT e registre aqui. Certificados A1 ficam como arquivo secreto no servidor, nunca no banco nem no chat; aqui só a validade.</p>`;
    const form = c => { c = c || { tipo: 'Radar', empresa: 'SF Trading' };
      const m = H.modal('Item de compliance', `<div class="fields"><div class="f"><label class="lbl" for="qt">Tipo</label><select id="qt">${W.COMPLIANCE_TIPOS.map(t => `<option ${c.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="f"><label class="lbl" for="qe">Empresa / cliente</label><input id="qe" value="${esc(c.empresa || '')}"></div><div class="f w2"><label class="lbl" for="qd">Detalhe</label><input id="qd" value="${esc(c.titulo || '')}" placeholder="modalidade, número, quem assina…"></div><div class="f"><label class="lbl" for="ql">Limite (Radar)</label><input id="ql" value="${esc(c.limite || '')}"></div><div class="f"><label class="lbl" for="qv">Validade</label><input id="qv" type="date" value="${esc(c.validade || '')}"></div></div>`, `${c._id ? '<button class="btn ghost" id="del">Excluir</button>' : ''}<button class="btn" data-x>Cancelar</button><button class="btn blue" id="ok">Salvar</button>`);
      m.querySelector('#ok').onclick = () => { const r = { tipo: val(m, '#qt'), empresa: val(m, '#qe'), titulo: val(m, '#qd'), limite: val(m, '#ql'), validade: val(m, '#qv') }; const l = garantir('hubCompliance'), a = c._id && l.find(x => x._id === c._id); if (a) Object.assign(a, r); else l.push(Object.assign({ _id: W.novoId(), por: eu() }, r)); H.salvar(); H.fecharModal(); H.render(); };
      const d = m.querySelector('#del'); if (d) d.onclick = () => { H.db.hubCompliance = H.db.hubCompliance.filter(x => x._id !== c._id); H.salvar(); H.fecharModal(); H.render(); };
    };
    el.querySelector('#novo').onclick = () => form();
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => form(xs.find(x => x._id === b.dataset.ed)));
    el.querySelector('#base').onclick = () => { const l = garantir('hubCompliance'), tem = (t, e) => l.some(x => x.tipo === t && x.empresa === e);
      [['Radar', 'SF Trading', 'confirmar modalidade (ilimitada/limitada)'], ['Radar', 'JeT Import', 'confirmar modalidade'], ['Certificado A1', 'SF Trading', 'Portal Único e API do Santander'], ['Certificado A1', 'JeT Import', 'API do Itaú'], ['Procuração do despachante', 'SF Trading', 'Ágil Aduaneira'], ['Procuração no Portal Único', 'SF Trading', 'Ágil Aduaneira']]
        .forEach(([t, e, d]) => { if (!tem(t, e)) l.push({ _id: W.novoId(), tipo: t, empresa: e, titulo: d, validade: '', por: eu() }); }); H.salvar(); H.render(); };
  };

  /* ---------- Catálogo de produtos / NCM ---------- */
  let buscaCat = '';
  const podeCat = () => H.pode('fin.ver') || H.pode('docs.revisar');
  H.telas.catalogo = function (el) {
    const lib = H.db.ncmlib = H.db.ncmlib || {};
    const xs = Object.entries(lib).filter(([k, v]) => v && (!buscaCat || (k + ' ' + (v.d || '') + ' ' + (v.produtos || '')).toLowerCase().includes(buscaCat.toLowerCase()))).sort((a, b) => a[0].localeCompare(b[0]));
    el.innerHTML = cab('Catálogo de produtos & NCM', 'A mesma biblioteca de NCM que a cotação usa, agora com atributos da DUIMP, Ex-tarifário, 52/91, monofásico e quem revisou. Alíquota conferida aqui vale para toda a equipe.', `<input class="inp" id="bc" type="search" placeholder="Buscar NCM ou produto" value="${esc(buscaCat)}">${podeCat() ? '<button class="btn blue" id="novo">+ NCM</button>' : ''}`) +
      `<div class="box"><div class="tw"><table><thead><tr><th>NCM</th><th>Descrição / produtos</th><th class="num">II</th><th class="num">IPI</th><th class="num">PIS</th><th class="num">COFINS</th><th>52/91</th><th>Mono</th><th>Ex-tarifário</th><th>Revisão</th><th></th></tr></thead><tbody>
      ${xs.map(([k, v]) => `<tr><td class="mono"><b>${esc(k.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3'))}</b></td><td>${esc(v.d || '')}${v.produtos ? `<br><small class="note">${esc(v.produtos)}</small>` : ''}</td><td class="num">${v.ii ?? '—'}</td><td class="num">${v.ipi ?? '—'}</td><td class="num">${v.pis ?? 2.1}</td><td class="num">${v.cofins ?? 9.65}</td><td>${v.c5291 ? 'sim' : ''}</td><td>${v.mono ? 'sim' : ''}</td><td>${esc(v.exTarifario || '')}</td><td>${v.revisadoPor ? `${esc(v.revisadoPor)} <span class="note">${W.dataBR(v.revisadoEm)}</span>` : pill('não revisado', COR.atencao)}</td><td class="num">${podeCat() ? `<button class="btn ghost sm" data-ed="${esc(k)}">Editar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="11" class="empty">Nenhuma NCM no catálogo.</td></tr>'}</tbody></table></div></div>`;
    el.querySelector('#bc').oninput = e => { buscaCat = e.target.value; clearTimeout(H._tbc); H._tbc = setTimeout(() => { H.render(); const i = document.querySelector('#bc'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
    const form = k => { const v = Object.assign({}, k ? lib[k] : {});
      const m = H.modal(k ? 'NCM ' + k : 'Nova NCM', `<div class="fields"><div class="f"><label class="lbl" for="nn">NCM (8 dígitos)</label><input id="nn" value="${esc(k || '')}" ${k ? 'readonly' : ''}></div><div class="f w2"><label class="lbl" for="nd">Descrição</label><input id="nd" value="${esc(v.d || '')}"></div>
        <div class="f"><label class="lbl" for="ni">II %</label><input id="ni" value="${v.ii ?? ''}"></div><div class="f"><label class="lbl" for="np">IPI %</label><input id="np" value="${v.ipi ?? ''}"></div><div class="f"><label class="lbl" for="nps">PIS %</label><input id="nps" value="${v.pis ?? 2.1}"></div><div class="f"><label class="lbl" for="nc">COFINS %</label><input id="nc" value="${v.cofins ?? 9.65}"></div>
        <div class="f w2"><label class="lbl" for="npr">Produtos que usam</label><input id="npr" value="${esc(v.produtos || '')}"></div><div class="f w2"><label class="lbl" for="na">Atributos da DUIMP</label><input id="na" value="${esc(v.atributos || '')}" placeholder="material, potência, voltagem…"></div><div class="f"><label class="lbl" for="nx">Ex-tarifário</label><input id="nx" value="${esc(v.exTarifario || '')}"></div>
        <div class="f"><label class="lbl"><input type="checkbox" id="n52" ${v.c5291 ? 'checked' : ''}> Convênio 52/91</label></div><div class="f"><label class="lbl"><input type="checkbox" id="nm" ${v.mono ? 'checked' : ''}> PIS/COFINS monofásico</label></div><div class="f"><label class="lbl"><input type="checkbox" id="nr" ${v.revisadoPor ? 'checked' : ''}> Conferido no Simulador Siscomex / despachante</label></div></div>`, '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="ok">Salvar</button>');
      m.querySelector('#ok').onclick = () => { const nk = val(m, '#nn').replace(/\D/g, ''); if (nk.length !== 8) return H.toast('NCM com 8 dígitos.');
        const p = s => { const t = val(m, s); return t === '' ? null : +t.replace(',', '.'); };
        const r = Object.assign({}, lib[nk] || {}, { d: val(m, '#nd'), ii: p('#ni'), ipi: p('#np'), pis: p('#nps'), cofins: p('#nc'), produtos: val(m, '#npr'), atributos: val(m, '#na'), exTarifario: val(m, '#nx'), c5291: m.querySelector('#n52').checked, mono: m.querySelector('#nm').checked });
        if (m.querySelector('#nr').checked && !r.revisadoPor) { r.revisadoPor = eu(); r.revisadoEm = hoje(); } if (!m.querySelector('#nr').checked) { delete r.revisadoPor; delete r.revisadoEm; }
        lib[nk] = r; H.salvar(); H.fecharModal(); H.render(); };
    };
    const nv = el.querySelector('#novo'); if (nv) nv.onclick = () => form();
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => form(b.dataset.ed));
  };

  /* ---------- Crédito por cliente ---------- */
  H.telas.credito = function (el) {
    if (!H.pode('fin.ver')) { el.innerHTML = '<div class="banner">Crédito é do financeiro.</div>'; return; }
    const xs = W.creditoClientes(H.db, hoje());
    el.innerHTML = cab('Crédito por cliente', 'Quanto cada cliente deve à WindGate agora (o que já pagamos por ele e ainda não recebemos, mais o vencido) contra o limite definido.') +
      `<div class="box"><div class="tw"><table><thead><tr><th>Cliente</th><th class="num">Operações ativas</th><th class="num">Financiado por nós</th><th class="num">Vencido</th><th class="num">Usado</th><th class="num">Limite</th><th class="num">Uso</th><th class="num">Atraso médio</th></tr></thead><tbody>
      ${xs.map(c => `<tr><td><b>${esc(c.cliente)}</b></td><td class="num">${c.ops}</td><td class="num">${W.fmtBRLk(c.exposicao)}</td><td class="num" style="color:${c.vencido ? COR.vencido : 'inherit'}">${W.fmtBRLk(c.vencido)}</td><td class="num"><b>${W.fmtBRLk(c.usado)}</b></td>
        <td class="num">${H.aprova() ? `<input class="inp" style="width:110px;text-align:right" data-lim="${esc(c.cliente)}" value="${c.limite || ''}" placeholder="sem limite">` : (c.limite ? W.fmtBRLk(c.limite) : '—')}</td><td class="num" style="color:${c.estourado ? COR.vencido : 'inherit'}">${c.pct == null ? '—' : pct(c.pct)}</td><td class="num">${c.atrasoMedio == null ? '—' : c.atrasoMedio.toFixed(1).replace('.', ',') + ' d'}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sem clientes com operações.</td></tr>'}</tbody></table></div></div>
      <p class="note">Cliente acima do limite vai para a Torre do Samir. Regra de proteção: sem numerário, não pagamos terceiros.</p>`;
    el.querySelectorAll('[data-lim]').forEach(i => i.onchange = () => { const c = painel('_credito'); const v = +String(i.value).replace(/\./g, '').replace(',', '.'); if (v > 0) c[i.dataset.lim] = v; else delete c[i.dataset.lim]; H.db.hubPainel._credito = Object.assign({}, c); H.salvar(); H.render(); });
  };

  /* ---------- Portais externos: cliente, fornecedor, despachante ---------- */
  let portOp = null;
  H.telas.portais = function (el) {
    portOp = portOp || (opsAtivas()[0] || {}).id;
    const o = opById(portOp);
    const evs = (H.db.ops || []).filter(x => x && Array.isArray(x.portalEventos)).flatMap(x => x.portalEventos.map(e => Object.assign({ op: x.id }, e))).sort((a, b) => String(b.em).localeCompare(String(a.em))).slice(0, 20);
    el.innerHTML = cab('Portais externos', 'Um link por operação, sem senha e com validade, para o cliente acompanhar, o fornecedor confirmar produção e embarque e o despachante registrar DUIMP e canal. Ninguém de fora vê custo interno nem margem.') +
      `<div class="box"><div class="box-h"><h2>Gerar link</h2></div><div class="box-b"><div class="fields"><div class="f w2"><label class="lbl" for="po">Operação</label><select id="po">${optOps(portOp, true)}</select></div><div class="f"><label class="lbl" for="pt">Para</label><select id="pt"><option value="cliente">Cliente</option><option value="fornecedor">Fornecedor (fábrica)</option><option value="despachante">Despachante</option></select></div><div class="f"><label class="lbl" for="pd">Validade (dias)</label><input id="pd" value="60" inputmode="numeric"></div><div class="f"><span class="lbl">&nbsp;</span><button class="btn blue" id="gerar">Gerar link</button></div></div><div id="plink"></div></div></div>
      ${o ? `<div class="box"><div class="box-h"><h2>Documentos que o cliente vê · ${esc(o.id)}</h2><span class="note">marque o que pode ser liberado</span></div><div class="box-b list">${(H.db.docs || []).filter(d => d && d.op === o.id).map(d => `<label class="row"><span>${esc(d.nome || d.grupo)} <span class="note">${esc(d.status || '')}</span></span><input type="checkbox" data-lib="${esc(d._id)}" ${d.liberadoCliente ? 'checked' : ''}></label>`).join('') || '<p class="empty">Sem documentos nesta operação.</p>'}</div></div>` : ''}
      <div class="box"><div class="box-h"><h2>Recebido pelos portais</h2></div><div class="box-b list">${evs.map(e => `<div class="row"><div><b class="mono">${esc(e.op)}</b> · ${esc(e.de)} · ${esc(e.acao.replace(/-/g, ' '))}${e.data ? ' ' + W.dataBR(e.data) : ''}<br><small class="note">${esc(e.texto || '')} · ${W.dataBR(e.em)}</small></div></div>`).join('') || '<p class="empty">Nada recebido ainda.</p>'}</div></div>`;
    el.querySelector('#po').onchange = e => { portOp = e.target.value; H.render(); };
    el.querySelectorAll('[data-lib]').forEach(i => i.onchange = () => { const d = (H.db.docs || []).find(x => x && x._id === i.dataset.lib); if (d) { d.liberadoCliente = i.checked; H.salvar(); } });
    el.querySelector('#gerar').onclick = async () => {
      try { const r = await H.api('/api/portal/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: val(el, '#po'), tipo: val(el, '#pt'), dias: +val(el, '#pd') || 60 }) }); const j = await r.json();
        if (!j.success) return H.toast(esc(j.message || 'Não consegui gerar.'));
        const url = location.origin + j.caminho; el.querySelector('#plink').innerHTML = `<div class="fields" style="margin-top:8px"><div class="f w4"><input class="inp mono" readonly value="${esc(url)}" id="purl"></div></div><button class="btn sm" id="pcp">Copiar link</button>`;
        el.querySelector('#pcp').onclick = () => { try { navigator.clipboard.writeText(url); H.toast('Link copiado'); } catch (e) {} };
      } catch (e) { H.toast('Não consegui gerar o link.'); }
    };
  };

  /* ---------- Aba "Comex & custo" na ficha da operação ---------- */
  H.fichaComex = function (box, o) {
    if (!H.ptax && H.pode('fin.ver')) H.carregarPtax();
    const ms = W.marcos(H.db, o), cont = Array.isArray(o.containers) ? o.containers : [];
    const c = H.pode('fin.resultado') ? W.custeioOp(H.db, o.id, { ptax: ptaxV() }) : null;
    const av = W.avisosTributarios(H.db, o.eta || hoje());
    box.innerHTML = `<div class="g2"><div class="box"><div class="box-h"><h2>Modalidade e empresa</h2><button class="btn blue sm" id="msalv">Salvar</button></div><div class="box-b fields">
        <div class="f"><label class="lbl" for="mmod">Modalidade</label><select id="mmod"><option value="">— definir —</option>${W.MODALIDADES.map(([k, l]) => `<option value="${k}" ${o.modalidade === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="f"><label class="lbl" for="memp">Importadora</label><select id="memp">${[['WindGate', 'SF Trading (AL)'], ['JeT', 'JeT Import (ES)']].map(([k, l]) => `<option value="${k}" ${(o.empresa || 'WindGate') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="f"><span class="lbl">Contrato</span><span class="ro">${W.contratoDaOp(H.db, o) ? pill('registrado', COR.ok) : ['conta e ordem', 'encomenda'].includes(o.modalidade) ? pill('falta', COR.vencido) : '—'}</span></div>
        ${av.length ? `<p class="note w4">${av.map(esc).join(' ')}</p>` : ''}</div></div>
      ${c ? `<div class="box"><div class="box-h"><h2>Custo e dólar</h2><button class="btn sm" id="vcust">Ver custeio</button></div><div class="box-b"><div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">${kpi('Margem projetada', pct(c.margemProjetada), 'prevista ' + pct(c.margemPrevista), c.margemProjetada != null && c.margemProjetada < 0.10 ? 'neg' : '')}${kpi('Desvio do custo', pct(c.desvio), W.fmtBRLk(c.projetado) + ' projetado', c.desvio > 0.05 ? 'neg' : '')}${kpi('US$ sem câmbio', usd(c.usdAberto), c.taxaPrevista ? 'prevista ' + n4(c.taxaPrevista) : '')}${kpi('PTAX hoje', n4(ptaxV()), c.impactoAberto ? (c.impactoAberto > 0 ? '+' : '') + W.fmtBRLk(c.impactoAberto) + ' no custo' : '', c.impactoAberto > 0 ? 'neg' : '')}</div></div></div>` : ''}</div>
      <div class="box"><div class="box-h"><h2>Marcos: planejado × real</h2><button class="btn blue sm" id="psalv">Salvar plano</button></div><div class="tw"><table><thead><tr><th>Etapa</th><th>Planejado</th><th>Real</th><th class="num">Desvio</th><th>Motivo do desvio</th></tr></thead><tbody>
        ${ms.map(x => `<tr><td>${esc(x.l)}</td><td><input type="date" class="inp" data-pl="${x.k}" value="${esc(x.plan || '')}"></td><td class="mono">${x.real ? W.dataBR(x.real) : x.passou ? '<span class="note">sem registro</span>' : '—'}</td><td class="num" style="color:${x.atraso > 0 ? COR.vencido : 'inherit'}">${x.atraso == null ? '—' : (x.atraso > 0 ? '+' : '') + x.atraso + ' d'}</td><td><input class="inp" data-mo="${x.k}" value="${esc(x.motivo)}" placeholder="${x.atraso > 0 ? 'por que atrasou?' : ''}"></td></tr>`).join('')}</tbody></table></div></div>
      <div class="box"><div class="box-h"><h2>Contêineres e free time</h2><span class="btns"><button class="btn sm" id="trk">Ligar tracking (ShipsGo)</button>${H.pode('docs.revisar') || H.pode('fin.ver') ? '<button class="btn sm" id="iadoc">Conferir documentos com IA</button>' : ''}</span></div>
        ${cont.length ? `<div class="tw"><table><thead><tr><th>Contêiner</th><th>Descarga</th><th>Limite</th><th>Situação</th><th></th></tr></thead><tbody>${cont.map((k, i) => { const r = W.relogioConteiner(H.db, k, hoje()), [t, cor] = ST_CONT[r.status]; return `<tr><td class="mono">${esc(k.numero)}</td><td class="mono">${W.dataBR(k.descarga)}</td><td class="mono">${W.dataBR(r.limite)}</td><td>${pill(t + (r.status === 'ok' ? ` · ${r.restantes} d` : r.excedidos ? ` · ${r.excedidos} d` : ''), cor)}</td><td class="num"><button class="btn ghost sm" data-ec="${i}">Atualizar</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">Cadastre os contêineres na aba Logística.</p>'}
        <div id="iares"></div></div>`;
    box.querySelector('#msalv').onclick = () => { const oa = opById(o.id); oa.modalidade = val(box, '#mmod'); oa.empresa = val(box, '#memp'); H.salvar(); H.toast('Salvo'); H.render(); };
    box.querySelector('#psalv').onclick = () => { const oa = opById(o.id); const pl = {}, mo = {}; box.querySelectorAll('[data-pl]').forEach(i => { if (i.value) pl[i.dataset.pl] = i.value; }); box.querySelectorAll('[data-mo]').forEach(i => { if (i.value.trim()) mo[i.dataset.mo] = i.value.trim(); }); oa.plano = pl; oa.planoMotivos = mo; H.salvar(); H.toast('Plano salvo'); H.render(); };
    const vc = box.querySelector('#vcust'); if (vc) vc.onclick = () => H.ir('custeio', o.id);
    box.querySelectorAll('[data-ec]').forEach(b => b.onclick = () => editarConteiner(o.id, +b.dataset.ec));
    box.querySelector('#trk').onclick = async () => { try { const r = await H.api('/api/tracking/criar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: o.id }) }); const j = await r.json(); H.toast(esc(j.success ? `Tracking ligado: ${j.rastreios.filter(x => !x.erro).length} de ${j.rastreios.length}` : j.message)); } catch (e) { H.toast('Não consegui ligar o tracking.'); } };
    const ia = box.querySelector('#iadoc'); if (ia) ia.onclick = async () => {
      const alvo = box.querySelector('#iares'); alvo.innerHTML = '<p class="note box-b">Lendo invoice, packing list e BL…</p>';
      try { const r = await H.api('/api/ia/conferir-docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: o.id }) }); const j = await r.json();
        if (!j.success) { alvo.innerHTML = `<p class="banner">${esc(j.message)}</p>`; return; }
        alvo.innerHTML = `<div class="box-b"><p><b>${j.lidos} documento(s) lido(s).</b> ${j.divergencias.length ? j.divergencias.length + ' divergência(s):' : 'Nenhuma divergência entre os documentos.'}</p>${j.divergencias.map(d => `<div class="row"><div>${pill(d.gravidade || 'media', d.gravidade === 'alta' ? COR.vencido : COR.atencao)} <b>${esc(d.campo)}</b>: ${esc((d.valores || []).join(' × '))}<br><small class="note">${esc((d.entre || []).join(' × '))} · ${esc(d.explicacao || '')}</small></div></div>`).join('')}${(j.alertas || []).map(a => `<p class="note">${esc(a)}</p>`).join('')}<p class="note">A IA aponta; aprovar ou rejeitar continua com a dupla conferência.</p></div>`;
      } catch (e) { alvo.innerHTML = '<p class="banner">Não consegui conferir agora.</p>'; }
    };
  };
})();
