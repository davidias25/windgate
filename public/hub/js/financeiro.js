/* Hub 2.0 — Financeiro em 3 telas (Parte 3 do prompt de 18/11): Carteira · Caixa do mês · Indicadores.
   Os números saem de fin-regras.js (carteiraOps, caixaDoMes, indicadoresGestao): a mesma conta da Torre.
   As telas antigas (Saúde financeira, Painel & DRE, Resultado por operação) continuam em "Detalhe". */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  const S = { aba: 'carteira', filtro: 'andamento', abertas: {} };
  const brl = v => W.fmtBRL(+v || 0), k = v => (v == null ? '—' : W.fmtBRLk ? W.fmtBRLk(v) : brl(v));
  const pct = (v, c) => (v == null ? '—' : (v * 100).toFixed(c == null ? 1 : c).replace('.', ',') + '%');
  const COR = { vermelho: 'var(--crit)', ambar: 'var(--warn)', verde: 'var(--ok)', neutro: 'var(--ink)' };
  const ABAS = [['carteira', 'Carteira'], ['caixa', 'Caixa do mês'], ['indicadores', 'Indicadores']];
  const DETALHE = [['dashfin', 'Saúde financeira'], ['fin', 'Painel & DRE'], ['resop', 'Resultado por operação'], ['contas', 'Contas a pagar e receber'], ['lanc', 'Lançamentos']];
  const emp = () => (H.finEmpresa ? H.finEmpresa() : 'todas');
  const kpi = (l, v, d, cor, ir) => `<button class="kpi" ${ir ? `data-ir="${esc(ir)}"` : 'disabled'} style="cursor:${ir ? 'pointer' : 'default'}"><span class="lbl">${esc(l)}</span><span class="v" style="color:${cor || 'var(--ink)'}">${v}</span><span class="d">${d || ''}</span></button>`;

  H.telas.financeiro = function (el, aba) {
    if (!H.podeFin()) { el.innerHTML = '<div class="banner">Acesso restrito: Samir, Davi e Matheus.</div>'; return; }
    if (aba && ABAS.some(a => a[0] === aba)) S.aba = aba;
    const t = ABAS.find(a => a[0] === S.aba)[1];
    el.innerHTML = `<div class="head"><div><h1>Financeiro · ${esc(t)}</h1><p class="sub">${S.aba === 'carteira' ? 'Quanto as operações fechadas vão lucrar, quanto já está em caixa e quanto falta' : S.aba === 'caixa' ? 'Dinheiro real hoje e o que entra e sai até o fim do mês' : 'A empresa está crescendo com saúde?'}</p></div>
      <div class="btns"><div class="seg">${[['todas', 'SF + JeT'], ['WindGate', 'SF'], ['JeT', 'JeT']].map(([v, l]) => `<button data-emp="${v}" class="${emp() === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <select class="inp" id="fdet" aria-label="Detalhe"><option value="">Detalhe ▾</option>${DETALHE.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div></div>
      <div class="tabs" role="tablist" style="margin-bottom:14px">${ABAS.map(([v, l]) => `<button role="tab" data-aba="${v}" aria-selected="${S.aba === v}">${esc(l)}</button>`).join('')}</div>
      <div id="fcorpo"></div>`;
    el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { S.aba = b.dataset.aba; H.render(); });
    el.querySelectorAll('[data-emp]').forEach(b => b.onclick = () => { if (H.setFinEmpresa) H.setFinEmpresa(b.dataset.emp); H.render(); });
    el.querySelector('#fdet').onchange = e => { if (e.target.value) H.ir(e.target.value); };
    const corpo = el.querySelector('#fcorpo');
    if (S.aba === 'carteira') carteira(corpo); else if (S.aba === 'caixa') caixa(corpo); else indicadores(corpo);
    corpo.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => { const [a, p] = b.dataset.ir.split('|'); if (a === 'vencidos') return H.lancVencidos && H.lancVencidos(); if (a === 'aba') { S.aba = p; return H.render(); } H.ir(a, p); });
  };

  /* ---------------- Carteira ---------------- */
  function carteira(el) {
    const c = W.carteiraOps(H.db, emp(), S.filtro, W.hojeISO()), T = c.total, max = Math.max(1, ...c.linhas.map(l => Math.max(0, l.lucro)));
    const nomeOp = l => `${l.mae ? `<button class="btn ghost sm" data-abre="${esc(l.op)}" aria-label="Abrir clientes" style="padding:0 6px">${S.abertas[l.op] ? '▾' : '▸'}</button> ` : ''}<b class="mono">${esc(l.op)}</b>${l.cliente ? ' · ' + esc(l.cliente) : ''}`;
    const barra = l => { const w = Math.max(2, Math.max(0, l.lucro) / max * 100), dentro = l.lucro > 0 ? Math.min(100, Math.max(0, l.caixa) / l.lucro * 100) : 0;
      return `<div style="display:flex;gap:12px;align-items:center;padding:4px 0"><div style="width:240px;font-size:13px">${nomeOp(l)}<div class="note">${esc(W.stMeta(l.status).l || '')}${l.filhas ? ' · ' + l.filhas.length + ' clientes' : ''}</div></div>
        <div style="flex:1"><div style="width:${w}%;height:16px;border-radius:4px;background:#9DB4DD;overflow:hidden"><div style="width:${dentro}%;height:100%;background:var(--blue)"></div></div></div>
        <div class="num" style="width:96px;text-align:right;font-weight:700">${k(l.lucro)}</div><div class="num" style="width:60px;text-align:right;font-weight:700;color:${l.abaixo ? 'var(--crit)' : 'var(--ink)'}">${pct(l.margem)}</div></div>`; };
    const linhaT = (l, filha) => `<tr class="click" data-op="${esc(l.op)}"><td>${filha ? '&nbsp;&nbsp;&nbsp;↳ ' : ''}${filha ? `<b class="mono">${esc(l.op)}</b> · ${esc(l.cliente)}` : nomeOp(l)}</td><td>${l.status ? H.pillStatus(l.status) : ''}</td>
      ${['receita', 'custo', 'lucro'].map(x => `<td class="num">${brl(l[x])}</td>`).join('')}<td class="num" style="color:${l.abaixo ? 'var(--crit)' : ''}">${pct(l.margem)}</td>
      <td class="num">${brl(l.recebido)}</td><td class="num">${brl(l.pago)}</td><td class="num">${brl(l.faltaReceber)}</td><td class="num">${brl(l.faltaPagar)}</td>
      <td class="num" style="font-weight:700;color:${l.lucroRealizar < 0 ? 'var(--crit)' : 'var(--ink)'}">${brl(l.lucroRealizar)}</td>
      <td>${l.proximo ? `${W.dataBR(l.proximo.data)} · ${l.proximo.receber ? 'receber' : 'pagar'} ${k(l.proximo.valor)}${l.proximo.vencido ? ' <span class="pill crit">vencido</span>' : ''}` : '<span class="note">—</span>'}</td></tr>`;
    const top = c.linhas.slice(0, 8), resto = c.linhas.slice(8);
    el.innerHTML = `<div class="btns" style="margin-bottom:10px"><div class="seg">${[['andamento', 'Em andamento'], ['mes', 'Concluídas no mês'], ['todas', 'Todas']].map(([v, l]) => `<button data-filtro="${v}" class="${S.filtro === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="kpis" style="grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:14px">
        ${kpi('Lucro previsto', k(T.lucro), `${T.n} operação(ões) · margem ${pct(T.margem)} s/ receita`)}
        ${kpi('Lucro garantido', k(T.garantido), 'custos 100% pagos', 'var(--ok)')}
        ${kpi('Lucro a realizar', k(T.lucroRealizar), `falta receber ${k(T.faltaReceber)} − falta pagar ${k(T.faltaPagar)}`)}
        ${kpi('Já está em caixa', k(T.caixa), 'recebido − pago · inclui adiantamento (não é lucro)', 'var(--blue)')}
        ${kpi('Abaixo do mínimo', String(c.abaixo.length), c.abaixo.slice(0, 3).map(x => `${x.op} ${pct(x.margem)}`).join(' · ') || 'margem ≥ 10% e FCL ≥ R$ 30 mil', c.abaixo.length ? 'var(--crit)' : 'var(--ok)')}</div>
      <div class="box" style="margin-bottom:14px"><div class="box-h"><h2>Lucro por operação</h2><span class="note"><span style="color:var(--blue)">■</span> já em caixa · <span style="color:#9DB4DD">■</span> a realizar · margem s/ receita</span></div><div class="box-b">
        ${top.map(barra).join('') || '<p class="empty">Nenhuma operação neste filtro.</p>'}
        ${resto.length ? `<p class="note">+ ${resto.map(l => esc(l.op)).join(', ')} · ${k(resto.reduce((a, l) => a + l.lucro, 0))} somados</p>` : ''}
        <p class="note">▸ contêiner compartilhado: uma linha com o total; clique abre os clientes.</p></div></div>
      <div class="box"><div class="box-h"><h2>Detalhe por operação</h2><span class="note">R$</span></div><div class="tw"><table><thead><tr><th>Operação</th><th>Etapa</th><th class="num">Receita</th><th class="num">Custo</th><th class="num">Lucro</th><th class="num">Margem</th><th class="num">Recebido</th><th class="num">Pago</th><th class="num">Falta receber</th><th class="num">Falta pagar</th><th class="num">Lucro a realizar</th><th>Próximo evento</th></tr></thead><tbody>
        ${c.linhas.map(l => linhaT(l) + (l.filhas && S.abertas[l.op] ? l.filhas.map(f => linhaT(f, true)).join('') : '')).join('')}</tbody>
        <tfoot><tr><td colspan="2">Total (${T.n})</td><td class="num">${brl(T.receita)}</td><td class="num">${brl(T.custo)}</td><td class="num">${brl(T.lucro)}</td><td class="num">${pct(T.margem)}</td><td></td><td></td><td class="num">${brl(T.faltaReceber)}</td><td class="num">${brl(T.faltaPagar)}</td><td class="num">${brl(T.lucroRealizar)}</td><td></td></tr></tfoot></table></div>
        <p class="note box-b">Lucro a realizar negativo = o cliente já adiantou mais do que a operação lucra; esse dinheiro ainda vai sair para fábrica, frete e impostos.</p></div>`;
    el.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { S.filtro = b.dataset.filtro; H.render(); });
    el.querySelectorAll('[data-abre]').forEach(b => b.onclick = e => { e.stopPropagation(); S.abertas[b.dataset.abre] = !S.abertas[b.dataset.abre]; H.render(); });
    el.querySelectorAll('tr[data-op]').forEach(tr => tr.onclick = () => H.ir('ficha', tr.dataset.op));
  }

  /* ---------------- Caixa do mês ---------------- */
  function grafico(c) {
    const Wd = 1100, Ht = 260, x0 = 50, y0 = 20, y1 = Ht - 30, n = c.serie.length;
    const vals = c.serie.map(p => p.saldo).concat([c.minimo, 0]), semMax = Math.max(1, ...c.semanas.map(s => Math.max(s.entra, s.sai)));
    const lo = Math.min(...vals), hi = Math.max(...vals), Y = v => y1 - (v - lo) / ((hi - lo) || 1) * (y1 - y0), X = i => x0 + i / Math.max(1, n - 1) * (Wd - x0 - 10);
    const bw = (Wd - x0) / Math.max(1, c.semanas.length) / 3, B = v => v / semMax * 60;
    const iCruza = c.cruzaMinimo ? c.serie.findIndex(p => p.data === c.cruzaMinimo) : -1;
    return `<svg viewBox="0 0 ${Wd} ${Ht}" width="100%" role="img" aria-label="Caixa projetado dia a dia até o fim do mês seguinte">
      <line x1="${x0}" y1="${Y(c.minimo)}" x2="${Wd}" y2="${Y(c.minimo)}" stroke="var(--warn)" stroke-dasharray="6 5"/><text x="${x0 + 4}" y="${Y(c.minimo) - 5}" font-size="11" fill="var(--warn)">mínimo ${esc(k(c.minimo))}</text>
      <line x1="${x0}" y1="${Y(0)}" x2="${Wd}" y2="${Y(0)}" stroke="var(--line-2)"/>
      ${c.semanas.map((s, i) => { const xi = X(c.serie.findIndex(p => p.data === s.de)); return `<rect x="${xi}" y="${y1 - B(s.entra)}" width="${bw}" height="${B(s.entra)}" fill="#7CC39A"><title>${W.dataBR(s.de)}: entra ${esc(brl(s.entra))}</title></rect><rect x="${xi + bw + 2}" y="${y1 - B(s.sai)}" width="${bw}" height="${B(s.sai)}" fill="#E8A29C"><title>${W.dataBR(s.de)}: sai ${esc(brl(s.sai))}</title></rect><text x="${xi + bw}" y="${Ht - 10}" font-size="11" fill="var(--muted)" text-anchor="middle">${W.dataBR(s.de).slice(0, 5)}</text>`; }).join('')}
      <polyline points="${c.serie.map((p, i) => X(i) + ',' + Y(p.saldo)).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="2.5"/>
      ${iCruza >= 0 ? `<circle cx="${X(iCruza)}" cy="${Y(c.serie[iCruza].saldo)}" r="6" fill="var(--crit)"/><text x="${X(iCruza) + 8}" y="${Y(c.serie[iCruza].saldo) + 16}" font-size="12" fill="var(--crit)" font-weight="700">${W.dataBR(c.cruzaMinimo).slice(0, 5)}: abaixo do mínimo</text>` : ''}</svg>`;
  }
  function caixa(el) {
    const c = W.caixaDoMes(H.db, emp(), W.hojeISO()), cx = c.caixa;
    const datas = cx.contas.map(x => `${x.empresa === 'JeT' ? 'JeT' : 'SF'} ${x.banco || x.nome || ''} ${W.dataBR(x.data).slice(0, 5)}`).join(' · ');
    const tipo = l => (W.daOperacao(l) ? 'operação' : 'fixa');
    const barra = (r, s, cor) => `<div style="display:flex;flex-direction:column;gap:5px;padding:4px 0"><div style="display:flex;justify-content:space-between"><b style="font-size:13px">${r}</b><span class="note">${k(s.pago)} de ${k(s.total)}</span></div><div style="height:8px;border-radius:99px;background:var(--surface-2);overflow:hidden"><i style="display:block;height:100%;width:${s.total ? Math.min(100, s.pago / s.total * 100) : 0}%;background:${cor}"></i></div></div>`;
    el.innerHTML = `<div class="kpis" style="margin-bottom:14px">
        ${kpi('Caixa hoje', cx.temExtrato ? k(cx.total) : '—', cx.temExtrato ? esc(datas) + (c.distorcido ? ' · <b style="color:var(--warn)">pode estar distorcido</b>' : '') : 'sem extrato: lance em Fiscal & Contabilidade', null, 'fiscal')}
        ${kpi('+ A receber', k(c.receber), `até ${W.dataBR(c.fim).slice(0, 5)}${c.receberVencido ? ' · ' + k(c.receberVencido) + ' vencido' : ''}`, 'var(--ok)', 'contas')}
        ${kpi('− Pagar operações', k(c.pagarOps), 'fábrica, frete, impostos, porto', 'var(--crit)', 'contas')}
        ${kpi('− Pagar fixas', k(c.pagarFixas), 'folha, aluguel, sistemas, contabilidade', 'var(--crit)', 'contas')}
        ${kpi('= Fim do mês', k(c.fimMes), c.abaixoMinimo ? `abaixo do mínimo ${k(c.minimo)}` : `mínimo ${k(c.minimo)}`, c.abaixoMinimo ? 'var(--crit)' : 'var(--ok)')}
        ${kpi('Vencidos sem baixa', String(c.vencidos.n), `${k(c.vencidos.valor)} · distorce o caixa`, c.vencidos.n ? 'var(--warn)' : 'var(--ok)', 'vencidos')}</div>
      ${c.vencidos.n ? `<div class="banner" style="display:flex;gap:12px;align-items:center;margin-bottom:14px"><div style="flex:1"><b>${c.vencidos.pagamentos} pagamento(s) e ${c.vencidos.recebimentos} recebimento(s) vencidos sem baixa · ${esc(brl(c.vencidos.valor))}</b><br><span class="note">Enquanto não forem baixados ou remarcados, o caixa previsto pode estar errado.</span></div><button class="btn pri" data-ir="vencidos">Conferir agora</button></div>` : ''}
      <div class="box" style="margin-bottom:14px"><div class="box-h"><h2>Caixa projetado</h2><span class="note">linha = saldo dia a dia até ${W.dataBR(c.serie[c.serie.length - 1].data)} · verde entradas · vermelho saídas por semana${c.cruzaMinimo ? ' · <b style="color:var(--crit)">cruza o mínimo em ' + W.dataBR(c.cruzaMinimo) + '</b>' : ''}</span></div><div class="box-b">${grafico(c)}</div></div>
      <div class="g2"><div class="box"><div class="box-h"><h2>Próximos 7 dias</h2><button class="btn ghost sm" data-ir="contas">ver todas →</button></div><div class="tw"><table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${c.proximos7.map(l => `<tr><td>${W.dataBR(W.vencDe(l)).slice(0, 5)}</td><td>${esc(((l.op && l.op !== 'WindGate') ? l.op + ' · ' : '') + (l.descCliente || l.desc || ''))}</td><td><span class="pill">${tipo(l)}</span></td>
          <td class="num" style="font-weight:700;color:${W.ehReceita(l) ? 'var(--ok)' : 'var(--crit)'}">${W.ehReceita(l) ? '+' : '−'} ${brl(l.valor)}</td><td>${H.pode('fin.lancar') ? `<button class="btn ghost sm" data-baixa="${esc(l._id)}">Dar baixa</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="note">Nada vence nos próximos 7 dias.</td></tr>'}</tbody></table></div>
        ${c.nProximos7 > c.proximos7.length ? `<p class="note box-b">+ ${c.nProximos7 - c.proximos7.length} lançamento(s)</p>` : ''}</div>
        <div class="box"><div class="box-h"><h2>Saídas do mês por tipo</h2><span class="note">quanto já saiu</span></div><div class="box-b">${barra('Operações · fábrica, frete, impostos', c.saidasMes.operacoes, 'var(--crit)')}${barra('Fixas · folha, aluguel, sistemas', c.saidasMes.fixas, 'var(--warn)')}</div></div></div>`;
    el.querySelectorAll('[data-baixa]').forEach(b => b.onclick = () => { const l = H.db.fin.find(x => x && x._id === b.dataset.baixa); if (l && H.darBaixa) H.darBaixa(l); });
  }

  /* ---------------- Indicadores ---------------- */
  const valorCard = c => (c.v == null ? '—' : c.tipo === 'brl' ? k(c.v) : c.tipo === 'pct' ? pct(c.v) : c.tipo === 'pctSinal' ? (c.v >= 0 ? '+' : '') + pct(c.v) : c.tipo === 'dias' ? c.v + ' dias' : String(c.v));
  function barras(titulo, itens, linha, fmtV) {
    const Wd = 420, Ht = 200, x0 = 8, n = Math.max(1, itens.length), bw = (Wd - x0) / n;
    const vals = itens.flatMap(i => i.vals.map(v => Math.abs(v || 0))).concat(linha != null ? [linha] : []), mx = Math.max(1e-9, ...vals);
    const Y = v => Ht - 24 - (v / mx) * (Ht - 44);
    return `<div class="box"><div class="box-h"><h2>${esc(titulo)}</h2></div><div class="box-b"><svg viewBox="0 0 ${Wd} ${Ht}" width="100%" role="img" aria-label="${esc(titulo)}">
      ${itens.map((it, i) => it.vals.map((v, j) => { const w = (bw - 6) / it.vals.length, x = x0 + i * bw + j * w; return v == null ? '' : `<rect x="${x}" y="${Y(Math.max(0, v))}" width="${w - 1}" height="${Math.max(0, Ht - 24 - Y(Math.max(0, v)))}" fill="${it.cores[j]}"><title>${esc(it.rot)}: ${esc(fmtV(v))}</title></rect>`; }).join('') + `<text x="${x0 + i * bw + bw / 2}" y="${Ht - 8}" font-size="10" fill="var(--muted)" text-anchor="middle">${esc(it.rot)}</text>`).join('')}
      ${linha != null ? `<line x1="0" y1="${Y(linha)}" x2="${Wd}" y2="${Y(linha)}" stroke="var(--warn)" stroke-dasharray="5 4"/>` : ''}</svg>
      ${itens.every(i => i.vals.every(v => !v)) ? '<p class="note">Sem dados ainda.</p>' : ''}</div></div>`;
  }
  function indicadores(el) {
    const r = W.indicadoresGestao(H.db, emp(), W.hojeISO(), H.ptax && +H.ptax.venda), g = r.graficos, mesRot = m => m.slice(5) + '/' + m.slice(2, 4);
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin-bottom:14px">
      ${r.cards.map(c => `<button class="kpi" style="border:1px solid var(--line);border-radius:var(--r);background:var(--surface);cursor:${c.ir ? 'pointer' : 'default'}" ${c.ir ? `data-ir="${c.ir === 'carteira' ? 'aba|carteira' : esc(c.ir)}"` : 'disabled'}>
        <span class="lbl">${esc(c.l)}</span><span class="v" style="color:${COR[c.cor] || 'var(--ink)'}">${valorCard(c)}</span><span class="d">${esc(c.ctx || '')}</span></button>`).join('')}</div>
      <div class="g3">${barras('Lucro fechado × despesas fixas · 12 meses', g.lucroFixas.map(x => ({ rot: mesRot(x.mes), vals: [x.lucro, x.fixas], cores: ['var(--blue)', '#E8A29C'] })), null, k)}
        ${barras('Margem s/ receita por mês · linha 15%', g.margemMes.map(x => ({ rot: mesRot(x.mes), vals: [x.margem], cores: [x.margem != null && x.margem < 0.15 ? 'var(--crit)' : 'var(--blue)'] })), 0.15, v => pct(v))}
        ${barras('Previsto × real por operação concluída', g.previstoReal.map(x => ({ rot: x.op, vals: [x.previsto, x.real], cores: ['#9DB4DD', x.real > x.previsto * 1.05 ? 'var(--crit)' : 'var(--blue)'] })), null, k)}</div>`;
  }
})();
