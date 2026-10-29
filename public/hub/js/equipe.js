/* Hub 2.0 — Equipe & Acessos e Configurações.
   Equipe: estrutura oficial (organograma, funções, report, trilha) para quem
   tinha a aba Equipe; pessoas, PINs, perfis do Hub e abas do sistema atual só
   para quem tinha a aba Configurações (users[k].config ou o Samir).
   Configurações: backup (exportar; importar SÓ acrescentando), prazos por
   etapa e o escritório do ponto.
   Todo registro de usuário é editado no lugar (W.editarUsuario): campo que o
   Hub não conhece sobrevive, e o /antigo continua lendo o mesmo formato. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  let aba = 'estrutura';

  const gestor = () => W.podeGerirEquipe(H.db, H.userKey);
  const negado = (el, titulo) => { el.innerHTML = `<div class="head"><div><h1>${esc(titulo)}</h1></div></div><div class="banner">Esta área é de quem administra os acessos (Configurações do sistema atual).</div>`; };

  /* ---------- Estrutura oficial (mesmo conteúdo da aba Equipe do sistema atual) ---------- */
  const ORG = {
    topo: [['Samir Fernandes', 'Fundador · Direção Geral', 'Supervisiona o todo · crescimento da empresa e da equipe · aprovações e decisões finais', ''],
      ['Valdir', 'Sócio · Comercial Estratégico', 'Novos clientes · feiras · governo · networking (fora do operacional até dez/26)', '']],
    lider: [['Davi', 'Líder Operacional · Pricing, Financeiro & NF', 'Ponto de report de toda a equipe no dia a dia — o que precisar de decisão maior, leva ao Samir', 'Referência: números & operação']],
    equipe: [['Ívina', 'Canal Oficial de Comunicação · Docs & Atendimento', 'Voz da WindGate com o cliente · documentação · conteúdo com a Darielly', 'Referência: documentos & cliente'],
      ['Matheus', 'Estagiário de Logística · Frete & Tracking', 'Cotações de frete · tracking e mapa · preços semanais dos armadores', 'Aprende com Davi e Ívina']],
    apoio: [['Pedro', 'Contador · Apoio Fiscal', 'Fechamento trimestral e balancetes · apoia o Davi na emissão de NF (Mylo)', ''],
      ['Darielly', 'Marketing · Estrutura Externa', 'Pautas, roteiros e posts · conteúdo gravado por Ívina e Davi', '']]
  };
  const FUNCOES = [
    ['Samir', 'Fundador · Direção Geral', ['Supervisiona o todo — pessoas, operações e resultado', 'Crescimento da empresa e desenvolvimento da equipe', 'Aprova margens no Cota e decisões finais das negociações', 'Comercial e estratégia (com Valdir no estratégico)', 'Exceções: só chega a ele o que o Davi não resolve']],
    ['Davi', 'Líder Operacional · Pricing, Financeiro & NF · efetivado', ['Ponto de report da equipe: organiza o dia a dia e destrava o operacional', 'Cotações e precificação no WindGate Cota (margem aprovada pelo Samir)', 'Financeiro: baixas diárias + atualização financeira aos clientes', 'Emissão de notas fiscais no Mylo quando a importação chega (com apoio do Pedro)', 'Sourcing China (playbook + pesquisa assistida)', 'Automações internas — dono técnico do sistema', 'Vídeos de marketing (pauta da Darielly)']],
    ['Ívina', 'Canal Oficial de Comunicação · Analista de Comex Jr · 8h–18h', ['Canal oficial da WindGate: toda comunicação com clientes passa por ela', 'Conteúdo de marketing junto com a Darielly (gravações, dia a dia, bastidores)', 'Dona do checklist documental — coleta proativa de cada documento', 'Interface com despachante · checklist ICMS-AL', 'Base de clientes única e atualizada', 'Agenda e ClickUp organizados (fonte única)']],
    ['Matheus', 'Estagiário de Logística · Frete & Tracking · 8h–13h', ['Cotações e negociação de frete (lista fechada de agentes + benchmark)', 'Tracking das operações e mapa atualizado', 'Preços semanais dos armadores (Maersk, Hapag, CMA) registrados', 'Aprendizado de documentação com a Ívina', 'Contato com cliente supervisionado em assuntos de frete/prazo']],
    ['Pedro', 'Contador · Estrutura de Apoio', ['Fechamento trimestral da empresa e todos os balancetes', 'Apoio ao Davi na emissão de notas fiscais (Mylo)', 'Suporte fiscal/contábil às operações']],
    ['Darielly', 'Marketing · Estrutura Externa', ['Estratégia de conteúdo, pautas e roteiros', 'Posts e gestão do Instagram', 'Direciona as gravações de Ívina e Davi']]
  ];
  const TRILHA = [['Estagiário → Analista Jr', '6+ meses · domínio da própria área sem retrabalho · zero erro em 5 operações seguidas na sua função'],
    ['Analista Jr → Pleno', 'Autonomia total na área · treina outra pessoa · propõe e implanta 1 melhoria de processo'],
    ['Pleno → Coordenador', 'Responde por resultado de área · lidera o Gestor do Mês com metas batidas · decide sem escalar o rotineiro']];

  const cartao = ([n, t, d, rf], tracejado) => `<div class="box" style="margin:0;${tracejado ? 'border-style:dashed' : ''}"><div class="box-b"><b>${esc(n)}</b><div class="note" style="color:var(--blue);margin:2px 0 6px">${esc(t)}</div><p style="font-size:13px">${esc(d)}</p>${rf ? `<p class="note" style="margin-top:6px">${esc(rf)}</p>` : ''}</div></div>`;
  function estruturaHtml() {
    const nivel = (l, tr) => `<div class="g2" style="${l.length === 1 ? 'grid-template-columns:minmax(0,1fr);max-width:520px;margin:0 auto 12px' : 'grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:12px'}">${l.map(c => cartao(c, tr)).join('')}</div>`;
    return `<div class="box"><div class="box-h"><h2>Organograma</h2><span class="note">fluxo de report: equipe → Davi → (decisão maior) → Samir</span></div><div class="box-b">
        ${nivel(ORG.topo)}<div style="text-align:center" class="note">↓</div>${nivel(ORG.lider)}<div style="text-align:center" class="note">↓</div>${nivel(ORG.equipe)}
        <h3 class="h3" style="margin-top:6px">Estrutura de apoio</h3>${nivel(ORG.apoio, true)}</div></div>
      <div class="g3">${FUNCOES.map(([n, s, faz]) => `<div class="box"><div class="box-h"><h2>${esc(n)}</h2></div><div class="box-b"><p class="note" style="margin-bottom:8px">${esc(s)}</p><h3 class="h3">Faz</h3><ul class="rl">${faz.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div></div>`).join('')}</div>
      <div class="box"><div class="box-h"><h2>Como funciona o report</h2></div><div class="box-b list">
        <div class="row"><span><b>1. Dia a dia:</b> Ívina e Matheus reportam ao Davi — dúvidas, pendências e andamento.</span></div>
        <div class="row"><span><b>2. Decisão maior:</b> o que envolver margem, exceção ou risco, o Davi leva ao Samir.</span></div>
        <div class="row"><span><b>3. Senso de dono:</b> cada um é responsável pela sua área de ponta a ponta — o report não tira a responsabilidade, organiza.</span></div>
        <div class="row"><span><b>Fiscal:</b> NF é do Davi com apoio do Pedro · <b>Conteúdo:</b> pauta da Darielly, gravação de Ívina e Davi.</span></div></div></div>
      <div class="box"><div class="box-h"><h2>Trilha de crescimento</h2><span class="note">publicada para o time</span></div>
        <div class="tw"><table><thead><tr><th>Nível</th><th>Critérios objetivos para subir</th></tr></thead><tbody>${TRILHA.map(([n, c]) => `<tr><td><b>${esc(n)}</b></td><td>${esc(c)}</td></tr>`).join('')}</tbody></table></div>
        <div class="box-b"><p class="note">Rituais: <b>Gestor do Mês</b> (rotação — Ívina entra após ~3 meses) · conversa individual a cada 6 meses · critérios de efetivação do Matheus publicados.</p></div></div>`;
  }

  /* ---------- Pessoas & acessos ---------- */
  const perfilNome = k => { const u = (H.db.users || {})[k] || {}, p = W.perfilDe(H.db, k); return esc(p.nome) + (u.perfilHub ? '' : ' <span class="note">(automático)</span>'); };
  const sim = v => v ? '<span class="pill ok">sim</span>' : '<span class="note">—</span>';
  function pessoasHtml() {
    const us = H.db.users || {};
    return `<div class="box"><div class="box-h"><h2>Pessoas, PINs e permissões</h2><div class="btns"><button class="btn blue sm" id="eqNovo">+ Nova pessoa</button></div></div>
      <div class="tw"><table><thead><tr><th>Pessoa</th><th>Papel</th><th>Perfil no Hub</th><th>PIN</th><th>Financeiro</th><th>Aprova margem</th><th>Configurações</th><th>Abas no sistema atual</th><th></th></tr></thead><tbody>
      ${Object.entries(us).filter(([, u]) => u && typeof u === 'object').map(([k, u]) => `<tr>
        <td><span style="display:inline-flex;gap:8px;align-items:center"><span class="av mini" style="background:${esc(W.corValida(u.cor) ? u.cor : '#2563EB')}">${esc((u.nome || k)[0] || '?')}</span><span><b>${esc(u.nome || k)}</b><br><small class="note mono">${esc(k)}</small></span></span></td>
        <td class="note">${esc(u.papel || '')}</td><td>${perfilNome(k)}</td>
        <td>${u.temPin || u.pin ? '<span class="pill ok">definido</span>' : '<span class="pill warn">sem PIN</span>'}</td>
        <td>${sim(u.fin)}</td><td>${sim(u.aprova)}</td><td>${sim(u.config || k === 'samir')}</td>
        <td class="note">${Array.isArray(u.tabs) ? u.tabs.length + ' aba(s)' : 'todas'}</td>
        <td class="num"><button class="btn sm" data-ed="${esc(k)}">Editar</button></td></tr>`).join('')}</tbody></table></div>
      <div class="box-b"><p class="note">O PIN é conferido no servidor no login e não sai dele: ninguém vê o PIN de ninguém, só se está definido. Para trocar, edite a pessoa e digite o novo. O sistema atual (/antigo) aceita só 4 dígitos na tela de entrada — PIN maior funciona apenas no Hub. Aprovação de margem e acesso às Configurações só o Samir concede. Pessoa não se exclui por aqui: a sincronização não leva exclusão de usuário — peça ao Davi.</p></div></div>`;
  }

  function formUsuario(k, u) {
    const novo = !k, eu = k === H.userKey, samir = H.userKey === 'samir';
    const tabs = Array.isArray(u.tabs) ? u.tabs : W.ABAS_LEGADO.map(a => a[0]);
    const padrao = W.PERFIS[W.PERFIL_PADRAO[k] || (u.fin ? 'operacoes' : 'documentos')];
    return `<div class="fields">
      <div class="f w2"><label class="lbl" for="uNome">Nome</label><input id="uNome" value="${esc(u.nome || '')}"></div>
      ${novo ? '<div class="f"><label class="lbl" for="uChave">Identificador (login)</label><input id="uChave" placeholder="gerado do nome"></div>' : `<div class="f"><span class="lbl">Identificador</span><span class="ro mono">${esc(k)}</span></div>`}
      <div class="f"><label class="lbl" for="uCor">Cor</label><input id="uCor" type="color" value="${esc(W.corValida(u.cor) ? u.cor : '#2563EB')}"></div>
      <div class="f w2"><label class="lbl" for="uPapel">Papel (aparece no login)</label><input id="uPapel" value="${esc(u.papel || '')}"></div>
      <div class="f"><label class="lbl" for="uPin">${novo ? 'PIN' : 'Novo PIN'}</label><input id="uPin" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="${novo ? '4 a 8 números' : 'vazio = manter'}"></div>
      <div class="f"><label class="lbl" for="uPerfil">Perfil no Hub</label><select id="uPerfil"><option value="">Automático${padrao && !novo ? ' (' + esc(padrao.nome) + ')' : ''}</option>${Object.entries(W.PERFIS).map(([id, p]) => `<option value="${esc(id)}" ${u.perfilHub === id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
      </div>
      <p class="note" id="uPerfilFoco" style="margin-top:6px"></p>
      <h3 class="h3" style="margin-top:14px">Permissões</h3>
      <div class="list">
        <label class="row"><span><b>Financeiro</b><br><small class="note">vê e lança no financeiro do sistema atual; libera a aba Financeiro e o ajuste de prazos por etapa</small></span><input type="checkbox" id="uFin" style="width:auto" ${u.fin ? 'checked' : ''} ${k === 'samir' ? 'disabled' : ''}></label>
        <label class="row"><span><b>Aprova margem</b><br><small class="note">aprova cotações no Cota${samir ? '' : ' · só o Samir concede'}</small></span><input type="checkbox" id="uAprova" style="width:auto" ${u.aprova ? 'checked' : ''} ${samir ? '' : 'disabled'}></label>
        <label class="row"><span><b>Configurações</b><br><small class="note">administra pessoas, PINs, backup e acessos${samir ? '' : ' · só o Samir concede'}</small></span><input type="checkbox" id="uConfig" style="width:auto" ${u.config || k === 'samir' ? 'checked' : ''} ${samir && k !== 'samir' ? '' : 'disabled'}></label>
      </div>
      <h3 class="h3" style="margin-top:14px">Abas no sistema atual (/antigo)</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${W.ABAS_LEGADO.map(([t, l]) => `<label class="chip"><input type="checkbox" data-aba="${esc(t)}" style="width:auto" ${tabs.includes(t) ? 'checked' : ''} ${t === 'fin' ? 'disabled' : ''}> ${esc(l)}</label>`).join('')}</div>
      <p class="note" style="margin-top:6px">A aba Ponto é de todo mundo e não precisa ser marcada. A aba Financeiro acompanha a permissão de Financeiro.${eu ? ' Você está editando o seu próprio acesso.' : ''}</p>`;
  }

  function lerForm(m) {
    const v = s => m.querySelector(s);
    return { nome: v('#uNome').value, papel: v('#uPapel').value, cor: v('#uCor').value, pin: v('#uPin').value.trim(), perfilHub: v('#uPerfil').value,
      fin: v('#uFin').checked, aprova: v('#uAprova').checked, config: v('#uConfig').checked,
      tabs: Array.from(m.querySelectorAll('[data-aba]')).filter(c => c.checked).map(c => c.dataset.aba) };
  }
  function focoPerfil(m) {
    const s = m.querySelector('#uPerfil'), p = m.querySelector('#uPerfilFoco');
    const at = () => { const x = W.PERFIS[s.value]; p.innerHTML = x ? esc(x.foco) + (x.externo ? ' <b>Acesso externo: vê só Fiscal, NF-e e o chat da contabilidade.</b>' : x.restrito ? ' <b>Perfil restrito: sem operação comercial nem financeiro.</b>' : '') : 'Perfil pelo padrão da pessoa (ou Financeiro → Operações; sem Financeiro → Documentação).'; };
    s.onchange = at; at();
  }

  function editar(k) {
    const u = (H.db.users || {})[k]; if (!u) { H.toast('Pessoa não encontrada'); return; }
    const m = H.modal('Editar acesso · ' + (u.nome || k), formUsuario(k, u), '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="uOk">Salvar</button>');
    m.querySelector('.modal').classList.add('larga'); focoPerfil(m);
    m.querySelector('#uOk').onclick = () => {
      const mud = lerForm(m), novoPin = mud.pin; delete mud.pin;
      if (novoPin && !W.pinValido(novoPin)) { H.toast('PIN com 4 a 8 números.'); return; }
      if (k === 'samir') delete mud.fin;
      // Concessões que a pessoa não pode dar não vão no pedido (o checkbox está travado).
      if (!W.podeConcederTudo(H.userKey)) { delete mud.aprova; delete mud.config; }
      if (k === 'samir') delete mud.config;
      const r = W.editarUsuario(u, mud, { editor: H.userKey, chave: k });
      if (!r.ok) { H.toast(esc(r.erros.join(' '))); return; }
      H.fecharModal();
      if (novoPin) trocarPin(k, novoPin, u);
      if (!r.mudou.length) { if (!novoPin) H.toast('Nada mudou'); return; }
      H.salvar();
      H.toast('Acesso atualizado');
      if (k === H.userKey) H.toast('Seu acesso mudou — saia e entre de novo para o menu refletir.');
      H.render();
    };
  }

  /* PIN não viaja no banco: vai direto ao servidor, que confere quem pode trocar. */
  async function trocarPin(k, pin, u) {
    try {
      const r = await H.api('/api/usuarios/' + encodeURIComponent(k) + '/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) { H.toast('PIN não trocado: ' + esc(j.message || 'falhou')); return; }
      u.temPin = true; H.toast(`PIN de ${esc((u.nome || k).split(' ')[0])} atualizado`); H.render();
    } catch (e) { if (e.message !== '401') H.toast('PIN não trocado: sem conexão.'); }
  }

  function nova() {
    const m = H.modal('Nova pessoa', formUsuario(null, { tabs: ['painel', 'mapa', 'agenda', 'gestao', 'org'] }), '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="uOk">Criar</button>');
    m.querySelector('.modal').classList.add('larga'); focoPerfil(m);
    const ch = m.querySelector('#uChave');
    m.querySelector('#uNome').oninput = e => { if (!ch.dataset.mexeu) ch.value = W.chaveDeNome(e.target.value); };
    ch.oninput = () => { ch.dataset.mexeu = '1'; };
    m.querySelector('#uOk').onclick = () => {
      const d = Object.assign(lerForm(m), { chave: ch.value.trim() });
      const r = W.novoUsuario(H.db, d);
      if (!r.ok) { H.toast(esc(r.erros.join(' '))); return; }
      if (W.podeConcederTudo(H.userKey)) { r.usuario.aprova = !!d.aprova; r.usuario.config = !!d.config; }
      H.db.users[r.chave] = r.usuario;
      H.salvar(); H.fecharModal(); H.toast(`${esc(r.usuario.nome)} cadastrado(a). Entra com o identificador <b>${esc(r.chave)}</b> e o PIN escolhido.`); H.render();
    };
  }

  H.telas.equipe = function (el) {
    if (!W.podeVerEquipe(H.db, H.userKey)) { negado(el, 'Equipe & Acessos'); return; }
    const g = gestor(); if (!g) aba = 'estrutura';
    el.innerHTML = `<div class="head"><div><h1>Equipe & Acessos</h1><p class="sub">Estrutura oficial — fluxo de report: equipe → Davi → (decisão maior) → Samir. Todos com senso de dono.</p></div></div>
      ${g ? `<div class="tabs" role="tablist" style="margin-bottom:14px"><button role="tab" data-aba="estrutura" aria-selected="${aba === 'estrutura'}">Estrutura & funções</button><button role="tab" data-aba="pessoas" aria-selected="${aba === 'pessoas'}">Pessoas & acessos</button></div>` : ''}
      ${aba === 'pessoas' && g ? pessoasHtml() : estruturaHtml()}`;
    el.querySelectorAll('[role=tab]').forEach(b => b.onclick = () => { aba = b.dataset.aba; H.render(); });
    const n = el.querySelector('#eqNovo'); if (n) n.onclick = nova;
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editar(b.dataset.ed));
  };

  /* ================= CONFIGURAÇÕES ================= */
  H.telas.config = function (el) {
    if (!gestor()) { negado(el, 'Configurações'); return; }
    const podePrazos = W.podeAjustarPrazos(H.db, H.userKey);
    const etapas = W.STATUS_OP.filter(x => !['entregue', 'concluida', 'travada'].includes(x.k));
    const cfgPrazo = (H.db.settings || {}).prazosStatus || {};
    el.innerHTML = `<div class="head"><div><h1>Configurações</h1><p class="sub">Backup, prazos por etapa e o escritório do ponto. Pessoas, PINs e permissões ficam em Equipe & Acessos.</p></div>
        <div class="btns"><button class="btn" id="cfEquipe">Pessoas, PINs e permissões</button></div></div>
      <div class="g2">
        <div class="box"><div class="box-h"><h2>Backup & dados</h2></div><div class="box-b">
          <div class="btns"><button class="btn blue" id="cfExp">Exportar backup completo (JSON)</button><label class="btn" style="cursor:pointer">Importar backup (só acrescenta)<input type="file" id="cfImp" accept=".json,application/json" style="display:none"></label></div>
          <p class="note" style="margin-top:10px">O banco fica no servidor central e é salvo sozinho. Exporte o backup 1× por semana (sexta) e guarde no Drive — é o seguro contra qualquer acidente. O arquivo não leva os PINs (eles não saem do servidor); o histórico cifrado do servidor guarda tudo. Mesmo assim, guarde em pasta restrita: tem clientes e financeiro.</p>
          <p class="note" style="margin-top:6px">A importação daqui <b>nunca substitui nem apaga</b>: só acrescenta o que não existe no banco (registros e chaves novas). Registros excluídos de propósito não voltam. Restaurar o banco inteiro de uma data é feito pelo histórico do servidor — peça ao Davi.</p></div></div>
        <div class="box"><div class="box-h"><h2>Ponto · escritório e raio</h2></div><div class="box-b">
          <p class="note" style="margin-bottom:10px">Com o local cadastrado, cada ponto sai marcado como dentro ou fora do escritório. Só a diretoria altera.</p>
          <button class="btn" id="cfPonto">Escritório e raio</button></div></div></div>
      <div class="box"><div class="box-h"><h2>Prazos por etapa</h2><span class="note">${podePrazos ? 'dias corridos' : 'só quem tem Financeiro ajusta'}</span></div>
        <div class="box-b"><p class="note">Dias corridos que cada etapa deveria levar. A Torre fica em atenção perto do prazo e em atraso depois de estourar. Vazio ou zero = etapa sem prazo (conta os dias, não cobra atraso).</p></div>
        <div class="tw"><table><thead><tr><th>Etapa</th><th>Prazo (dias)</th><th>Padrão</th></tr></thead><tbody>
        ${etapas.map(x => { const v = W.prazoAlvo(H.db, x.k); return `<tr><td>${H.pillStatus(x.k)}</td><td><input class="inp" type="number" min="0" step="1" data-pz="${esc(x.k)}" value="${v == null ? '' : v}" placeholder="sem prazo" style="width:110px" ${podePrazos ? '' : 'disabled'}>${cfgPrazo[x.k] != null ? '' : ' <span class="note">padrão</span>'}</td><td class="note">${W.PRAZO_STATUS[x.k] ? 'padrão ' + W.PRAZO_STATUS[x.k] : 'sem padrão'}</td></tr>`; }).join('')}</tbody></table></div>
        <div class="box-b"><div class="fields"><div class="f"><label class="lbl" for="pzRep">Recobrança do atraso (dias)</label><input id="pzRep" type="number" min="1" value="${W.repeteAtraso(H.db)}" ${podePrazos ? '' : 'disabled'}></div></div>
          <p class="note" style="margin-top:6px">Depois de estourar, a notificação do sistema atual volta a cada ${W.repeteAtraso(H.db)} dia(s) enquanto a operação seguir atrasada.</p>
          ${podePrazos ? '<div class="btns" style="margin-top:10px"><button class="btn blue" id="pzOk">Salvar prazos</button></div>' : ''}</div></div>`;
    el.querySelector('#cfEquipe').onclick = () => { aba = 'pessoas'; H.ir('equipe'); };
    el.querySelector('#cfExp').onclick = exportar;
    el.querySelector('#cfImp').onchange = e => importar(e.target);
    el.querySelector('#cfPonto').onclick = () => H.pontoConfigModal ? H.pontoConfigModal() : H.toast('Módulo do ponto não carregado');
    const pz = el.querySelector('#pzOk'); if (pz) pz.onclick = () => salvarPrazos(el, pz);
  };

  function exportar() {
    const blob = new Blob([W.textoBackup(H.db)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = W.nomeBackup(W.hojeISO());
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    H.toast('Backup exportado — guarde no Drive');
  }

  function importar(inp) {
    const f = inp.files && inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      inp.value = '';
      let bk; try { bk = JSON.parse(r.result); } catch (e) { H.toast('Arquivo inválido'); return; }
      const prev = W.importarBackup(H.db, bk, false);
      if (prev.erro) { H.toast(esc(prev.erro)); return; }
      const linhas = Object.entries(prev.colecoes).map(([k, n]) => `<tr><td class="mono">${esc(k)}</td><td class="num">${n} registro(s)</td></tr>`)
        .concat(Object.entries(prev.objetos).map(([k, n]) => `<tr><td class="mono">${esc(k)}</td><td class="num">${n} chave(s)</td></tr>`)).join('');
      const m = H.modal('Importar backup · só acrescentar', `<p style="margin-bottom:10px">Arquivo <b>${esc(f.name)}</b>. Nada do que já existe será alterado ou apagado.</p>
        ${prev.total ? `<div class="tw"><table class="mini"><tbody>${linhas}</tbody></table></div>` : '<div class="banner ok">Tudo o que está no arquivo já existe no banco. Nada a importar.</div>'}
        <p class="note" style="margin-top:10px">${prev.jaExistiam} item(ns) já existiam e ficam como estão.${prev.excluidos ? ` ${prev.excluidos} registro(s) excluídos de propósito não voltam.` : ''}${prev.ignorados.length ? ` Fora da importação: ${esc(prev.ignorados.join(', '))}.` : ''}</p>`,
        `<button class="btn" data-x>Cancelar</button>${prev.total ? `<button class="btn blue" id="impOk">Acrescentar ${prev.total} item(ns)</button>` : ''}`);
      const ok = m.querySelector('#impOk');
      if (ok) ok.onclick = () => {
        const res = W.importarBackup(H.db, bk, true);
        H.salvar(); H.fecharModal(); H.toast(`Backup importado: ${res.total} item(ns) acrescentado(s).`); H.render();
      };
    };
    r.readAsText(f);
  }

  /* `settings` é mesclado por chave (servidor e sincronização do Hub): grava só
     prazosStatus e repeteAtrasoDias, e schema, flags e o resto ficam como estão. */
  function salvarPrazos(el, btn) {
    if (!W.podeAjustarPrazos(H.db, H.userKey)) { H.toast('Sem permissão para ajustar prazos'); return; }
    const ent = {}; el.querySelectorAll('[data-pz]').forEach(i => { ent[i.dataset.pz] = i.value; });
    const n = W.normalizarPrazos(ent, el.querySelector('#pzRep').value);
    if (!H.db.settings || typeof H.db.settings !== 'object') H.db.settings = {};
    H.db.settings.prazosStatus = Object.assign({}, H.db.settings.prazosStatus, n.prazosStatus);
    H.db.settings.repeteAtrasoDias = n.repeteAtrasoDias;
    btn.disabled = true;
    H.salvar(); H.toast('Prazos atualizados'); H.render();
  }
})();
