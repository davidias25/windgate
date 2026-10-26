/* Hub 2.0 — Desembolso & Cobrança, Produtividade & Ranking e módulos em implantação. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  const eu = () => H.nomeUsuario(H.userKey);

  /* ================= DESEMBOLSO & COBRANÇA ================= */
  let opDes = null;
  H.telas.desembolso = function (el) {
    if (!H.pode('fin.ver')) { el.innerHTML = '<div class="banner">Acesso restrito ao Financeiro.</div>'; return; }
    const db = H.db, hoje = W.hojeISO();
    const opsCom = db.ops.filter(o => o && o.id && db.fin.some(l => l && l.op === o.id && W.ehReceita(l))).sort((a, b) => (W.ativa(b) - W.ativa(a)) || String(b.id).localeCompare(String(a.id), 'pt-BR', { numeric: true }));
    if (!opDes || !opsCom.some(o => o.id === opDes)) opDes = (opsCom.find(W.ativa) || opsCom[0] || {}).id || null;
    const o = opsCom.find(x => x.id === opDes), d = o ? W.desembolsoOp(db, o.id, hoje) : null;
    const cobs = W.cobrancas(db, hoje);
    el.innerHTML = `
      <div class="head"><div><h1>Desembolso & Cobrança</h1><p class="sub">Gerado do Financeiro: o que o cliente já pagou, o que falta e quando. A regra da casa é conferida sozinha: o cliente nunca paga menos do que já saiu para a fábrica.</p></div>
        <div class="btns"><select id="dop" class="inp" aria-label="Operação">${opsCom.map(x => `<option ${x.id === opDes ? 'selected' : ''} value="${esc(x.id)}">${esc(x.id)} · ${esc(x.cliente || '')}</option>`).join('')}</select></div></div>
      ${o && d ? `<div class="g2 larga">
        <div class="box des" id="desDoc"><div class="des-h"><img src="logo.webp" alt="WindGate" class="des-logo"><div class="des-r"><small>OPERAÇÃO · CLIENTE</small><b>${esc(o.id)} · ${esc(o.cliente || '')}</b><small>VALOR GLOBAL</small><span class="des-v">${W.fmtBRL(d.total)}</span></div></div>
          <div class="box-b"><div class="des-parc">${d.parcelas.map((l, i) => `<div class="dp"><span>${i + 1} · ${esc(l.desc || 'Parcela')}</span><span class="mono">${W.dataBR(W.vencDe(l))}</span><b>${W.fmtBRL(l.valor)}</b><span class="pill ${W.realizado(l) ? 'ok' : W.vencDe(l) < hoje ? 'crit' : 'info'}">${W.realizado(l) ? 'pago' : W.vencDe(l) < hoje ? 'atrasado' : 'a pagar'}</span></div>`).join('')}</div>
            <div class="des-tot"><span>Pago ${W.fmtBRL(d.recebido)}</span><span>A pagar ${W.fmtBRL(d.aReceber)}</span></div>
            ${d.proxima ? `<p class="banner" style="margin-top:12px"><b>Próximo pagamento: ${W.dataBR(W.vencDe(d.proxima))} · ${W.fmtBRL(d.proxima.valor)}</b><br>Pague pelo boleto ou Pix. A baixa entra no Financeiro.</p>` : '<p class="banner ok" style="margin-top:12px">Operação quitada pelo cliente.</p>'}
            <table class="mini" style="margin-top:8px"><tbody><tr><td>Boleto / Pix</td><td class="num note">gerado pelo Asaas quando a conta estiver ativa</td></tr><tr><td>Favorecido</td><td class="num">${esc(d.proxima && d.proxima.empresa === 'JeT' ? 'JeT Import' : 'SF Trading (WindGate)')}</td></tr></tbody></table></div></div>
        <div class="box"><div class="box-h"><h2>Ações</h2><span class="pill ${d.protegido ? 'ok' : 'crit'}">${d.protegido ? 'recebe ≥ paga' : 'receber < pagar'}</span></div><div class="box-b">
          <div class="btns" style="flex-direction:column;align-items:stretch"><button class="btn pri" id="dpdf">Gerar PDF do desembolso</button><button class="btn blue" id="dwpp">Copiar resumo para WhatsApp</button><button class="btn" disabled title="Liga quando a conta do Asaas estiver ativa">Gerar boleto + Pix (Asaas)</button></div>
          <table class="mini" style="margin-top:12px"><tbody><tr><td>Origem dos valores</td><td class="num"><b>Financeiro</b></td></tr><tr><td>Recebido</td><td class="num">${d.parcelas.filter(W.realizado).length} de ${d.parcelas.length} parcelas</td></tr><tr><td>Saídas da operação</td><td class="num">${W.fmtBRL(d.saidas.reduce((a, l) => a + (+l.valor || 0), 0))}</td></tr></tbody></table>
          ${d.bloqueios.length ? `<div class="banner" style="margin-top:12px"><b>Regra de proteção:</b> ${d.bloqueios.map(b => `até ${W.dataBR(b.ate)} sai ${W.fmtBRL(b.falta)} a mais do que o cliente paga (${esc(b.saida.desc || 'pagamento')})`).join('; ')}. Antecipe a parcela do cliente ou adie o pagamento.</div>` : ''}
          <p class="note" style="margin-top:10px">Mudou um valor no Financeiro? O desembolso se atualiza sozinho.</p></div></div></div>` : '<div class="banner">Nenhuma operação com recebimentos lançados ainda. Ao ganhar um negócio no CRM, as parcelas entram aqui.</div>'}
      <div class="box"><div class="box-h"><h2>Cobranças de todas as operações</h2><span class="note">${cobs.length} em aberto</span></div>
        ${cobs.length ? `<div class="tw"><table><thead><tr><th>Operação</th><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th>Boleto/Pix</th><th>Regra de proteção</th><th>Situação</th></tr></thead><tbody>
        ${cobs.map(c => `<tr class="click" data-op="${esc(c.l.op)}"><td class="mono"><b>${esc(c.l.op)}</b></td><td>${esc(c.l.desc || '—')}</td><td class="mono">${W.dataBR(W.vencDe(c.l))}</td><td class="num">${W.fmtBRL(c.l.valor)}</td><td><span class="pill">não emitido</span></td>
          <td><span class="pill ${c.protegido ? 'ok' : 'crit'}">${c.protegido ? 'recebe ≥ paga' : 'receber < pagar fábrica'}</span></td><td><span class="pill ${c.nivel}">${esc(c.sit)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nenhuma cobrança em aberto.</p>'}</div>`;
    const sel = el.querySelector('#dop'); if (sel) sel.onchange = () => { opDes = sel.value; H.render(); };
    el.querySelectorAll('[data-op]').forEach(r => r.onclick = () => { opDes = r.dataset.op; H.render(); window.scrollTo(0, 0); });
    if (!o || !d) return;
    el.querySelector('#dpdf').onclick = () => { document.body.classList.add('imprimindo-des'); window.print(); setTimeout(() => document.body.classList.remove('imprimindo-des'), 500); };
    el.querySelector('#dwpp').onclick = async () => {
      const txt = `*Desembolso ${o.id} · ${o.cliente || ''}*\nValor global: ${W.fmtBRL(d.total)}\n` + d.parcelas.map((l, i) => `${i + 1}. ${l.desc || 'Parcela'} · ${W.dataBR(W.vencDe(l))} · ${W.fmtBRL(l.valor)} · ${W.realizado(l) ? 'PAGO' : 'a pagar'}`).join('\n')
        + `\n\nPago: ${W.fmtBRL(d.recebido)}\nA pagar: ${W.fmtBRL(d.aReceber)}` + (d.proxima ? `\nPróximo pagamento: ${W.dataBR(W.vencDe(d.proxima))} · ${W.fmtBRL(d.proxima.valor)}` : '') + '\n\nWindGate · Good winds open doors';
      try { await navigator.clipboard.writeText(txt); H.toast('Resumo copiado. É só colar no WhatsApp do cliente.'); } catch (e) { H.modal('Resumo do desembolso', `<textarea style="width:100%;min-height:220px">${esc(txt)}</textarea>`); }
    };
  };

  /* ================= PRODUTIVIDADE & RANKING ================= */
  let mesProd = null;
  H.telas.produtividade = function (el) {
    const db = H.db, hoje = W.hojeISO(); mesProd = mesProd || hoje.slice(0, 7);
    const ks = Object.keys(db.users || {}).filter(k => W.perfilDe(db, k).id !== 'diretoria');
    const rk = ks.map(k => Object.assign({ k, perfil: W.perfilDe(db, k) }, W.produtividade(db, H.nomeUsuario(k), W.perfilDe(db, k).id, mesProd, hoje))).sort((a, b) => b.total - a.total);
    const fech = W.fechadasNoMes(db, mesProd), meta = +((((db.hubPainel || {})._meta || {}).mensal || {})[mesProd]) || 0;
    const dir = H.pode('equipe.ver'), euNome = eu();
    const erros = (db.hubErros || []).filter(e => e && String(e.data).slice(0, 7) === mesProd).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const diasFim = (() => { const [y, m] = mesProd.split('-').map(Number); const fim = new Date(y, m, 0).toISOString().slice(0, 10); return W.diasEntre(hoje, fim); })();
    const v = x => x == null ? '<span class="note">—</span>' : Math.round(x);
    el.innerHTML = `
      <div class="head"><div><span class="lbl">${mesProd.split('-').reverse().join('/')}${diasFim != null && diasFim >= 0 ? ' · fecha em ' + diasFim + ' dia(s)' : ''}</span><h1>Produtividade & Ranking</h1><p class="sub">Nota de 0 a 100 por pessoa, a partir do que cada um registra no sistema. Todos veem o ranking; o detalhe é de cada um${dir ? ' (a diretoria vê todos)' : ''}.</p></div>
        <div class="btns"><input type="month" id="pmes" class="inp" value="${mesProd}" aria-label="Mês">${dir ? '<button class="btn" id="pcult">Notas de cultura</button><button class="btn blue" id="perro">+ Registrar erro</button>' : ''}</div></div>
      <div class="box box-b"><div class="meta"><div><b>Meta do time · importações fechadas</b><br><small class="note">${fech.length} de ${meta || '—'} · bônus do time liberado ao bater a meta · vale para ${esc(rk.map(r => r.nome).join(', '))}</small></div><div class="meta-bar"><i style="width:${meta ? Math.min(100, fech.length / meta * 100) : 0}%"></i></div><b>${fech.length}${meta ? ' / ' + meta : ''}</b></div></div>
      <div class="kpis">${W.PILARES.map(([k, l, m]) => `<div class="kpi"><span class="lbl">${l}</span><span class="v">${m}</span><span class="d">${({ prazo: 'tarefas e etapas dentro do prazo', qualidade: 'sem retrabalho: erros e rejeições descontam', funcao: 'metas específicas de cada cargo', evolucao: 'melhora sobre o mês anterior', cultura: 'colaboração e treinamento, nota do Samir' })[k]}</span></div>`).join('')}</div>
      <div class="box"><div class="box-h"><h2>Ranking do mês</h2><span class="note">ouro ≥ 85 · prata 75–84 · gatilho: qualidade ≥ 20 de 30</span></div>
        <div class="tw"><table><thead><tr><th>#</th><th>Pessoa</th>${W.PILARES.map(([, l]) => `<th class="num">${l}</th>`).join('')}<th class="num">Total</th><th class="num">vs mês anterior</th><th>Faixa</th></tr></thead><tbody>
        ${rk.map((r, i) => `<tr><td><span class="pos p${i + 1}">${i + 1}</span></td><td><b>${esc(r.nome)}</b><br><small class="note">${esc(r.perfil.nome)}</small></td>${W.PILARES.map(([k]) => `<td class="num">${v(r.partes[k])}</td>`).join('')}<td class="num"><b>${r.total}</b></td>
          <td class="num">${r.anterior == null ? '<span class="note">—</span>' : (r.total - r.anterior >= 0 ? `<span class="pos-up">▲ ${r.total - r.anterior}</span>` : `<span class="neg">▼ ${r.anterior - r.total}</span>`)}</td><td><span class="pill ${r.faixa === 'ouro' ? 'warn' : r.faixa === 'prata' ? 'info' : ''}">${r.faixa}</span></td></tr>`).join('')}</tbody></table></div>
        <p class="note box-b">Pilar sem dado no mês fica de fora da conta (“—”) em vez de zerar a nota. Cultura vale quando o Samir lança a nota.</p></div>
      <div class="g3">${rk.filter(r => dir || r.nome === euNome).map(r => `<div class="box"><div class="box-h"><h2>${esc(r.nome)} · métricas da função</h2></div><div class="box-b"><table class="mini"><tbody>
        ${r.funcao.map(f => `<tr><td>${esc(f.l)}</td><td class="num"><b>${f.b == null ? f.a : f.a + ' de ' + f.b}</b></td></tr>`).join('') || '<tr><td class="empty">Sem métricas para este perfil.</td></tr>'}</tbody></table></div></div>`).join('')}</div>
      <div class="box"><div class="box-h"><h2>Erros do mês (descontam da qualidade)</h2></div>
        ${erros.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Pessoa</th><th>O que aconteceu</th><th>Impacto</th><th class="num">Pontos</th><th>Ação combinada</th></tr></thead><tbody>${erros.filter(e => dir || e.pessoa === euNome).map(e => `<tr><td class="mono">${W.dataBR(e.data).slice(0, 5)}</td><td>${esc(e.pessoa)}</td><td>${esc(e.texto)}</td><td>${esc(e.impacto || '—')}</td><td class="num neg">−${Math.abs(+e.pontos || 0)}</td><td>${esc(e.acao || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nenhum erro registrado no mês.</p>'}</div>`;
    el.querySelector('#pmes').onchange = e => { mesProd = e.target.value || mesProd; H.render(); };
    const pe = el.querySelector('#perro'); if (pe) pe.onclick = () => registrarErro(rk.map(r => r.nome));
    const pc = el.querySelector('#pcult'); if (pc) pc.onclick = () => notasCultura(rk.map(r => r.nome));
  };
  function registrarErro(nomes) {
    const m = H.modal('Registrar erro', `<div class="fields"><div class="f"><label class="lbl" for="rd">Data</label><input id="rd" type="date" value="${W.hojeISO()}"></div><div class="f"><label class="lbl" for="rp">Pessoa</label><select id="rp">${nomes.map(n => `<option>${esc(n)}</option>`).join('')}</select></div>
      <div class="f"><label class="lbl" for="rpt">Pontos</label><select id="rpt">${[1, 2, 3, 5].map(n => `<option value="${n}">−${n}</option>`).join('')}</select></div><div class="f w4"><label class="lbl" for="rt">O que aconteceu</label><input id="rt"></div>
      <div class="f w2"><label class="lbl" for="ri">Impacto</label><input id="ri" placeholder="Ex.: cotação devolvida"></div><div class="f w2"><label class="lbl" for="ra">Ação combinada</label><input id="ra" placeholder="Ex.: checklist de frete antes de enviar"></div></div>
      <p class="note" style="margin-top:8px">O registro aparece para a própria pessoa, com a ação combinada. O objetivo é corrigir o processo, não punir.</p>`, '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="rok">Registrar</button>');
    m.querySelector('#rok').onclick = () => {
      const t = m.querySelector('#rt').value.trim(); if (!t) { H.toast('Descreva o que aconteceu'); return; }
      if (!Array.isArray(H.db.hubErros)) H.db.hubErros = [];
      H.db.hubErros.unshift({ _id: W.novoId(), data: m.querySelector('#rd').value, pessoa: m.querySelector('#rp').value, texto: t, impacto: m.querySelector('#ri').value.trim(), pontos: +m.querySelector('#rpt').value, acao: m.querySelector('#ra').value.trim(), por: eu(), em: new Date().toISOString() });
      H.salvar(); H.fecharModal(); H.toast('Erro registrado'); H.render();
    };
  }
  function notasCultura(nomes) {
    const pr = Object.assign({}, H.db.hubPainel._produtividade), cult = Object.assign({}, (pr.cultura || {})[mesProd]);
    const m = H.modal('Cultura & treinamento · ' + mesProd.split('-').reverse().join('/'), `<div class="fields">${nomes.map((n, i) => `<div class="f"><label class="lbl" for="nc${i}">${esc(n)} (0 a 10)</label><input id="nc${i}" type="number" min="0" max="10" step="0.5" value="${cult[n] == null ? '' : cult[n]}"></div>`).join('')}</div>
      <p class="note" style="margin-top:8px">Trilha concluída, colaboração, ponto em dia. Deixe vazio para não contar no mês.</p>`, '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="ncok">Salvar</button>');
    m.querySelector('#ncok').onclick = () => {
      nomes.forEach((n, i) => { const v = m.querySelector('#nc' + i).value; if (v === '') delete cult[n]; else cult[n] = Math.max(0, Math.min(10, +v)); });
      pr.cultura = Object.assign({}, pr.cultura, { [mesProd]: cult }); H.db.hubPainel._produtividade = pr; H.salvar(); H.fecharModal(); H.toast('Notas salvas'); H.render();
    };
  }

  /* ================= MÓDULOS EM IMPLANTAÇÃO ================= */
  const IMPL = {
    cambio: { t: 'Câmbio & Hedge', faz: ['PTAX do dia puxada do Banco Central', 'Exposição em dólar por processo (invoice × % já pago)', 'Contratos de câmbio e swift ligados à operação e ao GED', 'Opções (call) com strike, prêmio e vencimento', 'Variação cambial contra a cotação, por operação'],
      precisa: 'Nenhuma conta paga: PTAX é pública (Banco Central). Falta só o cadastro do valor da invoice em dólar na operação, que entra junto com a leitura automática da invoice.', custo: 'R$ 0' },
    nfe: { t: 'NF-e (DUIMP)', faz: ['NF de entrada montada a partir da DUIMP (itens, NCM, impostos)', 'NF de saída para o cliente, com a regra da operação triangular (SF → JeT → cliente)', 'Envio do XML e do DANFE ao cliente e ao contador', 'Fim do limite de 5 DIs/ano do Maino'],
      precisa: 'Conta na Focus NFe (plano Start) + certificado A1 já existente, guardado pelo Davi como segredo no Render. Testar em homologação antes de cancelar o Maino (por causa da multa).', custo: 'R$ 119,90/mês (3 CNPJs)' },
    portal: { t: 'Portal do Cliente', faz: ['Link único por cliente, sem senha para lembrar', 'Etapa da operação, mapa e previsão de chegada', 'Desembolso com boleto/Pix e comprovantes', 'Documentos liberados para o cliente (invoice, BL, NF)'],
      precisa: 'Nada a pagar. Depende do Desembolso (pronto) e do Asaas para o boleto. Entra depois que o sistema novo estiver em produção.', custo: 'R$ 0' },
    tracking: { t: 'Tracking ao vivo', faz: ['Posição do navio pelo número do contêiner', 'ETA atualizado sozinho na operação', 'Alerta de atraso, transbordo e chegada no porto', 'Mapa com a posição real, não estimada'],
      precisa: 'Chave da API da ShipsGo (conta já criada) guardada no Render como SHIPSGO_API_KEY. Cobrança por contêiner rastreado.', custo: '≈ US$ 2 por contêiner' }
  };
  H.telas.implantacao = function (el, k) {
    const m = IMPL[k] || IMPL.cambio;
    el.innerHTML = `<div class="head"><div><span class="lbl">Em implantação</span><h1>${esc(m.t)}</h1><p class="sub">Esta área entra no próximo bloco. Aqui está o que ela vai fazer e o que falta para ligar.</p></div></div>
      <div class="g2"><div class="box"><div class="box-h"><h2>O que vai fazer</h2></div><div class="box-b list">${m.faz.map(f => `<div class="row"><span>${esc(f)}</span></div>`).join('')}</div></div>
        <div class="box"><div class="box-h"><h2>O que falta para ligar</h2></div><div class="box-b"><p>${esc(m.precisa)}</p><table class="mini" style="margin-top:12px"><tbody><tr><td>Custo</td><td class="num"><b>${esc(m.custo)}</b></td></tr></tbody></table></div></div></div>`;
  };
})();
