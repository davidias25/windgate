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
      <div class="box" id="pTempo"><div class="box-h"><h2>Tempo no sistema</h2><span class="note">minutos com o sistema aberto e em uso</span></div><p class="empty">Carregando…</p></div>
      <div class="box"><div class="box-h"><h2>Erros do mês (descontam da qualidade)</h2></div>
        ${erros.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Pessoa</th><th>O que aconteceu</th><th>Impacto</th><th class="num">Pontos</th><th>Ação combinada</th></tr></thead><tbody>${erros.filter(e => dir || e.pessoa === euNome).map(e => `<tr><td class="mono">${W.dataBR(e.data).slice(0, 5)}</td><td>${esc(e.pessoa)}</td><td>${esc(e.texto)}</td><td>${esc(e.impacto || '—')}</td><td class="num neg">−${Math.abs(+e.pontos || 0)}</td><td>${esc(e.acao || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nenhum erro registrado no mês.</p>'}</div>`;
    el.querySelector('#pmes').onchange = e => { mesProd = e.target.value || mesProd; H.render(); };
    // Tempo ativo por pessoa: cada um vê o seu; diretoria, Davi e RH veem a equipe.
    if (H.carregarAtividade) { const de = mesProd + '-01', ate = W.vencDoMes(mesProd, 31) < hoje ? W.vencDoMes(mesProd, 31) : hoje;
      H.carregarAtividade(de, ate).then(atv => { const box = document.querySelector('#pTempo'); if (!box) return;
        const linhas = Object.entries(atv || {}).map(([k, a]) => { const dias = Object.keys(a.dias || {}).length, areas = H.atividadeArea(a.telas); return { nome: H.nomeUsuario(k), dias, media: dias ? a.min / dias : 0, total: a.min, areas }; }).sort((x, y) => y.media - x.media);
        box.innerHTML = `<div class="box-h"><h2>Tempo no sistema</h2><span class="note">minutos com o sistema aberto e em uso · ${mesProd.split('-').reverse().join('/')}</span></div>` + (linhas.length ? `<div class="tw"><table><thead><tr><th>Pessoa</th><th class="num">Média por dia</th><th class="num">Dias ativos</th><th>Onde passou o tempo</th></tr></thead><tbody>${linhas.map(l => `<tr><td><b>${esc(l.nome)}</b></td><td class="num">${H.atividadeHM(l.media)}</td><td class="num">${l.dias}</td>
          <td><div class="areas">${l.areas.slice(0, 4).map(a => `<span style="flex:${Math.max(a.pct, .04)}" title="${esc(a.k)} ${Math.round(a.pct * 100)}%">${esc(a.k)} ${Math.round(a.pct * 100)}%</span>`).join('')}</div></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Ainda sem registro de uso neste mês.</p>'); }); }
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


  /* ================= INTEGRAÇÕES ================= */
  const INTEG = [
    ['banco', 'Banco de dados e backups', 'Banco cifrado na nuvem, histórico por hora e por dia.', 'Davi · Render', 'WINDGATE_DB_SECRET, SUPABASE_URL, SUPABASE_KEY (service_role)', 'já pago (Render/Supabase)'],
    ['ia', 'IA (API do Claude)', 'Lê pedidos, confere invoice × packing list × BL, busca fábricas e apoia o RH.', 'Samir cria a chave no Console · Davi salva no Render', 'ANTHROPIC_API_KEY', 'por uso: créditos do Console (US$ 100 disponíveis)'],
    ['tracking', 'Tracking por contêiner (ShipsGo)', 'Cria o rastreio pelo número do contêiner.', 'Samir pega a chave na ShipsGo · Davi salva no Render', 'SHIPSGO_API_KEY', 'créditos por embarque + taxa anual da API'],
    ['trackingWebhook', 'Avisos da ShipsGo (webhook)', 'ETA e descarga chegam sozinhos; a descarga liga o relógio do free time.', 'Davi cadastra no painel da ShipsGo a URL /api/webhooks/shipsgo/<token>', 'SHIPSGO_WEBHOOK_TOKEN', 'R$ 0'],
    ['ptax', 'Dólar PTAX (Banco Central)', 'Dólar do dia em Câmbio, Custeio e na ficha da operação.', 'nada: API pública', '—', 'R$ 0'],
    ['santander', 'Extrato Santander (SF)', 'Extrato do mês pela API oficial; entra na conciliação.', 'Samir faz a adesão no portal de desenvolvedores do Santander · Davi salva credenciais e certificado', 'SANTANDER_CLIENT_ID, SANTANDER_CLIENT_SECRET, SANTANDER_CERT_ARQUIVO, SANTANDER_CERT_SENHA, SANTANDER_CONTA', 'tarifa de API a confirmar com o gerente'],
    ['itau', 'Extrato Itaú (JeT)', 'Extrato pela API oficial do Itaú; até liberar, OFX ou CAMT.053.', 'Samir pede o client_id ao gerente · Davi salva credenciais e certificado dinâmico', 'ITAU_CLIENT_ID, ITAU_CLIENT_SECRET, ITAU_CERT_ARQUIVO, ITAU_CERT_SENHA, ITAU_EXTRATO_URL', 'tarifa a confirmar com o gerente'],
    ['mcp', 'Claude consulta o Hub (MCP)', 'Perguntar ao Claude "qual o saldo da OP20?" com os dados do Hub, só leitura.', 'Davi cria um token longo e salva no Render', 'WINDGATE_MCP_TOKEN', 'R$ 0'],
    ['portalUnico', 'Portal Único Siscomex (DUIMP)', 'Situação, canal e desembaraço da DUIMP sem abrir o portal.', 'Davi sobe o certificado A1 como Secret File e a senha', 'PORTAL_UNICO_CERT_ARQUIVO, PORTAL_UNICO_CERT_SENHA, PORTAL_UNICO_AMBIENTE', 'R$ 0'],
    ['nfe', 'NF-e recebidas (Focus NFe)', 'Baixa sozinha toda NF-e emitida contra os CNPJs do grupo.', 'Samir cria a conta (plano para 2 CNPJs) · Davi salva o token', 'FOCUS_NFE_TOKEN_SF, FOCUS_NFE_TOKEN_JET (ou FOCUS_NFE_TOKEN), FOCUS_NFE_AMBIENTE', 'Solo R$ 94,90/mês cobre 1 CNPJ; 2 CNPJs pedem outro plano'],
    ['nfeEmissao', 'Emissão de NF-e (Focus NFe)', 'Entrada da DUIMP, conta e ordem, encomenda e triangular SF → JeT → cliente, com prévia do DANFE, cancelamento e carta de correção. Só Davi e o contador emitem.', 'Davi salva um token por empresa e o token do aviso; cadastra o aviso na Focus em /api/webhooks/focus/<token>', 'FOCUS_NFE_TOKEN_SF, FOCUS_NFE_TOKEN_JET, FOCUS_NFE_AMBIENTE (homologacao | producao), FOCUS_WEBHOOK_TOKEN', 'incluído no plano da Focus'],
    ['emailNotas', 'E-mail de notas (IMAP)', 'Nota que chega em notas@windgate.com.br (ou encaminhada do WhatsApp) entra no Fiscal a cada 10 min.', 'Samir cria a caixa · Davi salva o acesso', 'IMAP_HOST, IMAP_PORTA, IMAP_USUARIO, IMAP_SENHA', 'R$ 0 (hospedagem atual)'],
    ['boletos', 'Boleto e Pix (Asaas)', 'Gera a cobrança da parcela e dá baixa sozinha quando o cliente paga.', 'Samir resolve o CNPJ na Asaas · Davi salva a chave', 'ASAAS_API_KEY', 'taxa por boleto pago']
  ];
  H.telas.integracoes = function (el) {
    el.innerHTML = '<p class="empty">Consultando o servidor…</p>';
    H.api('/api/integracoes').then(r => r.json()).then(j => {
      const st = (j && j.integracoes) || {};
      const ok = INTEG.filter(([k]) => st[k] && st[k].ok).length;
      el.innerHTML = `<div class="head"><div><h1>Integrações</h1><p class="sub">${ok} de ${INTEG.length} ligadas. As chaves ficam só no servidor (Render): nunca aparecem aqui nem devem ser mandadas por chat ou e-mail.</p></div></div>
        <div class="box"><div class="tw"><table><thead><tr><th>Integração</th><th>Para quê</th><th>Situação</th><th>Quem faz</th><th>Variáveis no Render</th><th>Custo</th><th></th></tr></thead><tbody>
        ${INTEG.map(([k, t, para, quem, vars, custo]) => { const s = st[k] || {}; return `<tr><td><b>${esc(t)}</b>${s.detalhe ? `<br><small class="note">${esc(s.detalhe)}</small>` : ''}</td><td>${esc(para)}</td><td><span class="pill ${s.ok ? 'ok' : 'warn'}">${s.ok ? 'ligada' : 'falta configurar'}</span></td><td>${esc(quem)}</td><td class="mono" style="font-size:11.5px">${esc(vars)}</td><td>${esc(custo)}</td>
          <td class="num">${k === 'ia' ? '<button class="btn sm" id="tIA">Testar</button>' : k === 'portalUnico' && s.ok ? '<button class="btn sm" id="tPU">Atualizar DUIMPs</button>' : ''}</td></tr>`; }).join('')}</tbody></table></div></div>`;
      const tia = el.querySelector('#tIA'); if (tia) tia.onclick = async () => { tia.disabled = true; tia.textContent = 'Testando…'; const r = await H.api('/api/ia/teste', { method: 'POST' }); const x = await r.json().catch(() => ({})); tia.disabled = false; tia.textContent = 'Testar'; H.toast(x.success ? `IA respondeu: “${esc(x.resposta)}” (modelo ${esc(x.modelo)}). Tudo certo.` : esc(x.message || 'Falhou')); };
      const tpu = el.querySelector('#tPU'); if (tpu) tpu.onclick = async () => { const r = await H.api('/api/portal-unico/duimps', { method: 'POST' }); const x = await r.json().catch(() => ({})); H.toast(x.success ? `${x.atualizadas} DUIMP(s) atualizada(s)${x.erros && x.erros.length ? ', ' + x.erros.length + ' com erro' : ''}.` : esc(x.message || 'Falhou')); };
    }).catch(() => { el.innerHTML = '<div class="banner">Não consegui consultar o servidor.</div>'; });
  };

  /* ================= MÓDULOS EM IMPLANTAÇÃO ================= */
  const IMPL = {
    cambio: { t: 'Câmbio & Hedge', faz: ['PTAX do dia puxada do Banco Central', 'Exposição em dólar por processo (invoice × % já pago)', 'Contratos de câmbio e swift ligados à operação e ao GED', 'Opções (call) com strike, prêmio e vencimento', 'Variação cambial contra a cotação, por operação'],
      precisa: 'Nenhuma conta paga: PTAX é pública (Banco Central). Falta só o cadastro do valor da invoice em dólar na operação, que entra junto com a leitura automática da invoice.', custo: 'R$ 0' },
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
