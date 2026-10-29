/* =====================================================================
   WindGate Hub 2.0 — Equipe, acessos, configurações e ponto (sem tela).

   Usuários, PINs, abas do sistema atual, perfil do Hub, backup e a lógica
   do botão de ponto. O formato dos dados é EXATAMENTE o do sistema atual
   (/antigo continua lendo o que o Hub grava): edição sempre no próprio
   registro, sem renomear nem apagar campo — o que o Hub não conhece, como
   `opStatus`, sobrevive intacto.

   Mesmo formato de módulo do regras.js: roda no navegador (window.WG) e no
   Node (require), para ser testado.
   ===================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./regras.js'));
  else Object.assign(raiz.WG, fabrica(raiz.WG));
})(typeof self !== 'undefined' ? self : this, function (W) {

  /* ---------- Abas do sistema atual (users[k].tabs) ---------- */
  /* Mesma lista e ordem do TABS do sistema atual. 'ponto' não entra: a aba é de
     todo mundo e o sistema atual a acrescenta sozinho no login. */
  const ABAS_LEGADO = [
    ['painel', 'Torre de Controle'], ['mapa', 'Mapa & Tracking'], ['checklist', 'Documentos'], ['frete', 'Fretes'],
    ['cotacoes', 'Cotações'], ['crm', 'CRM & Clientes'], ['sourcing', 'Sourcing China'], ['parceiros', 'Fornecedores'],
    ['fin', 'Financeiro'], ['agenda', 'Agenda'], ['gestao', 'Gestão do Mês'], ['org', 'Equipe'], ['config', 'Configurações']
  ];

  /* ---------- Quem pode o quê ---------- */
  const usuario = (db, k) => (db && db.users && db.users[k]) || null;
  /** Configurações e gestão de acessos: quem tinha a aba Configurações no sistema atual. */
  function podeGerirEquipe(db, k) {
    const u = usuario(db, k);
    return !!(u && (u.config || k === 'samir'));
  }
  /** Estrutura da equipe: quem tinha a aba Equipe (ou não tem lista de abas gravada). */
  function podeVerEquipe(db, k) {
    const u = usuario(db, k);
    if (!u) return false;
    return podeGerirEquipe(db, k) || !Array.isArray(u.tabs) || u.tabs.includes('org');
  }
  /** Relatório do ponto: mesma regra do servidor (diretoria do PONTO_DIRETORIA ou perfil RH). */
  const podeRelatorioPonto = (db, k, ehDiretoria) => !!ehDiretoria || (!!usuario(db, k) && W.perfilDe(db, k).id === 'rh');
  /** Aprovar margem e dar acesso às Configurações: só o Samir concede. */
  const podeConcederTudo = k => k === 'samir';
  /** Prazos por etapa: mesma regra do sistema atual (podeAjustarStatus = USER.fin). */
  const podeAjustarPrazos = (db, k) => !!(usuario(db, k) || {}).fin;

  /* ---------- Edição de usuário ---------- */
  const CAMPOS_TEXTO = ['nome', 'papel', 'cor'];
  const pinValido = p => /^\d{4,8}$/.test(String(p == null ? '' : p));
  const corValida = c => /^#[0-9a-fA-F]{6}$/.test(String(c || ''));

  /**
   * Aplica `mud` ao registro `u` NO LUGAR. Só toca no que veio em `mud`;
   * todo o resto do registro (inclusive campos que o Hub não conhece) fica.
   * `opts.editor` = chave de quem edita; `opts.chave` = chave do editado.
   * Devolve { ok, erros, mudou: [campos] }.
   */
  function editarUsuario(u, mud, opts) {
    const o = opts || {}, erros = [], mudou = [];
    if (!u || typeof u !== 'object') return { ok: false, erros: ['Usuário não encontrado.'], mudou };
    mud = mud || {};
    const ehSamir = o.chave === 'samir', propria = o.editor && o.editor === o.chave;

    if ('nome' in mud && !String(mud.nome || '').trim()) erros.push('O nome não pode ficar vazio.');
    if ('cor' in mud && !corValida(mud.cor)) erros.push('Cor inválida (use o seletor).');
    if ('pin' in mud && mud.pin !== '' && mud.pin != null && !pinValido(mud.pin)) erros.push('PIN com 4 a 8 números.');
    if ('perfilHub' in mud && mud.perfilHub && !W.PERFIS[mud.perfilHub]) erros.push('Perfil do Hub desconhecido.');
    if ('perfilHub' in mud && propria && mud.perfilHub && (W.PERFIS[mud.perfilHub].externo || W.PERFIS[mud.perfilHub].restrito))
      erros.push('Você não pode trocar o próprio perfil para um perfil restrito — perderia o acesso a esta tela.');
    if (!podeConcederTudo(o.editor) && ['aprova', 'config'].some(c => c in mud && !!mud[c] !== !!u[c]))
      erros.push('Só o Samir concede aprovação de margem e acesso às Configurações.');
    if ('config' in mud && ehSamir && !mud.config && u.config) erros.push('O acesso do Samir às Configurações não pode ser retirado.');
    if ('tabs' in mud && !Array.isArray(mud.tabs)) erros.push('Lista de abas inválida.');
    if (erros.length) return { ok: false, erros, mudou };

    CAMPOS_TEXTO.forEach(c => { if (c in mud) { const v = String(mud[c] == null ? '' : mud[c]).trim(); if (v !== u[c]) { u[c] = v; mudou.push(c); } } });
    // PIN vazio = manter o atual.
    if ('pin' in mud && mud.pin !== '' && mud.pin != null && String(mud.pin) !== String(u.pin)) { u.pin = String(mud.pin); mudou.push('pin'); }
    // Perfil "automático": se o campo não existia, continua não existindo.
    if ('perfilHub' in mud) {
      const v = mud.perfilHub || '';
      if (v !== (u.perfilHub || '')) { if (v || 'perfilHub' in u) { u.perfilHub = v; mudou.push('perfilHub'); } }
    }
    if ('tabs' in mud) {
      const conhecidas = ABAS_LEGADO.map(a => a[0]);
      const antes = Array.isArray(u.tabs) ? u.tabs : [];
      // Abas que o Hub não conhece (de versões futuras/antigas) ficam como estão.
      const extras = antes.filter(t => !conhecidas.includes(t));
      const novas = conhecidas.filter(t => mud.tabs.includes(t)).concat(extras);
      if (JSON.stringify(novas) !== JSON.stringify(antes)) { u.tabs = novas; mudou.push('tabs'); }
    }
    // Financeiro: igual ao sistema atual — o Samir não perde, e a aba acompanha a permissão.
    if ('fin' in mud && !(ehSamir && !mud.fin)) {
      const v = !!mud.fin;
      if (v !== !!u.fin) { u.fin = v; mudou.push('fin'); }
      if (Array.isArray(u.tabs)) {
        const t = v ? Array.from(new Set(u.tabs.concat('fin'))) : u.tabs.filter(x => x !== 'fin');
        if (JSON.stringify(t) !== JSON.stringify(u.tabs)) { u.tabs = t; if (!mudou.includes('tabs')) mudou.push('tabs'); }
      }
    }
    ['aprova', 'config'].forEach(c => { if (c in mud && !!mud[c] !== !!u[c]) { u[c] = !!mud[c]; mudou.push(c); } });
    return { ok: true, erros, mudou };
  }

  /** Chave de usuário a partir do nome: minúscula, sem acento, só letras e números. */
  function chaveDeNome(nome) {
    const s = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/)[0] || '';
    return s.replace(/[^a-z0-9]/g, '').slice(0, 24);
  }

  /** Novo usuário no formato do sistema atual. Não grava nada: devolve { ok, erros, chave, usuario }. */
  function novoUsuario(db, dados) {
    const d = dados || {}, erros = [];
    const chave = String(d.chave || chaveDeNome(d.nome)).trim();
    if (!String(d.nome || '').trim()) erros.push('Informe o nome.');
    if (!/^[a-z][a-z0-9_]{1,23}$/.test(chave)) erros.push('Identificador inválido (letras minúsculas e números, começando por letra).');
    else if (db && db.users && db.users[chave]) erros.push(`Já existe alguém com o identificador "${chave}".`);
    if (!pinValido(d.pin)) erros.push('PIN com 4 a 8 números.');
    if (d.perfilHub && !W.PERFIS[d.perfilHub]) erros.push('Perfil do Hub desconhecido.');
    if (d.cor && !corValida(d.cor)) erros.push('Cor inválida.');
    if (erros.length) return { ok: false, erros };
    const conhecidas = ABAS_LEGADO.map(a => a[0]);
    const fin = !!d.fin;
    let tabs = Array.isArray(d.tabs) ? conhecidas.filter(t => d.tabs.includes(t)) : ['painel', 'mapa', 'agenda', 'gestao', 'org'];
    tabs = fin ? Array.from(new Set(tabs.concat('fin'))) : tabs.filter(t => t !== 'fin');
    if (!tabs.length) tabs = ['painel'];
    const u = { nome: String(d.nome).trim(), papel: String(d.papel || '').trim(), pin: String(d.pin), cor: d.cor || '#2563EB', fin, aprova: false, config: false, tabs };
    if (d.perfilHub) u.perfilHub = d.perfilHub;
    return { ok: true, erros, chave, usuario: u };
  }

  /* ---------- Backup ---------- */
  const nomeBackup = hoje => 'windgate_backup_' + String(hoje || W.hojeISO()).slice(0, 10) + '.json';
  /** O banco como o navegador tem, no mesmo formato do backup do sistema atual. */
  const textoBackup = db => JSON.stringify(db, null, 2);

  /**
   * Importação SÓ DE ACRÉSCIMO. Nada que já existe é alterado ou apagado:
   *  - coleções: entra o registro cujo `_id` não existe aqui;
   *  - objetos por chave (users, checklists, quotes…): entra a chave que não existe;
   *  - registro excluído de propósito (`_removidos`) não volta — o servidor
   *    descartaria de qualquer forma;
   *  - o resto (settings e outros campos soltos) fica de fora.
   * Com `aplicar=false` só conta (prévia). Devolve o resumo.
   */
  /* settings nunca vem de um backup: um arquivo velho desfaria os prazos atuais. */
  const OBJETOS_IMPORT = W.OBJETOS_SYNC.filter(k => k !== 'settings');
  function importarBackup(db, backup, aplicar) {
    const res = { colecoes: {}, objetos: {}, total: 0, jaExistiam: 0, excluidos: 0, ignorados: [] };
    if (!backup || typeof backup !== 'object' || Array.isArray(backup)) { res.erro = 'Arquivo não é um backup do WindGate.'; return res; }
    const reconhecido = W.COLECOES_SYNC.some(k => Array.isArray(backup[k])) || (backup.users && typeof backup.users === 'object');
    if (!reconhecido) { res.erro = 'Arquivo não é um backup do WindGate.'; return res; }
    const removidos = (db && db._removidos) || {};
    W.COLECOES_SYNC.forEach(k => {
      if (!Array.isArray(backup[k])) return;
      const ids = new Set(((db && db[k]) || []).map(r => r && r._id).filter(Boolean));
      const novos = [];
      backup[k].forEach(r => {
        if (!r || typeof r !== 'object') return;
        const id = r._id || W.idDeterministico(r);
        if (removidos[id]) { res.excluidos++; return; }
        if (ids.has(id)) { res.jaExistiam++; return; }
        ids.add(id);
        novos.push(r._id ? r : Object.assign({ _id: id }, r));
      });
      if (novos.length) {
        res.colecoes[k] = novos.length; res.total += novos.length;
        if (aplicar) { if (!Array.isArray(db[k])) db[k] = []; novos.forEach(r => db[k].push(JSON.parse(JSON.stringify(r)))); }
      }
    });
    OBJETOS_IMPORT.forEach(k => {
      const b = backup[k]; if (!b || typeof b !== 'object' || Array.isArray(b)) return;
      const a = (db && db[k] && typeof db[k] === 'object') ? db[k] : {};
      const novas = Object.keys(b).filter(c => !(c in a));
      res.jaExistiam += Object.keys(b).length - novas.length;
      if (novas.length) {
        res.objetos[k] = novas.length; res.total += novas.length;
        if (aplicar) { if (!db[k] || typeof db[k] !== 'object') db[k] = {}; novas.forEach(c => { db[k][c] = JSON.parse(JSON.stringify(b[c])); }); }
      }
    });
    res.ignorados = Object.keys(backup).filter(k => !W.COLECOES_SYNC.includes(k) && !OBJETOS_IMPORT.includes(k) && k !== '_removidos');
    return res;
  }

  /* ---------- Prazos por etapa (settings.prazosStatus) ---------- */
  const REPETE_ATRASO_DIAS = 3;
  /** Mesma conversão do sistema atual: vazio ou lixo = 0 (etapa sem prazo). */
  function normalizarPrazos(entradas, repete) {
    const cfg = {};
    W.STATUS_OP.forEach(x => {
      if (!entradas || !(x.k in entradas)) return;
      const v = String(entradas[x.k] == null ? '' : entradas[x.k]).trim();
      cfg[x.k] = v === '' ? 0 : Math.max(0, Math.round(+v) || 0);
    });
    return { prazosStatus: cfg, repeteAtrasoDias: Math.max(1, Math.round(+repete) || REPETE_ATRASO_DIAS) };
  }
  const repeteAtraso = db => Math.max(1, +(db && db.settings && db.settings.repeteAtrasoDias) || REPETE_ATRASO_DIAS);

  /* ---------- Ponto ---------- */
  /* A sequência do dia, igual ao sistema atual. "outro" existe para o dia que
     não cabe no padrão; "ajuste" é a correção com justificativa. */
  const PONTO_FLUXO = {
    null: { k: 'entrada', l: 'Registrar entrada', c: '#0F8A5F' },
    saida: { k: 'entrada', l: 'Registrar entrada', c: '#0F8A5F' },
    entrada: { k: 'almoco', l: 'Saída para almoço', c: '#B7791F' },
    almoco: { k: 'volta', l: 'Volta do almoço', c: '#0E7C8C' },
    volta: { k: 'saida', l: 'Registrar saída', c: '#C2283B' },
    ajuste: { k: 'entrada', l: 'Registrar entrada', c: '#0F8A5F' },
    outro: { k: 'entrada', l: 'Registrar entrada', c: '#0F8A5F' }
  };
  const PONTO_ROTULO = { entrada: 'Entrada', almoco: 'Saída p/ almoço', volta: 'Volta do almoço', saida: 'Saída', outro: 'Registro avulso', ajuste: 'Ajuste' };
  const proximoPonto = ultimoTipo => PONTO_FLUXO[ultimoTipo] || PONTO_FLUXO[null];
  const rotuloPonto = t => PONTO_ROTULO[t] || String(t || '');
  /** O que chama atenção num registro: sem localização ou fora do escritório. */
  const alertaPonto = r => r.semLocalizacao ? 'sem localização' : (r.dentroDoRaio === false ? 'fora do local' : '');
  const temCerca = cfg => !!cfg && typeof cfg.lat === 'number' && typeof cfg.lon === 'number';
  /** Período padrão do relatório: do dia 1º do mês até hoje. */
  const periodoPonto = hoje => { const h = String(hoje || W.hojeISO()).slice(0, 10); return { de: h.slice(0, 8) + '01', ate: h }; };
  const horasBR = h => (+h || 0).toFixed(2).replace('.', ',') + 'h';
  /** Valida o escritório antes de mandar ao servidor. */
  function validarCerca(c) {
    const lat = +c.lat, lon = +c.lon, raio = c.raio === '' || c.raio == null ? 150 : +c.raio;
    // Igual ao sistema atual: zero ou vazio não é coordenada de escritório.
    if (!lat || !lon) return { ok: false, erro: 'Informe a latitude e a longitude — ou use "minha localização atual".' };
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ok: false, erro: 'Latitude ou longitude fora do mundo — confira os números.' };
    if (!isFinite(raio) || raio < 10) return { ok: false, erro: 'Raio mínimo de 10 metros.' };
    return { ok: true, corpo: { lat, lon, raio, rotulo: String(c.rotulo || '').trim().slice(0, 120) } };
  }

  return {
    ABAS_LEGADO, podeGerirEquipe, podeVerEquipe, podeRelatorioPonto, podeConcederTudo, podeAjustarPrazos,
    pinValido, corValida, editarUsuario, chaveDeNome, novoUsuario,
    nomeBackup, textoBackup, importarBackup,
    REPETE_ATRASO_DIAS, normalizarPrazos, repeteAtraso,
    PONTO_FLUXO, PONTO_ROTULO, proximoPonto, rotuloPonto, alertaPonto, temCerca, periodoPonto, horasBR, validarCerca
  };
});
