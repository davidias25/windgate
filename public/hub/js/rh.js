/* Hub 2.0 — RH & Pessoas (coordenação de RH) e Cultura WindGate.
   RH vê produtividade, tempo no sistema, ponto, clima e as próprias anotações
   de 1:1; nunca vê dinheiro (o servidor não envia financeiro ao perfil RH).
   Cultura: missão, visão e valores, com o "li e me comprometo" de cada pessoa. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  let mesRH = null, atividadeCache = { chave: '', dados: null }, pontoCache = { chave: '', dados: null }, analise = null;
  const eu = () => H.nomeUsuario(H.userKey);
  const AREA = { torre: 'Torre', ops: 'Operações', ficha: 'Operações', mapa: 'Mapa', docs: 'Documentos', pedidos: 'Pedidos', crm: 'CRM', fin: 'Financeiro', contas: 'Financeiro', lanc: 'Financeiro', resop: 'Financeiro', desembolso: 'Financeiro', dashfin: 'Financeiro', fiscal: 'Fiscal', chat: 'Chat', reuniao: 'Reunião', produtividade: 'Produtividade', sourcing: 'Sourcing', dashops: 'Desempenho', rh: 'RH', cultura: 'Cultura', integracoes: 'Configuração', 'legado': 'Sistema atual', frete: 'Fretes', agenda: 'Agenda', ponto: 'Ponto', pedidos: 'Pedidos', tracking: 'Tracking', torreDe: 'Torre' };
  const area = t => { const x = String(t).replace(/^L:/, ''); return AREA[x.split(':')[0]] || (/^L:/.test(t) ? 'Sistema atual' : 'Outros'); };
  /** Junta minutos por área e devolve as 3 maiores em %. */
  function porArea(telas) { const a = {}; let tot = 0; Object.entries(telas || {}).forEach(([t, m]) => { const k = area(t); a[k] = (a[k] || 0) + m; tot += m; }); return Object.entries(a).sort((x, y) => y[1] - x[1]).map(([k, m]) => ({ k, m, pct: tot ? m / tot : 0 })); }
  const hm = min => min >= 60 ? Math.floor(min / 60) + 'h' + String(Math.round(min % 60)).padStart(2, '0') : Math.round(min) + ' min';
  H.atividadeArea = porArea; H.atividadeHM = hm;

  async function carregarAtividade(de, ate) {
    const ch = de + ate; if (atividadeCache.chave === ch && atividadeCache.dados) return atividadeCache.dados;
    try { const r = await H.api(`/api/atividade?de=${de}&ate=${ate}`); const j = await r.json(); atividadeCache = { chave: ch, dados: j.success ? j.pessoas : {} }; } catch (e) { atividadeCache = { chave: ch, dados: {} }; }
    return atividadeCache.dados;
  }
  H.carregarAtividade = carregarAtividade;
  async function carregarPonto(mes) {
    if (pontoCache.chave === mes && pontoCache.dados) return pontoCache.dados;
    // Home office = dia com entrada fora do raio do escritório (registro do ponto).
    try { const r = await H.api(`/api/ponto?de=${mes}-01&ate=${mes}-31`); const j = await r.json();
      const lim = Object.assign({ matheus: 6, ivina: 4 }, ((H.db.hubPainel || {})._rh || {}).limitesHO), pessoas = {};
      (j.registros || []).forEach(x => { if (x.tipo !== 'entrada') return; const p = pessoas[x.usuario] = pessoas[x.usuario] || { dias: new Set(), ho: new Set() }; p.dias.add(x.data); if (x.dentroDoRaio === false) p.ho.add(x.data); });
      pontoCache = { chave: mes, dados: j.success ? { pessoas: Object.fromEntries(Object.keys(Object.assign({}, lim, pessoas)).map(k => [k, { homeOffice: pessoas[k] ? pessoas[k].ho.size : 0, diasPonto: pessoas[k] ? pessoas[k].dias.size : 0, limite: lim[k] || null }])) } : null }; }
    catch (e) { pontoCache = { chave: mes, dados: null }; }
    return pontoCache.dados;
  }

  H.telas.rh = function (el) {
    if (!H.pode('rh.ver')) { el.innerHTML = '<div class="banner">Esta área é da coordenação de RH e da diretoria.</div>'; return; }
    const db = H.db, hoje = W.hojeISO(); mesRH = mesRH || hoje.slice(0, 7);
    const de = mesRH + '-01', ate = W.vencDoMes(mesRH, 31) < hoje ? W.vencDoMes(mesRH, 31) : hoje;
    const ks = Object.keys(db.users || {}).filter(k => !['diretoria', 'rh', 'contador'].includes(W.perfilDe(db, k).id));
    if (!atividadeCache.dados || atividadeCache.chave !== de + ate) { el.innerHTML = '<p class="empty">Carregando dados da equipe…</p>'; Promise.all([carregarAtividade(de, ate), carregarPonto(mesRH)]).then(() => { if (H.estado.tela === 'rh') H.render(); }); return; }
    const atv = atividadeCache.dados || {}, ponto = pontoCache.dados;
    const notas = (db.hubRH || []).filter(r => r && r.tipo !== 'pulso').sort((a, b) => String(b.data || b.em).localeCompare(String(a.data || a.em)));
    const pulsos = (db.hubRH || []).filter(r => r && r.tipo === 'pulso');
    const ult4 = [0, 1, 2, 3].map(i => { const d = new Date(hoje + 'T12:00:00'); d.setDate(d.getDate() - 7 * i); return W.semanaDe(d.toISOString().slice(0, 10)).ini; });
    const pulsoMedio = (() => { const p = pulsos.filter(x => ult4.includes(x.semana)); return p.length ? p.reduce((a, x) => a + (+x.nota || 0), 0) / p.length : null; })();
    const aceites = Object.keys(db.users || {}).filter(k => (db.hubPainel || {})['_aceite_' + k]).length;
    const dias = Math.max(1, Object.keys(Object.assign({}, ...Object.values(atv).map(a => a.dias || {}))).length);
    const pessoas = ks.map(k => { const nome = H.nomeUsuario(k), perfil = W.perfilDe(db, k), pr = W.produtividade(db, nome, perfil.id, mesRH, hoje), a = atv[k] || { min: 0, dias: {}, telas: {} };
      const diasAtivos = Object.keys(a.dias || {}).length, ho = ponto && ponto.pessoas ? (ponto.pessoas[k] || {}) : null;
      return { k, nome, perfil, pr, min: a.min, diasAtivos, media: diasAtivos ? a.min / diasAtivos : 0, areas: porArea(a.telas), ho, atrasadas: (db.agendaTasks || []).filter(t => t && t.resp === nome && t.status !== 'feita' && t.prazo && t.prazo < hoje).length,
        ultima1a1: notas.find(n => n.pessoa === nome && n.tipo === '1a1') }; });
    el.innerHTML = `
      <div class="head"><div><h1>RH & Pessoas</h1><p class="sub">Desenvolvimento da equipe a partir do que cada um faz no sistema. Sem salários nem financeiro. Princípio da casa: treinar antes de cobrar.</p></div>
        <div class="btns"><input type="month" id="rmes" class="inp" value="${mesRH}" aria-label="Mês"><button class="btn" data-ir="cultura">Cultura WindGate</button><button class="btn" id="rnota">+ Anotação de 1:1</button><button class="btn pri" id="ria">Análise da IA</button></div></div>
      <div class="kpis">
        <div class="kpi"><span class="lbl">Equipe</span><span class="v">${ks.length}</span><span class="d">colaboradores acompanhados</span></div>
        <div class="kpi"><span class="lbl">Nota média do mês</span><span class="v">${pessoas.length ? Math.round(pessoas.reduce((a, p) => a + p.pr.total, 0) / pessoas.length) : '—'}</span><span class="d">0 a 100 (Produtividade)</span></div>
        <div class="kpi"><span class="lbl">Tempo no sistema</span><span class="v">${pessoas.length ? hm(pessoas.reduce((a, p) => a + p.media, 0) / pessoas.length) : '—'}</span><span class="d">média por pessoa por dia ativo</span></div>
        <div class="kpi"><span class="lbl">Clima (pulso 4 semanas)</span><span class="v">${pulsoMedio == null ? '—' : pulsoMedio.toFixed(1).replace('.', ',') + ' / 5'}</span><span class="d">${pulsos.filter(x => ult4.includes(x.semana)).length} resposta(s) anônima(s)</span></div>
        <div class="kpi"><span class="lbl">Cultura</span><span class="v">${aceites}/${Object.keys(db.users || {}).length}</span><span class="d">leram e se comprometeram</span></div></div>
      ${analise ? `<div class="box"><div class="box-h"><h2>Leitura da IA</h2><span class="note">apoio à conversa, não é avaliação final</span></div><div class="box-b"><p>${esc(analise.equipe || '')}</p><div class="g3" style="margin-top:10px">${(analise.pessoas || []).map(p => `<div class="rp"><b>${esc(p.nome)}</b>
        ${(p.destaques || []).length ? `<p><b>Vai bem:</b> ${esc(p.destaques.join('; '))}</p>` : ''}${(p.atencao || []).length ? `<p><b>Atenção:</b> ${esc(p.atencao.join('; '))}</p>` : ''}${(p.possiveisCausas || []).length ? `<p class="note">Possíveis causas: ${esc(p.possiveisCausas.join('; '))}</p>` : ''}
        ${(p.perguntas1a1 || []).length ? `<p><b>Perguntas para a 1:1:</b></p><ul class="rl">${p.perguntas1a1.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}${p.acaoSugerida ? `<p><b>Ação:</b> ${esc(p.acaoSugerida)}</p>` : ''}</div>`).join('')}</div></div></div>` : ''}
      <div class="g3">${pessoas.map(p => `<div class="box"><div class="box-h"><h2>${esc(p.nome)}</h2><span class="pill ${p.pr.faixa === 'ouro' ? 'warn' : p.pr.faixa === 'prata' ? 'info' : ''}">${p.pr.total} · ${p.pr.faixa}</span></div><div class="box-b">
        <p class="note">${esc(p.perfil.nome)}</p>
        <table class="mini"><tbody>
          <tr><td>Tempo no sistema</td><td class="num"><b>${hm(p.media)}</b>/dia · ${p.diasAtivos} de ${dias} dia(s)</td></tr>
          <tr><td>Onde passou o tempo</td><td class="num">${p.areas.slice(0, 3).map(a => `${esc(a.k)} ${Math.round(a.pct * 100)}%`).join(' · ') || '—'}</td></tr>
          ${W.PILARES.map(([kk, l]) => `<tr><td>${l}</td><td class="num">${p.pr.partes[kk] == null ? '—' : Math.round(p.pr.partes[kk])}</td></tr>`).join('')}
          <tr><td>Tarefas vencidas</td><td class="num ${p.atrasadas ? 'neg' : ''}">${p.atrasadas}</td></tr>
          <tr><td>Erros no mês</td><td class="num ${p.pr.erros.length ? 'neg' : ''}">${p.pr.erros.length}</td></tr>
          ${p.ho ? `<tr><td>Home office no mês</td><td class="num ${p.ho.limite && p.ho.homeOffice >= p.ho.limite ? 'neg' : ''}">${p.ho.homeOffice}${p.ho.limite ? ' de ' + p.ho.limite : ''} · ${p.ho.diasPonto} dia(s) com ponto</td></tr>` : ''}
          <tr><td>Última 1:1</td><td class="num">${p.ultima1a1 ? W.dataBR(p.ultima1a1.data) : '<span class="neg">nenhuma</span>'}</td></tr></tbody></table>
        <div class="btns" style="margin-top:10px"><button class="btn sm" data-nota="${esc(p.nome)}">Registrar 1:1</button></div></div></div>`).join('')}</div>
      <div class="box"><div class="box-h"><h2>Anotações de 1:1, feedbacks e PDI</h2><span class="note">só RH e diretoria veem</span></div>
        ${notas.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Pessoa</th><th>Tipo</th><th>O que foi conversado</th><th>Combinados</th><th>Próxima</th></tr></thead><tbody>${notas.slice(0, 40).map(n => `<tr><td class="mono">${W.dataBR(n.data)}</td><td>${esc(H.nomeUsuario(n.pessoa))}</td><td>${esc({ '1a1': '1:1', feedback: 'Feedback', pdi: 'PDI' }[n.tipo] || n.tipo)}</td><td>${esc(n.texto || '')}</td><td>${esc(n.combinados || '')}</td><td class="mono">${n.proxima ? W.dataBR(n.proxima) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nenhuma anotação ainda.</p>'}</div>`;
    el.querySelector('#rmes').onchange = e => { mesRH = e.target.value || mesRH; atividadeCache.dados = null; analise = null; H.render(); };
    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => H.ir(b.dataset.ir));
    el.querySelector('#rnota').onclick = () => anotar('');
    el.querySelectorAll('[data-nota]').forEach(b => b.onclick = () => anotar(b.dataset.nota));
    el.querySelector('#ria').onclick = async () => {
      const b = el.querySelector('#ria'); b.disabled = true; b.textContent = 'Analisando…';
      const dados = { mes: mesRH, pessoas: pessoas.map(p => ({ nome: p.nome, funcao: p.perfil.nome, nota: p.pr.total, pilares: p.pr.partes, metricasFuncao: p.pr.funcao.map(f => ({ metrica: f.l, valor: f.b == null ? f.a : `${f.a} de ${f.b}` })),
        minutosPorDia: Math.round(p.media), diasAtivos: p.diasAtivos, areas: p.areas.slice(0, 4).map(a => `${a.k} ${Math.round(a.pct * 100)}%`), tarefasVencidas: p.atrasadas, erros: p.pr.erros.map(e => e.texto),
        anotacoes: notas.filter(n => n.pessoa === p.nome).slice(0, 4).map(n => ({ data: n.data, tipo: n.tipo, texto: n.texto, combinados: n.combinados })) })), climaMedio: pulsoMedio };
      try { const r = await H.api('/api/ia/rh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dados }) }); const j = await r.json();
        if (!j.success) throw new Error(j.message || 'IA indisponível'); analise = j.analise; H.render(); }
      catch (e) { b.disabled = false; b.textContent = 'Análise da IA'; H.toast(esc(e.message)); }
    };
  };

  function anotar(pessoa) {
    const ks = Object.keys(H.db.users || {}).filter(k => !['contador'].includes(W.perfilDe(H.db, k).id)).map(k => H.nomeUsuario(k));
    const m = H.modal('Anotação de RH', `<div class="fields"><div class="f"><label class="lbl" for="np">Pessoa</label><select id="np">${ks.map(n => `<option ${n === pessoa ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="f"><label class="lbl" for="nt">Tipo</label><select id="nt"><option value="1a1">1:1</option><option value="feedback">Feedback</option><option value="pdi">PDI (plano de desenvolvimento)</option></select></div>
      <div class="f"><label class="lbl" for="nd">Data</label><input id="nd" type="date" value="${W.hojeISO()}"></div><div class="f"><label class="lbl" for="nx">Próxima conversa</label><input id="nx" type="date"></div>
      <div class="f w4"><label class="lbl" for="nc">O que foi conversado</label><textarea id="nc" rows="4"></textarea></div><div class="f w4"><label class="lbl" for="nb">Combinados</label><textarea id="nb" rows="2"></textarea></div></div>
      <p class="note" style="margin-top:8px">Fica visível só para o RH e a diretoria. Evite dados de saúde ou da vida pessoal.</p>`, '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="nok">Guardar</button>');
    m.querySelector('#nok').onclick = () => {
      const v = s => m.querySelector(s).value.trim(); if (!v('#nc')) { H.toast('Escreva o que foi conversado'); return; }
      if (!Array.isArray(H.db.hubRH)) H.db.hubRH = [];
      H.db.hubRH.unshift({ _id: W.novoId(), tipo: v('#nt'), pessoa: v('#np'), data: v('#nd'), proxima: v('#nx'), texto: v('#nc'), combinados: v('#nb'), por: eu(), em: new Date().toISOString() });
      H.salvar(); H.fecharModal(); H.toast('Anotação guardada'); H.render();
    };
  }

  /* ================= CULTURA WINDGATE ================= */
  const CULTURA_RASCUNHO = { rascunho: true,
    missao: 'Tornar a importação simples, segura e lucrativa para empresas do Nordeste, cuidando de cada etapa, da fábrica ao cliente.',
    visao: 'Ser a trading de referência do Norte e Nordeste em importação completa.',
    valores: [['Senso de dono', 'Cada operação é tratada como se o dinheiro fosse nosso. Quem pega, leva até o fim.'], ['Erro zero', 'Conferir duas vezes antes de enviar: documento, custo, NCM e prazo.'],
      ['Prazo é compromisso', 'Data combinada é data cumprida; se vai atrasar, avisar antes.'], ['Transparência com o cliente', 'O cliente sabe em que etapa está e o que vem a seguir, sem surpresa.'],
      ['Aprender antes de cobrar', 'Treinamos antes de bonificar; erro vira processo melhor, não culpa.'], ['Comunicação clara e curta', 'Mensagem objetiva, no canal certo, com o próximo passo.']] };
  H.telas.cultura = function (el) {
    const db = H.db, c = (db.hubPainel || {})._cultura || CULTURA_RASCUNHO, meu = (db.hubPainel || {})['_aceite_' + H.userKey];
    const pode = H.pode('cultura.editar'), todos = Object.keys(db.users || {}).filter(k => W.perfilDe(db, k).id !== 'contador');
    el.innerHTML = `<div class="head"><div><h1>Cultura WindGate</h1><p class="sub">Quem somos, para onde vamos e como trabalhamos. Vale para todos, todos os dias.</p></div><div class="btns">${pode ? '<button class="btn" id="cedit">Editar</button>' : ''}</div></div>
      ${c.rascunho ? '<div class="banner">Rascunho montado a partir do que o Samir já definiu (senso de dono, erro zero, treinar antes de bonificar). A Oneide e o Samir validam e editam antes de valer.</div>' : ''}
      <div class="cult"><div class="box cult-m"><span class="lbl">Missão</span><p>${esc(c.missao)}</p></div><div class="box cult-m"><span class="lbl">Visão</span><p>${esc(c.visao)}</p></div></div>
      <div class="cult-v">${(c.valores || []).map(([n, d], i) => `<div class="box cult-c"><span class="cult-n">${i + 1}</span><b>${esc(n)}</b><p>${esc(d)}</p></div>`).join('')}</div>
      <div class="box"><div class="box-h"><h2>Meu compromisso</h2></div><div class="box-b">${meu ? `<p>Você leu e se comprometeu com a cultura em ${W.dataBR(meu.em)}.</p>` : '<p>Leia a missão, a visão e os valores. Eles orientam decisões, contratações e a nota de Cultura na Produtividade.</p><button class="btn pri" id="caceito" style="margin-top:8px">Li e me comprometo</button>'}
        ${pode ? `<p class="note" style="margin-top:10px">Compromissos: ${todos.filter(k => (db.hubPainel || {})['_aceite_' + k]).map(k => esc(H.nomeUsuario(k))).join(', ') || 'nenhum ainda'}. Faltam: ${todos.filter(k => !(db.hubPainel || {})['_aceite_' + k]).map(k => esc(H.nomeUsuario(k))).join(', ') || 'ninguém'}.</p>` : ''}</div></div>`;
    const a = el.querySelector('#caceito'); if (a) a.onclick = () => { db.hubPainel['_aceite_' + H.userKey] = { em: new Date().toISOString(), versao: c.em || 'rascunho' }; H.salvar(); H.toast('Compromisso registrado'); H.render(); };
    const e = el.querySelector('#cedit'); if (e) e.onclick = () => editarCultura(c);
  };
  function editarCultura(c) {
    const m = H.modal('Editar cultura', `<div class="fields"><div class="f w4"><label class="lbl" for="em">Missão</label><textarea id="em" rows="2">${esc(c.missao)}</textarea></div><div class="f w4"><label class="lbl" for="ev">Visão</label><textarea id="ev" rows="2">${esc(c.visao)}</textarea></div>
      <div class="f w4"><label class="lbl" for="evl">Valores (um por linha: nome | o que significa na prática)</label><textarea id="evl" rows="8">${esc((c.valores || []).map(([n, d]) => n + ' | ' + d).join('\n'))}</textarea></div>
      <div class="f w4"><label class="lbl"><input type="checkbox" id="erasc" ${c.rascunho ? 'checked' : ''} style="width:auto"> Ainda é rascunho</label></div></div>`, '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="eok">Salvar</button>');
    m.querySelector('#eok').onclick = () => {
      const valores = m.querySelector('#evl').value.split('\n').map(l => l.split('|').map(x => x.trim())).filter(x => x[0]).map(([n, d]) => [n, d || '']);
      H.db.hubPainel._cultura = { missao: m.querySelector('#em').value.trim(), visao: m.querySelector('#ev').value.trim(), valores, rascunho: m.querySelector('#erasc').checked, em: new Date().toISOString(), por: eu() };
      H.salvar(); H.fecharModal(); H.toast('Cultura atualizada'); H.render();
    };
  }
})();
