/* Hub 2.0 — Dashboards: Saúde financeira e Desempenho das operações.
   Gráficos em SVG próprio (sem biblioteca), gerados dos mesmos dados do Financeiro
   e das operações; nada é digitado à mão. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  let empresa = 'todas';
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const rot = m => MES[+m.slice(5, 7) - 1] + '/' + m.slice(2, 4);
  const pct = v => v == null ? '—' : (v * 100).toFixed(0) + '%';
  const k = v => { const n = Math.abs(v); return (v < 0 ? '−' : '') + (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' mi' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : Math.round(n)); };

  /** Barras agrupadas por período, com linha de zero quando há negativos. */
  function barras(labels, series, opt) {
    const o = Object.assign({ w: 640, h: 220, fmt: k }, opt), pad = { l: 52, r: 12, t: 14, b: 28 };
    series = series.map(s => Object.assign({}, s, { valores: s.valores.map(v => v == null || !isFinite(v) ? null : +v) }));
    const vals = series.flatMap(s => s.valores.filter(v => v != null));
    const max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = (max - min) || 1;
    const iw = o.w - pad.l - pad.r, ih = o.h - pad.t - pad.b, gw = iw / labels.length, bw = Math.max(3, Math.min(22, (gw - 6) / series.length));
    const Y = v => pad.t + (max - v) / span * ih;
    const ticks = [max, (max + min) / 2, min].filter((v, i, a) => a.indexOf(v) === i);
    return `<svg viewBox="0 0 ${o.w} ${o.h}" class="ch" role="img" aria-label="${esc(o.titulo || '')}">
      ${ticks.map(t => `<line x1="${pad.l}" x2="${o.w - pad.r}" y1="${Y(t)}" y2="${Y(t)}" class="ch-grid"/><text x="${pad.l - 6}" y="${Y(t) + 4}" text-anchor="end" class="ch-t">${o.fmt(t)}</text>`).join('')}
      ${min < 0 ? `<line x1="${pad.l}" x2="${o.w - pad.r}" y1="${Y(0)}" y2="${Y(0)}" class="ch-zero"/>` : ''}
      ${labels.map((l, i) => series.map((s, j) => { const v = s.valores[i]; if (v == null) return ''; const x = pad.l + i * gw + (gw - bw * series.length) / 2 + j * bw, y = Y(Math.max(v, 0)), hh = Math.abs(Y(v) - Y(0));
        return `<rect x="${x}" y="${y}" width="${bw - 1}" height="${Math.max(hh, .5)}" rx="2" fill="${v < 0 && s.neg ? s.neg : s.cor}"><title>${esc(s.nome)} · ${esc(l)}: ${o.fmt(v)}</title></rect>`; }).join('') + `<text x="${pad.l + i * gw + gw / 2}" y="${o.h - 8}" text-anchor="middle" class="ch-t">${esc(l)}</text>`).join('')}
    </svg>${series.length > 1 ? `<div class="ch-leg">${series.map(s => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join('')}</div>` : ''}`;
  }
  /** Linha com área, para saldos ao longo do tempo. */
  function linha(labels, valores, opt) {
    const o = Object.assign({ w: 640, h: 200, fmt: k, cor: 'var(--blue)' }, opt), pad = { l: 52, r: 12, t: 14, b: 28 };
    const max = Math.max(0, ...valores), min = Math.min(0, ...valores), span = (max - min) || 1;
    const iw = o.w - pad.l - pad.r, ih = o.h - pad.t - pad.b, X = i => pad.l + (labels.length > 1 ? i / (labels.length - 1) : .5) * iw, Y = v => pad.t + (max - v) / span * ih;
    const pts = valores.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
    return `<svg viewBox="0 0 ${o.w} ${o.h}" class="ch" role="img" aria-label="${esc(o.titulo || '')}">
      ${[max, min].map(t => `<line x1="${pad.l}" x2="${o.w - pad.r}" y1="${Y(t)}" y2="${Y(t)}" class="ch-grid"/><text x="${pad.l - 6}" y="${Y(t) + 4}" text-anchor="end" class="ch-t">${o.fmt(t)}</text>`).join('')}
      ${min < 0 ? `<line x1="${pad.l}" x2="${o.w - pad.r}" y1="${Y(0)}" y2="${Y(0)}" class="ch-zero"/>` : ''}
      <polygon points="${X(0)},${Y(Math.max(min, 0))} ${pts} ${X(valores.length - 1)},${Y(Math.max(min, 0))}" fill="${o.cor}" fill-opacity=".08"/>
      <polyline points="${pts}" fill="none" stroke="${o.cor}" stroke-width="2"/>
      ${valores.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="${i === valores.length - 1 ? 4 : 2.5}" fill="${v < 0 ? 'var(--crit)' : o.cor}"><title>${esc(labels[i])}: ${o.fmt(v)}</title></circle>`).join('')}
      ${labels.map((l, i) => i % Math.ceil(labels.length / 7) === 0 || i === labels.length - 1 ? `<text x="${X(i)}" y="${o.h - 8}" text-anchor="middle" class="ch-t">${esc(l)}</text>` : '').join('')}
    </svg>`;
  }
  H.grafico = { barras, linha };
  const kpi = (lbl, v, d, cls) => `<div class="kpi"><span class="lbl">${lbl}</span><span class="v">${v}</span><span class="d ${cls || ''}">${d}</span></div>`;

  /* ================= SAÚDE FINANCEIRA ================= */
  H.telas.dashfin = function (el) {
    if (!H.pode('fin.ver')) { el.innerHTML = '<div class="banner">Acesso restrito ao Financeiro.</div>'; return; }
    const db = H.db, hoje = W.hojeISO(), s = W.saudeFinanceira(db, hoje, empresa);
    const pm = s.porMes, ext = (db.hubExtratos || []).filter(e => e && e.saldo != null).sort((a, b) => String(b.mes).localeCompare(String(a.mes)));
    const saldoBanco = ext.length ? ext.filter(e => e.mes === ext[0].mes).reduce((a, e) => a + (+e.saldo || 0), 0) : null;
    // A primeira faixa reúne o que já venceu e não foi baixado; entra no ponto de partida.
    const proj = s.projecao.filter(p => !p.vencido), venc = s.projecao.find(p => p.vencido) || { entra: 0, sai: 0 }; let acum = s.caixa + venc.entra - venc.sai; const projVals = proj.map(p => (acum += p.entra - p.sai));
    const ultimos3 = pm.slice(-3), margem3 = ultimos3.filter(m => m.margem != null), mediaMargem = margem3.length ? margem3.reduce((a, m) => a + m.margem, 0) / margem3.length : null;
    el.innerHTML = `
      <div class="head"><div><h1>Saúde financeira</h1><p class="sub">Atualiza sozinho com o Financeiro. Competência pelo vencimento; transferências entre SF e JeT fora do resultado.</p></div>
        <div class="btns"><div class="seg">${[['todas', 'SF + JeT'], ['WindGate', 'SF'], ['JeT', 'JeT']].map(([a, b]) => `<button data-emp="${a}" class="${empresa === a ? 'on' : ''}">${b}</button>`).join('')}</div></div></div>
      <div class="kpis">
        ${kpi('Caixa pelo sistema', W.fmtBRLk(s.caixa), saldoBanco != null ? 'banco (último extrato): ' + W.fmtBRLk(saldoBanco) : 'recebido − pago, todos os meses', s.caixa < 0 ? 'bad' : '')}
        ${kpi('Resultado 12 meses', W.fmtBRLk(s.resultado12), 'receita ' + W.fmtBRLk(s.receita12), s.resultado12 < 0 ? 'bad' : 'good')}
        ${kpi('Margem bruta (3 meses)', pct(mediaMargem), 'receita − custos da operação − impostos')}
        ${kpi('A receber', W.fmtBRLk(s.totalReceber), pct(s.inadimplencia) + ' vencido', s.inadimplencia > .15 ? 'bad' : '')}
        ${kpi('Fôlego de caixa', s.folego == null ? '—' : s.folego.toFixed(1).replace('.', ',') + ' meses', 'caixa ÷ despesas fixas (' + W.fmtBRLk(s.fixasMes) + '/mês)', s.folego != null && s.folego < 3 ? 'bad' : '')}
        ${kpi('Concentração', pct(s.concentracaoTop5), 'da receita nos 5 maiores clientes', s.concentracaoTop5 > .7 ? 'bad' : '')}</div>
      <div class="g2">
        <div class="box"><div class="box-h"><h2>Receita, custos e resultado · 12 meses</h2></div><div class="box-b">${barras(pm.map(m => rot(m.mes)), [{ nome: 'Receita', valores: pm.map(m => m.receita), cor: 'var(--blue)' }, { nome: 'Custos + impostos', valores: pm.map(m => m.custos), cor: 'var(--cds-c2, #9AA5B8)' }, { nome: 'Resultado líquido', valores: pm.map(m => m.resultado), cor: 'var(--ok)', neg: 'var(--crit)' }], { titulo: 'Receita, custos e resultado por mês' })}</div></div>
        <div class="box"><div class="box-h"><h2>Caixa projetado · 13 semanas</h2><span class="note">com o que já está lançado</span></div><div class="box-b">${linha(proj.map(p => W.dataBR(p.de).slice(0, 5)), projVals, { titulo: 'Caixa projetado por semana', cor: 'var(--blue)' })}
          ${projVals.some(v => v < 0) ? `<p class="banner" style="margin-top:8px">O caixa fica negativo na semana de ${W.dataBR(proj[projVals.findIndex(v => v < 0)].de)}. Antecipe recebimentos ou reprograme pagamentos.</p>` : ''}</div></div>
        <div class="box"><div class="box-h"><h2>Contas a receber por atraso</h2></div><div class="box-b">${barras(['A vencer', '1–30 dias', '31–60 dias', '+60 dias'], [{ nome: 'Valor', valores: [s.aging.aVencer, s.aging.d30, s.aging.d60, s.aging.d60mais], cor: 'var(--blue)' }], { h: 180, titulo: 'Contas a receber por faixa de atraso' })}
          <p class="note">Atraso médio de recebimento: ${s.atrasoMedio == null ? '—' : s.atrasoMedio.toFixed(0) + ' dias'} após o vencimento.</p></div></div>
        <div class="box"><div class="box-h"><h2>Entradas e saídas previstas</h2></div><div class="box-b"><table class="mini"><thead><tr><th></th><th class="num">30 dias</th><th class="num">60 dias</th><th class="num">90 dias</th></tr></thead><tbody>
          <tr><td>A receber</td>${s.receber.map(v => `<td class="num">${W.fmtBRLk(v)}</td>`).join('')}</tr><tr><td>A pagar</td>${s.pagar.map(v => `<td class="num">${W.fmtBRLk(v)}</td>`).join('')}</tr>
          <tr><td><b>Saldo</b></td>${s.receber.map((v, i) => `<td class="num" style="color:var(${v - s.pagar[i] < 0 ? '--crit' : '--ok'})"><b>${W.fmtBRLk(v - s.pagar[i])}</b></td>`).join('')}</tr>
          <tr><td>Carga tributária (12 m)</td><td class="num" colspan="3">${pct(s.cargaTributaria)} da receita</td></tr><tr><td>Empréstimos em aberto</td><td class="num" colspan="3">${W.fmtBRL(s.emprestimos)}</td></tr></tbody></table></div></div>
        <div class="box"><div class="box-h"><h2>Maiores clientes · 12 meses</h2></div><div class="box-b"><table class="mini"><tbody>${s.top.map(t => `<tr><td>${esc(t.cliente)}</td><td class="num">${W.fmtBRLk(t.v)}</td><td style="width:40%"><span class="barra"><i style="width:${(t.pct * 100).toFixed(0)}%"></i></span></td><td class="num">${pct(t.pct)}</td></tr>`).join('') || '<tr><td class="empty">Sem receita por operação nos últimos 12 meses.</td></tr>'}</tbody></table></div></div>
        <div class="box"><div class="box-h"><h2>Margem bruta por mês</h2></div><div class="box-b">${barras(pm.map(m => rot(m.mes)), [{ nome: 'Margem', valores: pm.map(m => m.margem == null ? null : m.margem * 100), cor: 'var(--mag)', neg: 'var(--crit)' }], { h: 180, fmt: v => Math.round(v) + '%', titulo: 'Margem bruta por mês' })}</div></div>
      </div>
      <p class="note">Como ler: fôlego abaixo de 3 meses, inadimplência acima de 15% ou mais de 70% da receita em 5 clientes acendem o alerta. Lucro por sócio na DRE (Painel & DRE), dividido por 2.</p>`;
    el.querySelectorAll('[data-emp]').forEach(b => b.onclick = () => { empresa = b.dataset.emp; H.render(); });
  };

  /* ================= DESEMPENHO DAS OPERAÇÕES ================= */
  H.telas.dashops = function (el) {
    const db = H.db, hoje = W.hojeISO(), d = W.desempenhoOperacoes(db, hoje), crm = W.indicadoresCrm(db, hoje, 90);
    const finVer = H.pode('fin.resultado');
    el.innerHTML = `
      <div class="head"><div><h1>Desempenho da empresa</h1><p class="sub">Operações, prazos e vendas, calculados do que a equipe registra no sistema. Visível para toda a equipe.</p></div></div>
      <div class="kpis">
        ${kpi('Operações ativas', d.ativas, d.clientes + ' clientes ativos')}
        ${kpi('Dentro do prazo agora', pct(d.noPrazoAgora), 'etapas no prazo-alvo', d.noPrazoAgora != null && d.noPrazoAgora < .7 ? 'bad' : 'good')}
        ${kpi('Novas · 12 meses', d.novas.reduce((a, b) => a + b, 0), 'entregues: ' + d.entregues.reduce((a, b) => a + b, 0))}
        ${kpi('Conversão de vendas', pct(crm.conversao), '90 dias · ' + crm.ganhos + ' ganho(s)')}
        ${kpi('Ciclo de venda', crm.ciclo == null ? '—' : crm.ciclo + ' d', 'do lead ao contrato')}
        ${finVer ? kpi('Margem média', pct(d.margemMedia), 'ticket ' + (d.ticketMedio == null ? '—' : W.fmtBRLk(d.ticketMedio))) : kpi('Negócios abertos', crm.abertos, crm.parados.length + ' parado(s)')}</div>
      <div class="g2">
        <div class="box"><div class="box-h"><h2>Operações novas e entregues · 12 meses</h2></div><div class="box-b">${barras(d.meses.map(rot), [{ nome: 'Novas', valores: d.novas, cor: 'var(--blue)' }, { nome: 'Entregues', valores: d.entregues, cor: 'var(--ok)' }], { fmt: v => Math.round(v), titulo: 'Operações novas e entregues por mês' })}</div></div>
        <div class="box"><div class="box-h"><h2>Tempo médio por etapa × prazo-alvo</h2><span class="note">dias</span></div><div class="box-b"><table class="mini"><thead><tr><th>Etapa</th><th class="num">Média</th><th class="num">Alvo</th><th style="width:38%"></th><th class="num">No prazo</th></tr></thead><tbody>
          ${d.etapas.map(e => `<tr><td>${esc(e.l)}</td><td class="num">${e.media == null ? '—' : e.media.toFixed(0)}</td><td class="num">${e.alvo || '—'}</td><td>${e.media != null && e.alvo ? `<span class="barra"><i style="width:${Math.min(100, e.media / e.alvo * 100)}%;background:${e.media > e.alvo ? 'var(--crit)' : 'var(--ok)'}"></i></span>` : ''}</td><td class="num">${pct(e.noPrazo)}${e.n ? ` <small class="note">(${e.n})</small>` : ''}</td></tr>`).join('')}</tbody></table>
          <p class="note">Calculado das mudanças de etapa registradas. Etapa sem histórico ainda mostra “—”.</p></div></div>
        <div class="box"><div class="box-h"><h2>Funil de vendas agora</h2></div><div class="box-b"><table class="mini"><tbody>${W.CRM_FASES.filter(f => W.CRM_ABERTAS.includes(f.k)).map(f => { const n = (db.crmOps || []).filter(x => x && W.faseDe(x) === f.k).length, max = Math.max(1, ...W.CRM_ABERTAS.map(k2 => (db.crmOps || []).filter(x => x && W.faseDe(x) === k2).length));
          return `<tr><td>${esc(f.l)}</td><td style="width:55%"><span class="barra"><i style="width:${n / max * 100}%;background:${f.c}"></i></span></td><td class="num">${n}</td></tr>`; }).join('')}</tbody></table></div></div>
        <div class="box"><div class="box-h"><h2>Operações por etapa</h2></div><div class="box-b"><table class="mini"><tbody>${W.STATUS_OP.filter(s => !W.FINALIZADAS.includes(s.k)).map(s => { const n = db.ops.filter(o => o && o.status === s.k).length; return `<tr><td>${esc(s.l)}</td><td style="width:55%"><span class="barra"><i style="width:${Math.min(100, n / Math.max(1, d.ativas) * 100)}%;background:${s.c}"></i></span></td><td class="num">${n}</td></tr>`; }).join('')}</tbody></table></div></div>
      </div>`;
  };
})();
