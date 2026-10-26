/* Hub 2.0 — Financeiro: painel do mês, DRE, contas, lançamentos e resultado por operação. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  const F = { mes: W.hojeISO().slice(0, 7), empresa: 'todas', q: '', tipo: '', status: '', op: '' };
  const CATEGORIAS = ['', 'Empréstimo', 'Estudo impo', 'Imposto geral', 'Imposto importação', 'Transferência'];
  const mesExt = m => { const [a, b] = m.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+b - 1] + '/' + a; };

  function filtrosTopo() {
    return `<div class="btns"><input class="inp" type="month" id="fMes" value="${F.mes}" aria-label="Mês">
      <div class="seg">${[['todas', 'SF + JeT'], ['WindGate', 'WindGate/SF'], ['JeT', 'JeT']].map(([k, l]) => `<button data-emp="${k}" class="${F.empresa === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn pri" data-novo>+ Lançamento</button></div>`;
  }
  function ligarTopo(el) {
    const m = el.querySelector('#fMes'); if (m) m.onchange = () => { F.mes = m.value || F.mes; H.render(); };
    el.querySelectorAll('[data-emp]').forEach(b => b.onclick = () => { F.empresa = b.dataset.emp; H.render(); });
    el.querySelectorAll('[data-novo]').forEach(b => b.onclick = () => editarLanc(null, {}));
  }

  /* ================= PAINEL & DRE ================= */
  H.telas.fin = function (el) {
    if (!H.podeFin()) { el.innerHTML = '<div class="banner">Acesso restrito ao Financeiro.</div>'; return; }
    const db = H.db, hoje = W.hojeISO();
    const p = W.painelMes(db, F.mes, F.empresa, hoje);
    const d = W.dre(db, F.mes, F.empresa);
    const ant = W.dre(db, W.mesSoma(F.mes, -1), F.empresa);
    const fluxo = W.fluxoSemanal(db, hoje, 8, F.empresa, true);
    const maxF = Math.max(1, ...fluxo.map(s => Math.max(s.entra, s.sai)));
    let saldo = 0;
    const L = d.linhas, A = ant.linhas, t = x => x.prev + x.real;
    const linha = (rot, cur, prev, cls) => `<tr class="${cls || ''}"><td>${rot}</td><td class="num">${W.fmtBRL(cur)}</td><td class="num note">${W.fmtBRL(prev)}</td></tr>`;

    el.innerHTML = `
      <div class="head"><div><span class="lbl">Restrito · ${esc(H.nomeUsuario(H.userKey))}</span><h1>Painel financeiro · ${mesExt(F.mes)}</h1><p class="sub">Contas do mês por vencimento; transferências entre SF e JeT ficam fora.</p></div>${filtrosTopo()}</div>
      <div class="kpis">
        <button class="kpi" data-ir="contas"><span class="lbl">A receber no mês</span><span class="v">${W.fmtBRLk(p.receber)}</span><span class="d">${p.qtdReceber} conta(s)</span></button>
        <div class="kpi"><span class="lbl">Já recebido</span><span class="v pos">${W.fmtBRLk(p.recebido)}</span><span class="d">${p.receber + p.recebido ? Math.round(p.recebido / (p.receber + p.recebido) * 100) : 0}% do mês</span></div>
        <button class="kpi" data-ir="contas"><span class="lbl">A pagar no mês</span><span class="v">${W.fmtBRLk(p.pagar)}</span><span class="d">${p.qtdPagar} conta(s)</span></button>
        <div class="kpi"><span class="lbl">Já pago</span><span class="v">${W.fmtBRLk(p.pago)}</span><span class="d">${p.pagar + p.pago ? Math.round(p.pago / (p.pagar + p.pago) * 100) : 0}% do mês</span></div>
        <div class="kpi"><span class="lbl">Resultado de caixa do mês</span><span class="v ${p.resultadoPrevisto < 0 ? 'neg' : 'pos'}">${W.fmtBRLk(p.resultadoPrevisto)}</span><span class="d">realizado até agora ${W.fmtBRLk(p.resultadoRealizado)}</span></div>
        <button class="kpi" data-ir="contas"><span class="lbl">Vencido sem baixa</span><span class="v ${p.vencidoReceber + p.vencidoPagar ? 'neg' : ''}">${W.fmtBRLk(p.vencidoReceber + p.vencidoPagar)}</span><span class="d ${p.vencidoReceber ? 'bad' : ''}">receber ${W.fmtBRLk(p.vencidoReceber)} · pagar ${W.fmtBRLk(p.vencidoPagar)}</span></button>
      </div>
      <div class="g2">
        <div class="box"><div class="box-h"><h2>DRE gerencial · ${mesExt(F.mes)}</h2><span class="note">competência = vencimento · ${Math.round(d.realizadoPct * 100)}% da receita já realizada</span></div>
          <div class="tw"><table><thead><tr><th>Linha</th><th class="num">${mesExt(F.mes)}</th><th class="num">${mesExt(W.mesSoma(F.mes, -1))}</th></tr></thead><tbody>
            ${linha('Receita das operações', t(L.receitaOps), t(A.receitaOps))}
            ${linha('Outras receitas (serviços, estudos, sem operação)', t(L.receitaOutras), t(A.receitaOutras))}
            ${linha('(−) Impostos das operações', -t(L.impostosOps), -t(A.impostosOps))}
            ${linha('(−) Custos das operações (fábrica, frete, porto, despachante)', -t(L.custoOps), -t(A.custoOps))}
            ${linha('<b>Lucro bruto</b>', d.lucroBruto, ant.lucroBruto, 'sub')}
            ${linha('(−) Despesas fixas da empresa', -t(L.despesasFixas), -t(A.despesasFixas))}
            ${linha('(−) Impostos gerais', -t(L.impostosGerais), -t(A.impostosGerais))}
            ${linha('<b>Lucro antes do IR</b>', d.lair, ant.lair, 'sub')}
            ${linha('(−) IRPJ/CSLL estimado (34%)', -d.ir, -ant.ir)}
            ${linha('<b>Lucro líquido</b>', d.lucroLiquido, ant.lucroLiquido, 'sub')}
            ${linha('Por sócio (÷ 2)', d.porSocio, ant.porSocio)}
          </tbody><tfoot><tr><td colspan="3" class="note">Fora do resultado: empréstimos recebidos ${W.fmtBRL(t(L.emprestimosEntrada))} · pagos ${W.fmtBRL(t(L.emprestimosSaida))}. A contabilidade oficial continua com os contadores.</td></tr></tfoot></table></div></div>
        <div class="box"><div class="box-h"><h2>Fluxo projetado · 8 semanas</h2><span class="note">contas em aberto, a partir de hoje</span></div><div class="box-b">
          ${fluxo.map(s => { saldo += s.entra - s.sai; return `<div style="display:grid;grid-template-columns:70px minmax(0,1fr) 92px;gap:8px;align-items:center;padding:4px 0;font-size:12.5px">
            <span class="mono ${s.vencido ? 'neg' : 'note'}">${s.vencido ? 'Vencidos' : W.dataBR(s.de).slice(0, 5)}</span>
            <span><span style="display:block;height:7px;border-radius:3px;background:var(--ok);width:${s.entra / maxF * 100}%;margin-bottom:2px"></span><span style="display:block;height:7px;border-radius:3px;background:var(--crit);opacity:.8;width:${s.sai / maxF * 100}%"></span></span>
            <span class="num ${saldo < 0 ? 'neg' : ''}" title="saldo acumulado">${W.fmtBRLk(saldo)}</span></div>`; }).join('')}
          <p class="note" style="margin-top:8px">Verde: entradas · vermelho: saídas · à direita, o acumulado das contas em aberto.</p></div></div>
      </div>`;
    ligarTopo(el);
    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => H.ir(b.dataset.ir));
  };

  /* ================= CONTAS A PAGAR E RECEBER ================= */
  let abaContas = 'pagar';
  H.telas.contas = function (el) {
    if (!H.podeFin()) { el.innerHTML = '<div class="banner">Acesso restrito ao Financeiro.</div>'; return; }
    const db = H.db, hoje = W.hojeISO();
    const ate = W.mesSoma(F.mes, 0) + '-31';
    const tipo = abaContas === 'pagar' ? 'Despesa' : 'Receita';
    const lista = W.contasAbertas(db, tipo, ate, F.empresa);
    const venc = lista.filter(l => W.vencDe(l) < hoje), hojeL = lista.filter(l => W.vencDe(l) === hoje);
    const semana = new Date(hoje + 'T12:00:00'); semana.setDate(semana.getDate() + 7);
    const prox7 = lista.filter(l => W.vencDe(l) > hoje && W.vencDe(l) <= semana.toISOString().slice(0, 10));
    const soma = a => a.reduce((s, l) => s + (+l.valor || 0), 0);
    const aguardando = abaContas === 'pagar' ? lista.filter(l => !l.autorizadoEm) : [];
    el.innerHTML = `
      <div class="head"><div><h1>Contas a ${abaContas}</h1><p class="sub">Em aberto até o fim de ${mesExt(F.mes)}, incluindo as vencidas.</p></div>${filtrosTopo()}</div>
      <div class="tabs" role="tablist"><button role="tab" aria-selected="${abaContas === 'pagar'}" data-c="pagar">A pagar</button><button role="tab" aria-selected="${abaContas === 'receber'}" data-c="receber">A receber</button></div>
      <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <div class="kpi"><span class="lbl">Vencidas</span><span class="v ${venc.length ? 'neg' : ''}">${W.fmtBRLk(soma(venc))}</span><span class="d">${venc.length} conta(s)</span></div>
        <div class="kpi"><span class="lbl">Vencem hoje</span><span class="v">${W.fmtBRLk(soma(hojeL))}</span><span class="d">${hojeL.length} conta(s)</span></div>
        <div class="kpi"><span class="lbl">Próximos 7 dias</span><span class="v">${W.fmtBRLk(soma(prox7))}</span><span class="d">${prox7.length} conta(s)</span></div>
        <div class="kpi"><span class="lbl">${abaContas === 'pagar' ? 'Aguardando autorização' : 'Total em aberto'}</span><span class="v">${abaContas === 'pagar' ? aguardando.length : W.fmtBRLk(soma(lista))}</span><span class="d">${abaContas === 'pagar' ? 'Davi prepara · Samir autoriza' : lista.length + ' conta(s)'}</span></div>
      </div>
      <div class="box">${tabelaLanc(lista, { contas: true })}</div>`;
    ligarTopo(el); ligarLanc(el);
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { abaContas = b.dataset.c; H.render(); });
  };

  /* ================= LANÇAMENTOS ================= */
  H.telas.lanc = function (el) {
    if (!H.pode('fin.lancar')) { el.innerHTML = '<div class="banner">Acesso restrito ao Financeiro.</div>'; return; }
    const db = H.db;
    const q = F.q.trim().toLowerCase();
    const lista = db.fin.filter(l => l && (F.empresa === 'todas' || (l.empresa || 'WindGate') === F.empresa)
      && (q ? [l.desc, l.op, l.categoria, l.por, String(l.valor)].join(' ').toLowerCase().includes(q) : W.mesDe(W.vencDe(l)) === F.mes)
      && (!F.tipo || l.tipo === F.tipo) && (!F.status || l.status === F.status) && (!F.op || l.op === F.op))
      .sort((a, b) => W.vencDe(a).localeCompare(W.vencDe(b)));
    const ops = [...new Set(db.fin.map(l => l && l.op).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
    const ent = lista.filter(W.ehReceita).reduce((s, l) => s + (+l.valor || 0), 0), sai = lista.filter(l => !W.ehReceita(l)).reduce((s, l) => s + (+l.valor || 0), 0);
    el.innerHTML = `
      <div class="head"><div><h1>Lançamentos</h1><p class="sub">${q ? 'Busca em todos os meses' : 'Vencimentos de ' + mesExt(F.mes)}${H.pode('fin.ver') ? ` · entradas ${W.fmtBRL(ent)} · saídas ${W.fmtBRL(sai)}` : ''}</p></div>${filtrosTopo()}</div>
      <div class="box"><div class="filters">
        <input type="search" id="lq" placeholder="Buscar em todos os meses: descrição, operação, valor…" value="${esc(F.q)}">
        <select id="lt" class="inp"><option value="">Receitas e despesas</option><option ${F.tipo === 'Receita' ? 'selected' : ''}>Receita</option><option ${F.tipo === 'Despesa' ? 'selected' : ''}>Despesa</option></select>
        <select id="ls" class="inp"><option value="">Previsto e realizado</option><option ${F.status === 'Previsto' ? 'selected' : ''}>Previsto</option><option ${F.status === 'Realizado' ? 'selected' : ''}>Realizado</option></select>
        <select id="lo" class="inp"><option value="">Todas as operações</option>${ops.map(o => `<option ${F.op === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
        <span class="note">${lista.length} lançamento(s)</span></div>
        ${tabelaLanc(lista)}</div>`;
    ligarTopo(el); ligarLanc(el);
    const lq = el.querySelector('#lq');
    lq.addEventListener('input', () => { F.q = lq.value; clearTimeout(lq._t); lq._t = setTimeout(() => { H.render(); const n = document.querySelector('#lq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); });
    el.querySelector('#lt').onchange = e => { F.tipo = e.target.value; H.render(); };
    el.querySelector('#ls').onchange = e => { F.status = e.target.value; H.render(); };
    el.querySelector('#lo').onchange = e => { F.op = e.target.value; H.render(); };
  };

  /* ================= RESULTADO POR OPERAÇÃO ================= */
  H.telas.resop = function (el) {
    if (!H.podeFin()) { el.innerHTML = '<div class="banner">Acesso restrito ao Financeiro.</div>'; return; }
    const rs = W.resultadoPorOp(H.db, F.empresa);
    const tot = rs.reduce((a, r) => ({ rec: a.rec + r.receita, desp: a.desp + r.despesa, res: a.res + r.resultado, sr: a.sr + r.saldoReceber }), { rec: 0, desp: 0, res: 0, sr: 0 });
    const opMap = Object.fromEntries(H.db.ops.map(o => [o.id, o]));
    el.innerHTML = `
      <div class="head"><div><h1>Resultado por operação</h1><p class="sub">Operação inteira, todos os meses: receita, custos, margem e o que ainda falta receber.</p></div>${filtrosTopo()}</div>
      <div class="box"><div class="tw"><table><thead><tr><th>Operação</th><th>Etapa</th><th class="num">Receita</th><th class="num">Custos</th><th class="num">Resultado</th><th class="num">Margem s/ custo</th><th class="num">Falta receber</th><th class="num">Caixa hoje</th></tr></thead><tbody>
      ${rs.map(r => `<tr class="click" data-op="${esc(r.op)}"><td class="mono"><b>${esc(r.op)}</b><br><small class="note">${esc((opMap[r.op] || {}).cliente || '')}</small></td><td>${opMap[r.op] ? H.pillStatus(opMap[r.op].status) : '<span class="note">—</span>'}</td>
        <td class="num">${W.fmtBRL(r.receita)}</td><td class="num">${W.fmtBRL(r.despesa)}</td><td class="num ${r.resultado < 0 ? 'neg' : 'pos'}"><b>${W.fmtBRL(r.resultado)}</b></td>
        <td class="num">${r.margem == null ? '—' : (r.margem * 100).toFixed(1) + '%'}</td><td class="num">${W.fmtBRL(r.saldoReceber)}</td><td class="num ${r.caixa < 0 ? 'neg' : ''}">${W.fmtBRL(r.caixa)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="2">Total</td><td class="num">${W.fmtBRL(tot.rec)}</td><td class="num">${W.fmtBRL(tot.desp)}</td><td class="num">${W.fmtBRL(tot.res)}</td><td></td><td class="num">${W.fmtBRL(tot.sr)}</td><td></td></tr></tfoot></table></div></div>`;
    ligarTopo(el);
    el.querySelectorAll('[data-op]').forEach(x => x.onclick = () => H.ir('ficha', x.dataset.op));
  };

  /* ================= Tabela e edição de lançamento ================= */
  function tabelaLanc(lista, opt) {
    if (!lista.length) return '<p class="empty">Nenhum lançamento aqui.</p>';
    const hoje = W.hojeISO(), contas = opt && opt.contas, aprova = H.aprova();
    return `<div class="tw"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Operação</th><th>Empresa</th><th>Tipo</th><th class="num">Valor</th><th>Situação</th>${contas ? '<th>Autorização</th>' : ''}<th></th></tr></thead><tbody>
      ${lista.map(l => { const v = W.vencDe(l), venc = !W.realizado(l) && v < hoje;
        const sit = W.realizado(l) ? `<span class="pill ok">${W.ehReceita(l) ? 'Recebido' : 'Pago'} ${W.dataBR(l.liquidadoEm).slice(0, 5)}</span>` : venc ? '<span class="pill crit">Vencido</span>' : v === hoje ? '<span class="pill warn">Vence hoje</span>' : '<span class="pill info">Previsto</span>';
        const aut = contas ? '<td>' + (l.autorizadoEm ? `<span class="pill ok">Autorizado · ${esc(l.autorizadoPor || '')}</span>` : W.ehReceita(l) ? '<span class="note">—</span>' : aprova ? `<button class="btn sm blue" data-aut="${esc(l._id)}">Autorizar</button>` : '<span class="pill warn">Aguardando Samir</span>') + '</td>' : '';
        return `<tr><td class="mono">${W.dataBR(v)}</td><td>${esc(l.desc || '—')}${l.recId ? ` <span class="note">(fixa ${l.recIdx}/${l.recTot})</span>` : ''}${l.categoria ? `<br><small class="note">${esc(l.categoria)}</small>` : ''}</td>
          <td class="mono">${esc(l.op || '—')}</td><td>${esc(l.empresa || 'WindGate')}</td><td><span class="pill ${W.ehReceita(l) ? 'ok' : 'crit'}">${esc(l.tipo || 'Despesa')}</span></td>
          <td class="num"><b>${W.fmtBRL(l.valor)}</b></td><td>${sit}</td>${aut}
          <td class="num" style="white-space:nowrap">${l.comp ? `<a class="btn ghost sm" href="${esc(l.comp)}" target="_blank" rel="noopener">Comprovante</a>` : ''}${!W.realizado(l) ? `<button class="btn sm" data-baixa="${esc(l._id)}">Dar baixa</button>` : ''}<button class="btn ghost sm" data-ed="${esc(l._id)}">Editar</button></td></tr>`; }).join('')}
    </tbody></table></div>`;
  }
  H.tabelaLanc = tabelaLanc;

  function ligarLanc(el) {
    const achar = id => H.db.fin.find(l => l && l._id === id);
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editarLanc(achar(b.dataset.ed)));
    el.querySelectorAll('[data-baixa]').forEach(b => b.onclick = () => darBaixa(achar(b.dataset.baixa)));
    el.querySelectorAll('[data-aut]').forEach(b => b.onclick = () => {
      const l = achar(b.dataset.aut); if (!l) return H.render();
      l.autorizadoEm = new Date().toISOString(); l.autorizadoPor = H.nomeUsuario(H.userKey);
      H.salvar(); H.toast('Pagamento autorizado'); H.render();
    });
  }
  H.ligarLanc = ligarLanc;

  function darBaixa(l) {
    if (!l) return;
    const rec = W.ehReceita(l);
    const m = H.modal(`${rec ? 'Receber' : 'Pagar'} · ${l.desc || l.op || ''}`, `<div class="fields">
      <div class="f w2"><label class="lbl" for="bv">Valor ${rec ? 'recebido' : 'pago'} (R$)</label><input id="bv" type="number" step="0.01" value="${(+l.valor || 0).toFixed(2)}"></div>
      <div class="f w2"><label class="lbl" for="bd">Data</label><input id="bd" type="date" value="${W.hojeISO()}"></div>
      <div class="f w4"><label class="lbl" for="bc">Link do comprovante (opcional)</label><input id="bc" type="url" value="${esc(l.comp || '')}" placeholder="https://…"></div></div>
      ${!rec && !l.autorizadoEm ? '<p class="banner" style="margin-top:12px">Este pagamento ainda não foi autorizado pelo Samir.</p>' : ''}`,
      `<button class="btn" data-x>Cancelar</button><button class="btn blue" id="bok">Confirmar ${rec ? 'recebimento' : 'pagamento'}</button>`);
    m.querySelector('#bok').onclick = () => {
      l = H.db.fin.find(x => x && x._id === l._id);
      if (!l) { H.fecharModal(); H.toast('Este lançamento foi removido por outra pessoa. Nada foi gravado.'); H.render(); return; }
      W.realizar(l, +m.querySelector('#bv').value, m.querySelector('#bd').value);
      const c = m.querySelector('#bc').value.trim(); if (c) l.comp = c;
      l.baixaPor = H.nomeUsuario(H.userKey);
      H.salvar(); H.fecharModal(); H.toast(`${rec ? 'Recebimento' : 'Pagamento'} de <b>${W.fmtBRL(l.valor)}</b> registrado`); H.render();
    };
  }

  function editarLanc(l, base) {
    const novo = !l, d = l || Object.assign({ tipo: 'Despesa', status: 'Previsto', empresa: 'WindGate', vencimento: W.hojeISO(), op: '' }, base || {});
    const ops = H.db.ops.map(o => o.id).sort((a, b) => String(b).localeCompare(String(a), 'pt-BR', { numeric: true }));
    const sel = (a, b) => a === b ? 'selected' : '';
    const m = H.modal(novo ? 'Novo lançamento' : 'Editar lançamento', `<div class="fields">
      <div class="f"><label class="lbl" for="et">Tipo</label><select id="et"><option ${sel(d.tipo, 'Despesa')}>Despesa</option><option ${sel(d.tipo, 'Receita')}>Receita</option></select></div>
      <div class="f"><label class="lbl" for="ev">Valor (R$)</label><input id="ev" type="number" step="0.01" value="${d.valor || ''}"></div>
      <div class="f"><label class="lbl" for="ed">Vencimento</label><input id="ed" type="date" value="${W.soData(d.vencimento || d.data)}"></div>
      <div class="f"><label class="lbl" for="ee">Empresa</label><select id="ee"><option value="WindGate" ${sel(d.empresa, 'WindGate')}>WindGate / SF</option><option value="JeT" ${sel(d.empresa, 'JeT')}>JeT</option></select></div>
      <div class="f w2"><label class="lbl" for="eo">Operação</label><select id="eo"><option value="WindGate">Sem operação (despesa da empresa)</option>${ops.map(o => `<option ${sel(d.op, o)}>${esc(o)}</option>`).join('')}</select></div>
      <div class="f w2"><label class="lbl" for="ec">Categoria</label><select id="ec">${CATEGORIAS.map(c => `<option value="${esc(c)}" ${sel(d.categoria || '', c)}>${esc(c || 'Sem categoria')}</option>`).join('')}</select></div>
      <div class="f w4"><label class="lbl" for="ex">Descrição</label><input id="ex" value="${esc(d.desc || '')}"></div>
      <div class="f w2"><label class="lbl" for="es">Situação</label><select id="es"><option ${sel(d.status, 'Previsto')}>Previsto</option><option ${sel(d.status, 'Realizado')}>Realizado</option></select></div>
      <div class="f w2"><label class="lbl" for="ecp">Link do comprovante</label><input id="ecp" type="url" value="${esc(d.comp || '')}"></div>
      ${novo ? `<div class="f w4"><label class="lbl"><input type="checkbox" id="efx" style="width:auto"> Conta fixa mensal (gera 12 meses)</label></div>` : ''}
      ${l && l.recId ? '<p class="note f w4">Lançamento de conta fixa: esta edição muda só este mês (o vencimento continua dentro do mês dele).</p>' : ''}</div>`,
      `${!novo && H.pode('fin.excluir') ? '<button class="btn" id="edel" style="margin-right:auto;color:var(--crit)">Excluir</button>' : ''}<button class="btn" data-x>Cancelar</button><button class="btn blue" id="eok">Salvar</button>`);
    // Quem só lança não altera o que outra pessoa já baixou: só anexa o comprovante.
    const restrito = !novo && !H.pode('fin.excluir') && W.realizado(l) && l.por !== H.nomeUsuario(H.userKey);
    if (restrito) { m.querySelectorAll('input,select').forEach(x => { if (x.id !== 'ecp') x.disabled = true; }); m.querySelector('.box-b').insertAdjacentHTML('afterbegin', '<p class="banner" style="margin-bottom:10px">Lançamento já baixado por outra pessoa: você pode anexar o comprovante. Outras mudanças, peça ao Davi.</p>'); }
    m.querySelector('#eok').onclick = () => {
      if (restrito) {
        const atual = H.db.fin.find(x => x && x._id === l._id); if (!atual) { H.fecharModal(); H.render(); return; }
        atual.comp = m.querySelector('#ecp').value.trim(); H.salvar(); H.fecharModal(); H.toast('Comprovante anexado'); H.render(); return;
      }
      if (!novo) { l = H.db.fin.find(x => x && x._id === l._id); if (!l) { H.fecharModal(); H.toast('Este lançamento foi removido por outra pessoa. Nada foi gravado.'); H.render(); return; } }
      const valor = +m.querySelector('#ev').value;
      if (!(valor > 0)) { H.toast('Informe um valor maior que zero'); return; }
      let venc = m.querySelector('#ed').value || W.hojeISO();
      // Conta fixa: a ocorrência fica no próprio mês (só o dia muda), igual ao sistema atual.
      if (l && l.recId && l.mesRef) venc = W.vencDoMes(l.mesRef, venc.slice(8, 10));
      const status = m.querySelector('#es').value;
      const campos = { tipo: m.querySelector('#et').value, valor, vencimento: venc, data: (l && l.data) || venc, empresa: m.querySelector('#ee').value,
        op: m.querySelector('#eo').value || 'WindGate', categoria: m.querySelector('#ec').value, desc: m.querySelector('#ex').value.trim(), status,
        comp: m.querySelector('#ecp').value.trim(), liquidadoEm: status === 'Realizado' ? ((l && l.liquidadoEm) || venc) : null };
      const eu = H.nomeUsuario(H.userKey);
      if (novo && m.querySelector('#efx') && m.querySelector('#efx').checked) {
        const s = W.novaSerie(H.db, Object.assign({ por: eu }, campos), 12, status === 'Realizado');
        H.salvar(); H.fecharModal(); H.toast(`Conta fixa criada: <b>${s.total} meses</b>`); H.render(); return;
      }
      if (novo) H.db.fin.unshift(Object.assign({ _id: W.novoId(), por: eu, fixo: false, nf: '', criadoEm: new Date().toISOString() }, campos));
      else {
        // Pagamento autorizado que muda de valor, vencimento ou destino volta para autorização.
        if (l.autorizadoEm && (+l.valor !== +campos.valor || W.vencDe(l) !== campos.vencimento || (l.op || '') !== campos.op)) { campos.autorizadoEm = null; campos.autorizadoPor = null; H.toast('Valor ou vencimento mudou: o pagamento volta para autorização do Samir.'); } if (l.recId) { campos.fixo = true; campos.data = venc; } Object.assign(l, campos); if (status !== 'Realizado') { l.valorPago = null; l.valorPrevisto = null; } }
      H.salvar(); H.fecharModal(); H.toast(novo ? 'Lançamento registrado' : 'Lançamento atualizado'); H.render();
    };
    const del = m.querySelector('#edel');
    if (del) del.onclick = () => {
      if (del.dataset.ok !== '1') { del.dataset.ok = '1'; del.textContent = 'Clique de novo para excluir'; return; }
      H.db.fin = H.db.fin.filter(x => !(x && x._id === l._id));
      H.salvar(); H.fecharModal(); H.toast('Lançamento excluído (dá para recuperar pelo histórico do banco)'); H.render();
    };
  }
  H.editarLanc = editarLanc;
})();
