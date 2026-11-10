/* Hub 2.0 — Fiscal & Contabilidade.
   Notas fiscais do trimestre (entrada, saída, serviço) e extratos bancários num
   lugar só, para o Davi conferir e o Pedro (contador) apurar o Lucro Real. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  let tri = null, empresa = 'todas', filtroTipo = '';
  const eu = () => H.nomeUsuario(H.userKey);
  const cfg = () => (H.db.hubPainel && H.db.hubPainel._fiscal) || {};
  const TIPOS = { entrada: 'Entrada', saida: 'Saída', servico: 'Serviço (NFS-e)', outra: 'Outro documento' };
  const STATUS = { recebida: ['aguardando conferência', 'info'], conferir: ['conferir anexo', 'warn'], conferida: ['conferida', 'ok'], lancada: ['lançada pelo contador', 'ok'] };
  const garantir = () => { ['hubNotas', 'hubExtratos'].forEach(k => { if (!Array.isArray(H.db[k])) H.db[k] = []; }); if (!H.db.hubPainel) H.db.hubPainel = {}; };
  const editar = () => H.pode('fiscal.editar');

  H.telas.fiscal = function (el) {
    if (!H.pode('fiscal.ver')) { el.innerHTML = '<div class="banner">Esta área não faz parte do seu perfil.</div>'; return; }
    garantir();
    const db = H.db, hoje = W.hojeISO(); tri = tri || W.trimestreDe(hoje);
    const f = W.fechamentoTrimestre(db, tri, hoje), c = cfg(), contador = (db.hubPainel._fiscalContador || {})[tri];
    const fe = editar() && Array.isArray(db.fin) ? W.fechamento(db, tri, empresa, hoje) : null;
    const notas = f.notas.filter(n => (empresa === 'todas' || n.empresa === empresa) && (!filtroTipo || n.tipo === filtroTipo)).sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const tris = (() => { const out = []; let [a, q] = tri.split('-T').map(Number); [a, q] = W.trimestreDe(hoje).split('-T').map(Number); for (let i = 0; i < 6; i++) { out.push(a + '-T' + q); q--; if (!q) { q = 4; a--; } } return out; })();
    const nomeTri = t => { const [a, q] = t.split('-T'); return `${q}º tri ${a}`; };
    const v = k => (f.porTipo[k] || { qtd: 0, valor: 0 });
    el.innerHTML = `
      <div class="head"><div><h1>Fiscal & Contabilidade</h1><p class="sub">Notas fiscais e extratos do trimestre num lugar só. ${editar() ? 'O Davi confere e envia; o Pedro recebe e apura.' : 'Confira, baixe e marque o que já foi lançado.'}</p></div>
        <div class="btns"><select id="ftri" class="inp" aria-label="Trimestre">${tris.map(t => `<option value="${t}" ${t === tri ? 'selected' : ''}>${nomeTri(t)}</option>`).join('')}</select>
          <div class="seg">${[['todas', 'SF + JeT'], ['WindGate', 'SF'], ['JeT', 'JeT']].map(([k, l]) => `<button data-emp="${k}" class="${empresa === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          ${editar() ? '<button class="btn" id="fcfg">Configurar</button><button class="btn blue" id="fext">+ Extrato</button><button class="btn pri" id="fnota">+ Nota fiscal</button>' : ''}</div></div>
      <div class="kpis">
        <div class="kpi"><span class="lbl">Notas de entrada</span><span class="v">${v('entrada').qtd}</span><span class="d">${W.fmtBRLk(v('entrada').valor)}</span></div>
        <div class="kpi"><span class="lbl">Notas de saída</span><span class="v">${v('saida').qtd}</span><span class="d">${W.fmtBRLk(v('saida').valor)}</span></div>
        <div class="kpi"><span class="lbl">Serviços (NFS-e)</span><span class="v">${v('servico').qtd}</span><span class="d">${W.fmtBRLk(v('servico').valor)}</span></div>
        <div class="kpi"><span class="lbl">Aguardando conferência</span><span class="v">${f.pend.length}</span><span class="d ${f.pend.length ? 'bad' : 'good'}">${f.pend.length ? 'antes de enviar ao contador' : 'tudo conferido'}</span></div>
        <div class="kpi"><span class="lbl">Extratos</span><span class="v">${f.extratos.length}</span><span class="d ${f.faltaExtrato.length ? 'bad' : 'good'}">${f.faltaExtrato.length ? f.faltaExtrato.length + ' mês(es) faltando' : f.contas.length ? 'todos os meses' : 'cadastre as contas'}</span></div>
        <div class="kpi"><span class="lbl">Trimestre</span><span class="v" style="font-size:16px">${contador && contador.apuradoEm ? 'Apurado' : f.entrega ? 'Com o contador' : f.pronto ? 'Pronto' : 'Em aberto'}</span><span class="d">${contador && contador.apuradoEm ? 'por ' + esc(contador.por || '') + ' em ' + W.dataBR(contador.apuradoEm) : f.entrega ? 'enviado em ' + W.dataBR(f.entrega.em) : 'apuração trimestral · Lucro Real'}</span></div></div>
      ${painelFechamento(fe)}${painelPacote(f, contador)}
      <div class="g2 larga">
        <div class="box"><div class="box-h"><h2>Notas do trimestre</h2><div class="btns">${Object.entries(TIPOS).map(([k, l]) => `<button class="chip ${filtroTipo === k ? 'on' : ''}" data-tp="${k}">${l}</button>`).join('')}<button class="btn sm" id="fcsv">Baixar lista</button></div></div>
          ${notas.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Nota</th><th>Emitente → destinatário</th><th>Tipo</th><th class="num">Valor</th><th>Chegou por</th><th>Situação</th><th></th></tr></thead><tbody>
          ${notas.map(n => { const st = STATUS[n.status] || STATUS.recebida;
            return `<tr><td class="mono">${W.dataBR(n.data)}</td><td class="mono">${esc(n.numero ? 'Nº ' + n.numero : n.arquivo || '—')}${n.empresa ? `<br><small class="note">${esc(n.empresa === 'WindGate' ? 'SF' : n.empresa)}</small>` : ''}</td>
              <td>${esc(n.emitente || '—')}<br><small class="note">→ ${esc(n.destinatario || '—')}</small></td><td>${esc(TIPOS[n.tipo] || n.tipo || '—')}</td><td class="num">${n.valor ? W.fmtBRL(n.valor) : '—'}</td>
              <td class="note">${esc({ sefaz: 'SEFAZ (automático)', email: 'e-mail de notas', upload: 'enviada no sistema', manual: 'cadastro manual' }[n.origem] || n.origem || '—')}</td><td><span class="pill ${st[1]}">${st[0]}</span></td>
              <td class="num" style="white-space:nowrap">${n.xmlLink ? `<a class="btn ghost sm" href="${esc(n.xmlLink)}" target="_blank" rel="noopener">XML</a>` : ''}${n.pdfLink ? `<a class="btn ghost sm" href="${esc(n.pdfLink)}" target="_blank" rel="noopener">PDF</a>` : ''}
                ${editar() && n.status !== 'conferida' && n.status !== 'lancada' ? `<button class="btn sm" data-conf="${esc(n._id)}">Conferir</button>` : ''}${H.perfil().id === 'contador' && n.status !== 'lancada' ? `<button class="btn sm" data-lanc="${esc(n._id)}">Lançada</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`
            : `<p class="empty">Nenhuma nota neste trimestre${filtroTipo ? ' com esse filtro' : ''}.</p>`}</div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="box"><div class="box-h"><h2>Fechamento do trimestre</h2></div><div class="box-b list">
            ${f.pend.length ? `<div class="row"><span>${f.pend.length} nota(s) aguardando conferência</span><span class="pill warn">conferir</span></div>` : ''}
            ${f.faltaExtrato.slice(0, 6).map(x => `<div class="row"><span>Extrato ${esc(x.conta.banco || '')} ${esc(x.conta.nome || '')} · ${x.mes.split('-').reverse().join('/')}</span><span class="pill warn">falta</span></div>`).join('')}
            ${!f.contas.length ? '<div class="row"><span>Cadastre as contas bancárias em Configurar para o sistema cobrar os extratos de cada mês.</span></div>' : ''}
            ${f.pronto && !f.entrega ? '<div class="row"><span>Tudo conferido.</span><span class="pill ok">pronto</span></div>' : ''}
            ${editar() ? `<p class="note">O envio ao contador é pelo pacote do fechamento, acima.</p>` : ''}
            ${H.perfil().id === 'contador' ? `<button class="btn pri" id="fapu" ${contador && contador.apuradoEm ? 'disabled' : ''}>${contador && contador.apuradoEm ? 'Apuração concluída' : 'Marcar trimestre como apurado'}</button>` : ''}</div></div>
          <div class="box"><div class="box-h"><h2>Extratos bancários</h2></div><div class="box-b list">
            ${f.extratos.length ? f.extratos.map(e => `<div class="row"><div><b>${esc(e.banco || '')} ${esc(e.contaNome || '')}</b> · ${e.mes.split('-').reverse().join('/')}<br><small class="note">${e.formato || ''}${e.transacoes ? ' · ' + e.transacoes.length + ' movimentos · ' + e.transacoes.filter(t => t.lancId).length + ' conciliados com o Financeiro' : ''}${e.saldo != null ? ' · saldo ' + W.fmtBRL(e.saldo) : ''}</small></div><div class="btns">${e.transacoes && editar() ? (() => { const dv = W.divergencias(H.db, e), n = dv.semLancamento.length + dv.semBanco.length; return `<button class="btn sm ${n ? 'pri' : ''}" data-conc="${esc(e._id)}">${n ? n + ' divergência(s)' : 'Conciliado'}</button>`; })() : ''}${e.link ? `<a class="btn ghost sm" href="${esc(e.link)}" target="_blank" rel="noopener">Abrir</a>` : ''}</div></div>`).join('') : '<p class="empty">Nenhum extrato neste trimestre.</p>'}</div></div>
          <div class="box"><div class="box-h"><h2>Como as notas chegam</h2></div><div class="box-b list">
            <div class="row"><div><b>SEFAZ, automático</b><br><small class="note">Toda NF-e emitida contra os CNPJs do grupo entra sozinha.</small></div>${editar() ? '<button class="btn sm" id="fsefaz">Buscar agora</button>' : ''}</div>
            <div class="row"><div><b>E-mail de notas</b><br><small class="note">${c.emailNotas ? `Encaminhe para <b>${esc(c.emailNotas)}</b>. Do WhatsApp: abrir o arquivo › compartilhar › e-mail.` : 'Endereço ainda não configurado.'}</small></div></div>
            <div class="row"><div><b>Envio no sistema</b><br><small class="note">XML lido na hora (número, emitente, valor, CNPJ). PDF ou NFS-e com os campos à mão.</small></div></div></div></div>
        </div></div>`;
    el.querySelector('#ftri').onchange = e => { tri = e.target.value; H.render(); };
    el.querySelectorAll('[data-emp]').forEach(b => b.onclick = () => { empresa = b.dataset.emp; H.render(); });
    el.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { filtroTipo = filtroTipo === b.dataset.tp ? '' : b.dataset.tp; H.render(); });
    el.querySelectorAll('[data-conf]').forEach(b => b.onclick = () => marcar(b.dataset.conf, 'conferida'));
    el.querySelectorAll('[data-lanc]').forEach(b => b.onclick = () => marcar(b.dataset.lanc, 'lancada'));
    el.querySelector('#fcsv').onclick = () => baixarCSV(notas);
    el.querySelectorAll('[data-conc]').forEach(b => b.onclick = () => conciliar(b.dataset.conc));
    const on = (id, fn) => { const x = el.querySelector(id); if (x) x.onclick = fn; };
    on('#fnota', novaNota); on('#fext', novoExtrato); on('#fcfg', configurar);
    if (fe) ligarFechamento(el, fe);
    on('#frec', () => { const ent = (cfg().entregas || {})[tri] || {}; H.db.hubPainel._fiscalContador = Object.assign({}, H.db.hubPainel._fiscalContador, { [tri]: Object.assign({}, (H.db.hubPainel._fiscalContador || {})[tri], { recebidoEm: new Date().toISOString(), por: eu(), hash: ent.hash || '' }) }); H.salvar(); H.toast('Recebimento do pacote confirmado'); H.render(); });
    on('#fapu', () => { H.db.hubPainel._fiscalContador = Object.assign({}, H.db.hubPainel._fiscalContador, { [tri]: { apuradoEm: new Date().toISOString(), por: eu() } }); H.salvar(); H.toast('Apuração registrada'); H.render(); });
    on('#fsefaz', async () => {
      const r = await H.api('/api/fiscal/sefaz', { method: 'POST' }); const j = await r.json().catch(() => ({}));
      H.toast(j.success ? `SEFAZ: ${j.novas} nota(s) nova(s) de ${j.consultadas} consultada(s).` : esc(j.message || 'Não consegui consultar.'));
    });
  };

  /* Conciliação: movimento do banco sem lançamento vira proposta de lançamento
     (aprovada pelo Samir ou pelo Davi na Torre); lançamento sem movimento no
     banco fica apontado para conferir. */
  function conciliar(id) {
    const e = H.db.hubExtratos.find(x => x && x._id === id); if (!e) return H.render();
    if (Array.isArray(e.transacoes)) {
      const usados = new Set(H.db.hubExtratos.flatMap(x => (x && x.transacoes) || []).map(t => t.lancId).filter(Boolean)), livres = H.db.fin.filter(l => l && !usados.has(l._id));
      const novos = W.conciliar({ fin: livres }, e.transacoes.filter(t => !t.lancId && t.decisao !== 'ignorado'), e.empresa);
      let mudou = 0; novos.forEach(n => { if (n.lancId) { const t = e.transacoes.find(x => x.id === n.id && x.data === n.data && x.valor === n.valor && !x.lancId); if (t) { t.lancId = n.lancId; mudou++; } } });
      if (mudou) { H.salvar(); H.toast(mudou + ' movimento(s) casado(s) com lançamentos feitos depois do extrato'); }
    }
    const dv = W.divergencias(H.db, e);
    const m = H.modal(`Conciliação · ${e.banco || ''} ${e.mes.split('-').reverse().join('/')}`, `
      <p class="note" style="margin-bottom:10px">${e.transacoes.filter(t => t.lancId).length} de ${e.transacoes.length} movimentos batem com o Financeiro (mesmo valor, até 3 dias de diferença).</p>
      <h3 class="h3">No banco, sem lançamento no sistema · ${dv.semLancamento.length}</h3>
      ${dv.semLancamento.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Histórico do banco</th><th class="num">Valor</th><th>Operação</th><th></th></tr></thead><tbody>${dv.semLancamento.map((t, i) => `<tr><td class="mono">${W.dataBR(t.data)}</td><td>${esc(t.memo || '')}</td><td class="num ${t.valor < 0 ? 'neg' : 'pos'}">${W.fmtBRL(t.valor)}</td>
        <td><select class="inp" data-op="${i}"><option value="WindGate">Sem operação</option>${H.db.ops.filter(o => o && o.id).map(o => `<option>${esc(o.id)}</option>`).join('')}</select></td>
        <td class="num" style="white-space:nowrap"><button class="btn sm blue" data-prop="${i}">Propor lançamento</button><button class="btn ghost sm" data-ign="${i}">Ignorar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="note">Nenhum.</p>'}
      <h3 class="h3" style="margin-top:14px">No sistema, sem movimento no banco · ${dv.semBanco.length}</h3>
      ${dv.semBanco.length ? `<div class="tw"><table><thead><tr><th>Baixa</th><th>Descrição</th><th class="num">Valor</th><th>Por</th></tr></thead><tbody>${dv.semBanco.map(l => `<tr><td class="mono">${W.dataBR(l.liquidadoEm || W.vencDe(l))}</td><td>${esc(l.desc || l.categoria || '—')} <span class="note mono">${esc(l.op || '')}</span></td><td class="num">${W.fmtBRL(l.valor)}</td><td>${esc(l.baixaPor || l.por || '')}</td></tr>`).join('')}</tbody></table></div>
        <p class="note">Confira a data e o valor da baixa. Pode ser pagamento por outra conta ou baixa lançada errada.</p>` : '<p class="note">Nenhum.</p>'}`,
      '<button class="btn" data-x>Fechar</button>');
    m.querySelector('.modal').classList.add('larga');
    const achar = i => e.transacoes.find(t => t === dv.semLancamento[+i]);
    m.querySelectorAll('[data-prop]').forEach(b => b.onclick = () => {
      const t = achar(b.dataset.prop); if (!t) return;
      const op = m.querySelector(`[data-op="${b.dataset.prop}"]`).value, agora = new Date().toISOString(), lid = W.novoId();
      H.db.fin.unshift({ _id: lid, data: t.data, vencimento: t.data, liquidadoEm: t.data, op, tipo: t.valor < 0 ? 'Despesa' : 'Receita', categoria: '', fixo: false, desc: (t.memo || 'Movimento do banco').slice(0, 120),
        valor: Math.abs(t.valor), valorPago: Math.abs(t.valor), valorPrevisto: null, status: 'Realizado', empresa: e.empresa || 'WindGate', comp: '', nf: '', por: eu(), criadoEm: agora, origem: 'conciliacao', aprovacaoPendente: true, extratoId: e._id });
      t.lancId = lid; t.decisao = 'proposto';
      H.salvar(); H.toast('Lançamento proposto: aguarda aprovação na Torre. Complete a contraparte e a nota (ou o motivo).'); H.fecharModal();
      const nl = H.db.fin.find(x => x && x._id === lid); if (nl && H.editarLanc) H.editarLanc(nl); else conciliar(id);
    });
    m.querySelectorAll('[data-ign]').forEach(b => b.onclick = () => { const t = achar(b.dataset.ign); if (!t) return; t.decisao = 'ignorado'; t.ignoradoPor = eu(); H.salvar(); H.fecharModal(); conciliar(id); });
  }

  /* ---------- Fechamento do trimestre (quem confere) ---------- */
  const nomeConta = c => `${c.empresa === 'JeT' ? 'JeT' : 'SF'} · ${c.banco || ''} ${c.nome || ''}`.trim();
  const mesBR = m => m.split('-').reverse().join('/');
  const brl = v => v == null ? '—' : W.fmtBRL(v);
  function descPend(k, it) {
    if (it.memo != null && it.valor != null && it.data) return `${W.dataBR(it.data)} · ${esc(it.memo || it.desc || '')}${it.desc && it.memo ? ' → ' + esc(it.desc) : ''} · <b class="${it.valor < 0 ? 'neg' : ''}">${W.fmtBRL(it.valor)}</b>${it.ignorado ? ' <span class="pill warn">ignorado</span>' : ''}${it.notaLink ? ' <span class="pill info">nota só por link</span>' : ''}`;
    if (it.lancId) return `${W.dataBR(it.data)} · ${esc(it.desc || '')} ${it.op ? '<span class="note mono">' + esc(it.op) + '</span>' : ''} · <b>${W.fmtBRL(it.valor)}</b>`;
    if (it.notaId) return `NF ${esc(it.numero || '')} · ${esc(it.emitente || '')} → ${esc(it.destinatario || '')} · ${W.fmtBRL(it.valor)} · ${W.dataBR(it.data)}`;
    if (it.dif != null) return `${esc(it.banco || '')} ${esc(it.conta || '')} · ${mesBR(it.mes)}: extrato ${brl(it.extrato)} × sistema ${brl(it.sistema)} (<b class="neg">${W.fmtBRL(it.dif)}</b>)`;
    if (it.esperado != null) return `${esc(it.banco || '')} ${esc(it.conta || '')} · ${mesBR(it.mes)} começa em ${W.fmtBRL(it.veio)}, mas o mês anterior fechou em ${W.fmtBRL(it.esperado)}`;
    return `${esc(it.banco || '')} ${esc(it.conta || '')}${it.mes ? ' · ' + mesBR(it.mes) : ''}`;
  }
  function painelFechamento(fe) {
    if (!fe) return '';
    const P = fe.pendencias, diretoria = H.pode('fiscal.total'), ent = fe.entrega, pac = ent && ent.pacotes ? Object.values(ent.pacotes) : [];
    const rec = (H.db.hubPainel._fiscalContador || {})[tri];
    const saldos = fe.porConta.map(pc => pc.meses.map((m, i) => `<tr><td>${i ? '' : esc(nomeConta(pc.conta))}</td><td class="mono">${mesBR(m.mes)}</td><td class="num">${brl(m.saldoInicial)}</td><td class="num">${brl(m.saldoFinal)}</td><td class="num">${brl(m.sistema)}</td>
      <td class="num">${m.dif == null ? '<span class="note">sem extrato</span>' : m.dif ? `<b class="neg">${W.fmtBRL(m.dif)}</b>` : '<span class="pill ok">0,00</span>'}</td></tr>`).join('')).join('');
    const blocos = W.PENDENCIAS.filter(([k]) => P[k].length).map(([k, l]) => `<div style="margin-top:10px"><b>${esc(l)}</b> <span class="pill warn">${P[k].length}</span><div class="list">
      ${expandido[k] ? `<input class="inp" data-busca="${k}" placeholder="Buscar por valor, data ou nome" value="${esc(busca[k] || '')}" style="margin:6px 0;max-width:320px">` : ''}
      ${P[k].map((it, i) => [it, i]).filter(([it]) => !expandido[k] || !busca[k] || descPend(k, it).replace(/<[^>]+>/g, '').toLowerCase().includes(busca[k].toLowerCase().trim())).slice(0, expandido[k] ? Infinity : 8).map(([it, i]) => `<div class="row"><span>${descPend(k, it)}</span><button class="btn sm" data-res="${k}:${i}">Resolver</button></div>`).join('')}${P[k].length > 8 ? `<button class="btn ghost sm" data-vt="${k}">${expandido[k] ? 'Mostrar só os 8 primeiros' : `Ver todos (${P[k].length})`}</button>` : ''}</div></div>`).join('');
    return `<div class="box"><div class="box-h"><h2>Fechamento do trimestre · ${Math.round(fe.pct * 100)}% pronto para o contador</h2><div class="btns"><span class="note">${fe.completos} de ${fe.total} movimentos completos · ${fe.qtdPendencias} pendência(s)</span>
        <button class="btn ${fe.pronto ? 'pri' : ''}" id="fpac" ${fe.pronto || diretoria ? '' : 'disabled title="Zere as pendências: só a diretoria libera com pendências"'}>${fe.pronto ? 'Gerar pacote para o contador' : diretoria ? 'Liberar pacote com pendências' : 'Gerar pacote (zere as pendências)'}</button></div></div>
      <div class="box-b">${fe.contas.length ? `<div class="tw"><table><thead><tr><th>Conta</th><th>Mês</th><th class="num">Saldo inicial</th><th class="num">Saldo final do extrato</th><th class="num">Saldo do sistema</th><th class="num">Diferença</th></tr></thead><tbody>${saldos}</tbody></table></div>` : '<p class="banner">Cadastre as contas bancárias em Configurar: sem elas o trimestre não fecha.</p>'}
        ${blocos || '<p class="note" style="margin-top:10px">Nenhuma pendência: todo movimento tem lançamento, classificação, contraparte, nota (ou motivo) e comprovante, e os saldos batem.</p>'}
        ${pac.length ? `<h3 class="h3" style="margin-top:12px">Pacotes gerados</h3><div class="list">${pac.map(p => `<div class="row"><span>${p.empresa === 'todas' ? 'SF + JeT' : p.empresa === 'JeT' ? 'JeT' : 'SF'} · por ${esc(p.por)} em ${W.dataBR(p.em)} · ${Math.round(((p.resumo || {}).pct || 0) * 100)}% · <span class="mono" title="SHA-256">${esc(String(p.hash || '').slice(0, 12))}…</span>${p.liberadoComPendencias ? ` · <span class="pill warn">liberado com pendências por ${esc(p.liberadoComPendencias.por)}: ${esc(p.liberadoComPendencias.motivo)}</span>` : ''}${p.faltou ? ` · ${p.faltou} arquivo(s) não baixado(s)` : ''}</span><a class="btn sm" href="${esc(p.link)}" target="_blank" rel="noopener">Baixar</a></div>`).join('')}</div>
          <p class="note">${rec && rec.recebidoEm ? 'O contador confirmou o recebimento em ' + W.dataBR(rec.recebidoEm) + '.' : 'O contador ainda não confirmou o recebimento.'}</p>` : ''}</div></div>`;
  }
  function ligarFechamento(el, fe) {
    el.querySelectorAll('[data-res]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.res.split(':'); resolver(k, fe.pendencias[k][+i]); });
    el.querySelectorAll('[data-vt]').forEach(b => b.onclick = () => { expandido[b.dataset.vt] = !expandido[b.dataset.vt]; H.render(); });
    el.querySelectorAll('[data-busca]').forEach(i => { i.oninput = () => { busca[i.dataset.busca] = i.value; clearTimeout(tBusca); tBusca = setTimeout(() => { H.render(); const n = document.querySelector(`[data-busca="${i.dataset.busca}"]`); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }; });
    const bp = el.querySelector('#fpac'); if (!bp) return;
    bp.onclick = () => {
      if (fe.pronto) return gerarPacote(bp, false, '');
      const m = H.modal('Liberar o pacote com pendências', `<p class="banner" style="margin-bottom:10px">Ainda faltam ${fe.qtdPendencias} item(ns). O pacote sai com uma aba das pendências e fica registrado quem liberou e por quê.</p>
        <div class="list">${W.PENDENCIAS.filter(([k]) => fe.pendencias[k].length).map(([k, l]) => `<div class="row"><span>${esc(l)}</span><b>${fe.pendencias[k].length}</b></div>`).join('')}</div>
        <div class="fields" style="margin-top:10px"><div class="f w4"><label class="lbl" for="lbm">Motivo da liberação</label><input id="lbm"></div></div>`,
        '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="lbok">Liberar e gerar</button>');
      m.querySelector('#lbok').onclick = e => { const mo = m.querySelector('#lbm').value.trim(); if (!mo) { H.toast('Escreva o motivo'); return; } gerarPacote(e.target, true, mo); };
    };
  }
  async function gerarPacote(btn, liberar, motivo) {
    btn.disabled = true; const txt0 = btn.textContent; btn.textContent = 'Montando o pacote…';
    try {
      const r = await H.api('/api/fiscal/pacote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tri, empresa, liberar, motivo }) });
      const j = await r.json().catch(() => ({}));
      if (!j.success) { H.toast(esc(j.message || 'Não consegui gerar o pacote.')); btn.disabled = false; btn.textContent = txt0; return; }
      H.aplicarObjetoDoServidor('hubPainel', '_fiscal', j.fiscal); H.fecharModal();
      H.toast(`Pacote gerado: ${j.entrega.arquivos} arquivo(s)${j.entrega.faltou ? ', ' + j.entrega.faltou + ' não baixado(s) (ver LEIA-ME)' : ''}. O contador baixa pelo acesso dele.`);
      window.open(j.entrega.link, '_blank'); H.render();
    } catch (e) { btn.disabled = false; btn.textContent = txt0; H.toast('Não consegui gerar o pacote agora.'); }
  }
  const expandido = {}, busca = {}; let tBusca = null;
  const feAtual = () => W.fechamento(H.db, tri, empresa, W.hojeISO());
  const nomeContaId = id => { const c = (cfg().contas || []).find(x => x.id === id); return c ? nomeConta(c) : '—'; };
  /* Lançamento realizado que não está no banco: vincular, corrigir a data ou trocar a conta, ali mesmo. */
  function resolverSemBanco(it) {
    const l = H.db.fin.find(x => x && x._id === it.lancId); if (!l) return H.render();
    const fe = feAtual(), sug = W.sugestoesConciliacao(H.db, fe, it), contas = (cfg().contas || []).filter(c => c && c.ativa !== false);
    const m = H.modal('Lançamento que não está no banco', `<p><b>${esc(l.desc || l.categoria || '')}</b> ${l.op ? '<span class="note mono">' + esc(l.op) + '</span>' : ''} · <b>${W.fmtBRL(+l.valor || 0)}</b> · pago em ${W.dataBR(l.liquidadoEm || W.vencDe(l))} · conta ${esc(nomeContaId(it.contaId))}</p>
      ${sug.length ? `<h3 class="h3" style="margin-top:12px">Mesmo valor no banco, em até 10 dias</h3><div class="list">${sug.map((s, i) => `<div class="row"><span>${W.dataBR(s.data)} · ${esc(s.memo)} · ${W.fmtBRL(s.valor)} <span class="note">${s.dias} dia(s) · ${esc(nomeContaId(s.contaId))}</span></span><button class="btn blue sm" data-sug="${i}">Confirmar</button></div>`).join('')}</div>` : '<p class="note" style="margin-top:10px">Nenhum movimento de mesmo valor em até 10 dias.</p>'}
      <div class="fields" style="margin-top:12px"><div class="f"><label class="lbl" for="rsd">Data do pagamento</label><input id="rsd" type="date" value="${W.soData(l.liquidadoEm || '')}"></div><div class="f" style="align-self:end"><button class="btn sm" id="rsdok">Corrigir a data</button></div>
        <div class="f"><label class="lbl" for="rsc">Pago por outra conta</label><select id="rsc">${contas.map(c => `<option value="${esc(c.id)}" ${c.id === it.contaId ? 'selected' : ''}>${esc(nomeConta(c))}${c.tipo && c.tipo !== 'banco' ? ' (' + esc(c.tipo) + ')' : ''}</option>`).join('')}</select></div><div class="f" style="align-self:end"><button class="btn sm" id="rscok">Trocar a conta</button></div></div>`,
      '<button class="btn" data-x>Fechar</button><button class="btn" id="rsed">Abrir o lançamento</button><button class="btn blue" id="rsvin">Vincular a movimento(s)</button>');
    m.querySelector('.modal').classList.add('larga');
    const feito = msg => { H.salvar(); H.fecharModal(); H.toast(msg); H.render(); };
    m.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { const r = W.vincularUm(H.db, sug[+b.dataset.sug].chave, l._id, eu()); if (!r.ok) return H.toast(esc(r.msg)); feito('Conciliado.'); });
    m.querySelector('#rsdok').onclick = () => { const r = W.corrigirDataPagamento(l, m.querySelector('#rsd').value, eu()); if (!r.ok) return H.toast(esc(r.msg)); feito('Data do pagamento corrigida.'); };
    m.querySelector('#rscok').onclick = () => { const r = W.mudarConta(H.db, l, m.querySelector('#rsc').value, eu()); if (!r.ok) return H.toast(esc(r.msg)); feito('Conta trocada.'); };
    m.querySelector('#rsed').onclick = () => { H.fecharModal(); H.editarLanc(l); };
    m.querySelector('#rsvin').onclick = () => { H.fecharModal(); vincular({ lancIds: [l._id], data: W.soData(l.liquidadoEm || W.vencDe(l)), entrada: W.ehReceita(l) }); };
  }
  /* Movimento do banco sem lançamento: sugestão, vincular a vários, propor ou ignorar. */
  function resolverSemLancamento(it) {
    const mv = W.movimentoDaChave(H.db, it.chave); if (!mv) return H.render();
    const fe = feAtual(), sug = W.sugestoesConciliacao(H.db, fe, it);
    const m = H.modal('Movimento do banco sem lançamento', `<p>${W.dataBR(it.data)} · <b>${esc(it.memo || '')}</b> · <b class="${it.valor < 0 ? 'neg' : ''}">${W.fmtBRL(it.valor)}</b> · ${esc(nomeContaId(it.contaId))}</p>
      ${sug.length ? `<h3 class="h3" style="margin-top:12px">Lançamento de mesmo valor, em até 10 dias</h3><div class="list">${sug.map((s, i) => `<div class="row"><span>${W.dataBR(s.data)} · ${esc(s.desc)} ${s.op ? '<span class="note mono">' + esc(s.op) + '</span>' : ''} · ${W.fmtBRL(s.valor)} <span class="note">${s.dias} dia(s)</span></span><button class="btn blue sm" data-sug="${i}">Confirmar</button></div>`).join('')}</div>` : '<p class="note" style="margin-top:10px">Nenhum lançamento de mesmo valor em até 10 dias.</p>'}
      <div class="fields" style="margin-top:12px"><div class="f w2"><label class="lbl" for="rmo">Operação, se for propor um lançamento</label><select id="rmo"><option value="WindGate">Sem operação</option>${H.db.ops.filter(o => o && o.id).map(o => `<option>${esc(o.id)}</option>`).join('')}</select></div></div>`,
      '<button class="btn" data-x>Fechar</button><button class="btn ghost" id="rmign">Ignorar</button><button class="btn" id="rmprop">Propor lançamento</button><button class="btn blue" id="rmvin">Vincular a lançamento(s)</button>');
    m.querySelector('.modal').classList.add('larga');
    m.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { const r = W.vincularUm(H.db, it.chave, sug[+b.dataset.sug].lancId, eu()); if (!r.ok) return H.toast(esc(r.msg)); H.salvar(); H.fecharModal(); H.toast('Conciliado.'); H.render(); });
    m.querySelector('#rmign').onclick = () => { mv.t.decisao = 'ignorado'; mv.t.ignoradoPor = eu(); H.salvar(); H.fecharModal(); H.render(); };
    m.querySelector('#rmprop').onclick = () => {
      const t = mv.t, e = mv.e, agora = new Date().toISOString(), lid = W.novoId();
      H.db.fin.unshift({ _id: lid, data: t.data, vencimento: t.data, liquidadoEm: t.data, op: m.querySelector('#rmo').value, tipo: t.valor < 0 ? 'Despesa' : 'Receita', categoria: '', fixo: false, desc: (t.memo || 'Movimento do banco').slice(0, 120),
        valor: Math.abs(t.valor), valorPago: Math.abs(t.valor), valorPrevisto: null, status: 'Realizado', empresa: e.empresa || 'WindGate', contaId: e.contaId, comp: '', nf: '', por: eu(), criadoEm: agora, origem: 'conciliacao', aprovacaoPendente: true, extratoId: e._id });
      t.lancId = lid; t.decisao = 'proposto'; H.salvar(); H.fecharModal(); H.toast('Lançamento proposto: aguarda aprovação na Torre.');
      const nl = H.db.fin.find(x => x && x._id === lid); if (nl && H.editarLanc) H.editarLanc(nl); else H.render();
    };
    m.querySelector('#rmvin').onclick = () => { H.fecharModal(); vincular({ movs: [it.chave], data: it.data, entrada: it.valor > 0 }); };
  }
  /* Vários com um: escolha os movimentos e os lançamentos; concilia quando as somas batem. */
  function vincular(seed) {
    const fe = feAtual(), dia = d => Math.abs(W.diasEntre(d, seed.data) || 0);
    const usadosL = new Set(fe.movimentos.flatMap(x => (x.lancs || (x.lanc ? [x.lanc] : [])).map(l => l._id)));
    const movs = fe.movimentos.filter(x => (seed.movs || []).includes(x.chave) || (!x.lanc && !x.ignorado && (x.valor > 0) === seed.entrada && dia(x.data) <= 20)).sort((a, b) => dia(a.data) - dia(b.data));
    const lancs = H.db.fin.filter(l => l && ((seed.lancIds || []).includes(l._id) || (W.realizado(l) && !usadosL.has(l._id) && !W.transferencia(l) && W.ehReceita(l) === seed.entrada && dia(W.soData(l.liquidadoEm || W.vencDe(l))) <= 20))).sort((a, b) => dia(W.soData(a.liquidadoEm)) - dia(W.soData(b.liquidadoEm)));
    const m = H.modal('Vincular movimentos e lançamentos', `<p class="note">Marque um ou vários de cada lado. Fica conciliado quando as somas forem iguais. Mostra o que está até 20 dias de ${W.dataBR(seed.data)}.</p>
      <input class="inp" id="vbq" placeholder="Filtrar por valor ou nome" style="margin:8px 0;max-width:320px">
      <div class="g2" style="gap:12px"><div><h3 class="h3">No banco</h3><div class="list" id="vbm">${movs.map(x => `<label class="row" data-txt="${esc((x.memo + ' ' + x.valor + ' ' + W.dataBR(x.data)).toLowerCase())}" style="justify-content:flex-start;gap:8px"><input type="checkbox" data-vm="${esc(x.chave)}" data-v="${Math.abs(x.valor)}" ${(seed.movs || []).includes(x.chave) ? 'checked' : ''}><span>${W.dataBR(x.data)} · ${esc(x.memo)} · <b>${W.fmtBRL(x.valor)}</b></span></label>`).join('') || '<p class="empty">Nenhum.</p>'}</div></div>
        <div><h3 class="h3">No sistema</h3><div class="list" id="vbl">${lancs.map(l => `<label class="row" data-txt="${esc(((l.desc || '') + ' ' + (l.op || '') + ' ' + l.valor + ' ' + W.dataBR(l.liquidadoEm)).toLowerCase())}" style="justify-content:flex-start;gap:8px"><input type="checkbox" data-vl="${esc(l._id)}" data-v="${+l.valor || 0}" ${(seed.lancIds || []).includes(l._id) ? 'checked' : ''}><span>${W.dataBR(l.liquidadoEm || W.vencDe(l))} · ${esc(l.desc || '')} ${l.op ? '<span class="note mono">' + esc(l.op) + '</span>' : ''} · <b>${W.fmtBRL(+l.valor || 0)}</b></span></label>`).join('') || '<p class="empty">Nenhum.</p>'}</div></div></div>
      <p id="vbs" style="margin-top:10px"></p>`, '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="vbok" disabled>Conciliar</button>');
    m.querySelector('.modal').classList.add('larga');
    const somar = s => [...m.querySelectorAll(s + ':checked')].reduce((a, i) => a + +i.dataset.v, 0);
    const conta = () => { const sm = Math.round(somar('[data-vm]') * 100) / 100, sl = Math.round(somar('[data-vl]') * 100) / 100, igual = sm > 0 && Math.abs(sm - sl) < 0.005;
      m.querySelector('#vbs').innerHTML = `Banco <b>${W.fmtBRL(sm)}</b> · sistema <b>${W.fmtBRL(sl)}</b> · ${igual ? '<span class="pill ok">as somas batem</span>' : `diferença <b class="neg">${W.fmtBRL(sm - sl)}</b>`}`; m.querySelector('#vbok').disabled = !igual; };
    m.querySelectorAll('input[type=checkbox]').forEach(i => i.onchange = conta); conta();
    m.querySelector('#vbq').oninput = e => { const q = e.target.value.toLowerCase().trim(); m.querySelectorAll('[data-txt]').forEach(r => { r.style.display = !q || r.dataset.txt.includes(q) ? '' : 'none'; }); };
    m.querySelector('#vbok').onclick = () => {
      const r = W.vincularGrupo(H.db, [...m.querySelectorAll('[data-vm]:checked')].map(i => i.dataset.vm), [...m.querySelectorAll('[data-vl]:checked')].map(i => i.dataset.vl), eu());
      if (!r.ok) return H.toast(esc(r.msg));
      H.salvar(); H.fecharModal(); H.toast(`Conciliado: ${W.fmtBRL(r.banco)}.`); H.render();
    };
  }
  function resolver(k, it) {
    if (!it) return H.render();
    if (k === 'semLancamento') return resolverSemLancamento(it);
    if (k === 'semBanco') return resolverSemBanco(it);
    if (k === 'grupoDiferente') { const m = H.modal('Vínculo que não fecha', `<p>O banco soma ${W.fmtBRL(it.banco)} e os lançamentos ${W.fmtBRL(it.sistema)}: algum valor mudou depois de vincular.</p>`, '<button class="btn" data-x>Fechar</button><button class="btn blue" id="gdes">Desfazer o vínculo</button>'); m.querySelector('#gdes').onclick = () => { W.desvincularGrupo(H.db, it.grupo); H.salvar(); H.fecharModal(); H.render(); }; return; }
    if (k === 'saldoDiferente' || k === 'extratoQuebrado') { const e = H.db.hubExtratos.find(x => x && x.contaId === it.contaId && x.mes === it.mes); return e ? conciliar(e._id) : novoExtrato(); }
    if (it.lancId) { const l = H.db.fin.find(x => x && x._id === it.lancId); if (l && H.editarLanc) return H.editarLanc(l); }
    if (k === 'notasOrfas') return resolverNota(it.notaId);
    if (k === 'faltaExtrato' || k === 'extratoSemMovimentos') return novoExtrato();
    if (k === 'contaSemCadastro') return configurar();
    H.render();
  }
  /* Nota sem lançamento: vincular a um lançamento (parcela) ou registrar o motivo. */
  function resolverNota(id) {
    const n = H.db.hubNotas.find(x => x && x._id === id); if (!n) return H.render();
    const cands = H.db.fin.filter(l => l && (l.empresa || 'WindGate') === (n.empresa || 'WindGate') && !W.transferencia(l))
      .map(l => ({ l, d: Math.abs((+l.valor || 0) - (+n.valor || 0)) + (n.op && l.op === n.op ? 0 : 1e9) })).sort((a, b) => a.d - b.d).slice(0, 80).map(x => x.l);
    const m = H.modal(`Nota ${n.numero || ''} sem lançamento`, `<p class="note" style="margin-bottom:10px">${esc(n.emitente || '')} → ${esc(n.destinatario || '')} · ${W.fmtBRL(n.valor)} · ${W.dataBR(n.data)}${n.op ? ' · ' + esc(n.op) : ''}</p>
      <div class="fields"><div class="f w3"><label class="lbl" for="rnl">Vincular ao lançamento</label><select id="rnl">${cands.map(l => `<option value="${esc(l._id)}">${W.dataBR(W.vencDe(l))} · ${esc(l.desc || l.categoria || '')} · ${esc(l.op || '')} · ${W.fmtBRL(l.valor)}${W.realizado(l) ? '' : ' (previsto)'}</option>`).join('')}</select></div>
      <div class="f"><label class="lbl" for="rnv">Valor vinculado</label><input id="rnv" type="number" step="0.01" placeholder="parcela"></div>
      <div class="f w4"><label class="lbl" for="rnm">Ou: motivo de não ter lançamento no trimestre</label><input id="rnm" value="${esc((n.semLancamento || {}).motivo || '')}" placeholder="ex.: a receber no próximo trimestre"></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn" id="rnsem">Registrar motivo</button><button class="btn blue" id="rnok">Vincular</button>');
    m.querySelector('#rnok').onclick = () => {
      const l = H.db.fin.find(x => x && x._id === m.querySelector('#rnl').value); if (!l) return;
      const v = +m.querySelector('#rnv').value || Math.min(+n.valor || 0, +l.valor || 0);
      l.notas = (l.notas || []).concat([{ notaId: n._id, chave: n.chave || '', numero: n.numero || '', valorVinculado: Math.round(v * 100) / 100 }]);
      l.alteracoes = (l.alteracoes || []).concat([{ em: new Date().toISOString(), por: eu(), acao: 'nota ' + (n.numero || n._id) + ' vinculada' }]);
      H.salvar(); H.fecharModal(); H.toast('Nota vinculada'); H.render();
    };
    m.querySelector('#rnsem').onclick = () => { const mo = m.querySelector('#rnm').value.trim(); if (!mo) { H.toast('Escreva o motivo'); return; } n.semLancamento = { motivo: mo, por: eu(), em: new Date().toISOString() }; H.salvar(); H.fecharModal(); H.render(); };
  }

  /* ---------- Pacote: o que o contador vê ---------- */
  function painelPacote(f, contador) {
    if (H.perfil().id !== 'contador') return '';
    const pac = f.entrega && f.entrega.pacotes ? Object.values(f.entrega.pacotes) : [];
    return `<div class="box"><div class="box-h"><h2>Pacote do fechamento</h2>${pac.length && !(contador && contador.recebidoEm) ? '<button class="btn pri" id="frec">Confirmar recebimento</button>' : ''}</div><div class="box-b list">
      ${pac.length ? pac.map(p => `<div class="row"><span>${p.empresa === 'todas' ? 'SF + JeT' : p.empresa === 'JeT' ? 'JeT' : 'SF'} · gerado por ${esc(p.por)} em ${W.dataBR(p.em)} · planilha, notas, extratos e comprovantes${p.liberadoComPendencias ? ' · <span class="pill warn">com pendências (ver a aba na planilha)</span>' : ''}</span><a class="btn sm" href="${esc(p.link)}" target="_blank" rel="noopener">Baixar</a></div>`).join('')
        + (contador && contador.recebidoEm ? `<p class="note">Recebimento confirmado em ${W.dataBR(contador.recebidoEm)}.</p>` : '')
        : '<p class="empty">O pacote deste trimestre ainda não foi gerado.</p>'}</div></div>`;
  }

  function marcar(id, st) {
    const n = H.db.hubNotas.find(x => x && x._id === id); if (!n) return H.render();
    n.status = st; if (st === 'conferida') { n.conferidaPor = eu(); n.conferidaEm = new Date().toISOString(); } else { n.lancadaPor = eu(); n.lancadaEm = new Date().toISOString(); }
    H.salvar(); H.render();
  }

  function baixarCSV(notas) {
    const col = ['data', 'numero', 'serie', 'chave', 'tipo', 'empresa', 'emitente', 'emitenteCnpj', 'destinatario', 'destCnpj', 'valor', 'cfop', 'status', 'xmlLink', 'pdfLink'];
    const csv = [col.join(';')].concat(notas.map(n => col.map(c => `"${String(n[c] == null ? '' : n[c]).replace(/"/g, '""')}"`).join(';'))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = `notas-${tri}.csv`; a.click();
  }

  async function subir(f) {
    const fd = new FormData(); fd.append('arquivo', f);
    const r = await H.api('/api/upload', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}));
    if (!j.success) throw new Error(j.message || 'falha no envio'); return H.linkDoUpload(j);
  }

  function novaNota() {
    const m = H.modal('Nova nota fiscal', `<p class="note" style="margin-bottom:10px">Envie o <b>XML</b> (o sistema lê tudo sozinho) e, se quiser, o PDF. Para NFS-e ou nota sem XML, preencha os campos.</p>
      <div class="fields"><div class="f w2"><label class="lbl" for="nx">XML da NF-e</label><input id="nx" type="file" accept=".xml,text/xml"></div><div class="f w2"><label class="lbl" for="np">PDF / DANFE</label><input id="np" type="file" accept=".pdf,image/*"></div>
      <div class="f"><label class="lbl" for="nt">Tipo</label><select id="nt">${Object.entries(TIPOS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="f"><label class="lbl" for="ne">Empresa</label><select id="ne"><option value="WindGate">SF Trading</option><option value="JeT">JeT</option></select></div>
      <div class="f"><label class="lbl" for="nn">Número</label><input id="nn"></div><div class="f"><label class="lbl" for="nd">Data de emissão</label><input id="nd" type="date"></div>
      <div class="f w2"><label class="lbl" for="nem">Emitente</label><input id="nem"></div><div class="f w2"><label class="lbl" for="nde">Destinatário</label><input id="nde"></div>
      <div class="f"><label class="lbl" for="nv">Valor (R$)</label><input id="nv" type="number" step="0.01"></div>
      <div class="f"><label class="lbl" for="nop">Operação</label><select id="nop"><option value="">—</option>${H.db.ops.filter(o => o && o.id).map(o => `<option>${esc(o.id)}</option>`).join('')}</select></div>
      <div class="f w2"><label class="lbl" for="nob">Observação</label><input id="nob"></div></div><p class="note" id="nlido" style="margin-top:8px"></p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="nok">Guardar nota</button>');
    let lido = null;
    m.querySelector('#nx').onchange = e => { const f = e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => {
      lido = W.lerXmlNFe(fr.result); const out = m.querySelector('#nlido');
      if (!lido) { out.textContent = 'Este arquivo não parece um XML de NF-e.'; return; }
      const cl = W.classificarNota(lido, cfg().cnpjs || { WindGate: '58.762.606/0001-44' });
      m.querySelector('#nt').value = cl.tipo; if (cl.empresa) m.querySelector('#ne').value = cl.empresa;
      m.querySelector('#nn').value = lido.numero; m.querySelector('#nd').value = lido.data; m.querySelector('#nem').value = lido.emitente; m.querySelector('#nde').value = lido.destinatario; m.querySelector('#nv').value = lido.valor || '';
      out.innerHTML = `Lido: NF ${esc(lido.numero)} · ${esc(lido.emitente)} · ${W.fmtBRL(lido.valor)} · chave ${esc(lido.chave.slice(0, 8))}…`;
    }; fr.readAsText(f); };
    m.querySelector('#nok').onclick = async () => {
      const g = s => m.querySelector(s).value.trim(), b = m.querySelector('#nok');
      if (!lido && !g('#nn') && !m.querySelector('#np').files[0]) { H.toast('Envie o XML, o PDF ou preencha o número'); return; }
      if (lido && lido.chave && H.db.hubNotas.some(n => n && n.chave === lido.chave)) { H.toast('Esta nota já está no sistema'); return; }
      b.disabled = true; b.textContent = 'Guardando…';
      let xmlLink = '', pdfLink = '';
      try { if (m.querySelector('#nx').files[0]) xmlLink = await subir(m.querySelector('#nx').files[0]); if (m.querySelector('#np').files[0]) pdfLink = await subir(m.querySelector('#np').files[0]); }
      catch (e) { H.toast('Arquivo não enviado (' + esc(e.message) + '). Os dados da nota foram guardados mesmo assim.'); }
      H.db.hubNotas.unshift(Object.assign({}, lido || {}, { _id: W.novoId(), tipo: g('#nt'), empresa: g('#ne'), numero: g('#nn'), data: g('#nd') || W.hojeISO(), emitente: g('#nem'), destinatario: g('#nde'), valor: +g('#nv') || 0,
        op: g('#nop'), obs: g('#nob'), xmlLink, pdfLink, origem: 'upload', status: 'recebida', por: eu(), em: new Date().toISOString() }));
      H.salvar(); H.fecharModal(); H.toast('Nota guardada'); H.render();
    };
  }

  function novoExtrato() {
    const contas = cfg().contas || [];
    if (!contas.length) { H.toast('Cadastre antes as contas bancárias em Configurar'); return configurar(); }
    const mesPad = (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 7); })();
    const m = H.modal('Novo extrato', `<div class="fields"><div class="f w2"><label class="lbl" for="xc">Conta</label><select id="xc">${contas.map(c => `<option value="${esc(c.id)}">${esc((c.empresa === 'JeT' ? 'JeT' : 'SF') + ' · ' + c.banco + ' ' + (c.nome || ''))}</option>`).join('')}</select></div>
      <div class="f"><label class="lbl" for="xm">Mês</label><input id="xm" type="month" value="${mesPad}"></div><div class="f w4"><label class="lbl" for="xa">Arquivo (OFX de preferência; PDF também vale)</label><input id="xa" type="file" accept=".ofx,.pdf,.csv"></div>
      <div class="f w2"><label class="lbl" for="xsi">Saldo inicial do mês (PDF)</label><input id="xsi" type="number" step="0.01"></div><div class="f w2"><label class="lbl" for="xsf">Saldo final do mês (PDF)</label><input id="xsf" type="number" step="0.01"></div></div>
      <p class="note" style="margin-top:8px">Com OFX, o sistema confere cada movimento com o Financeiro e mostra o que não tem lançamento.</p><p class="note" id="xlido"></p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="xok">Guardar extrato</button>');
    let ofx = null;
    m.querySelector('#xa').onchange = e => { const f = e.target.files[0]; if (!f || !/\.(ofx|qfx|ofc)$/i.test(f.name)) return; const fr = new FileReader(); fr.onload = () => {
      ofx = W.lerOFX(fr.result); if (ofx) { m.querySelector('#xlido').textContent = `OFX lido: ${ofx.transacoes.length} movimentos de ${W.dataBR(ofx.inicio)} a ${W.dataBR(ofx.fim)}.`; if (ofx.inicio) m.querySelector('#xm').value = ofx.inicio.slice(0, 7); } }; fr.readAsText(f, 'latin1'); };
    m.querySelector('#xok').onclick = async () => {
      const f = m.querySelector('#xa').files[0]; if (!f) { H.toast('Escolha o arquivo do extrato'); return; }
      const conta = contas.find(c => c.id === m.querySelector('#xc').value), mes = m.querySelector('#xm').value;
      let link = ''; try { link = await subir(f); } catch (e) { H.toast('Arquivo não enviado (' + esc(e.message) + ').'); return; }
      const trans = ofx ? W.conciliar(H.db, ofx.transacoes, conta.empresa, conta.id) : null;
      H.db.hubExtratos.unshift({ _id: W.novoId(), contaId: conta.id, empresa: conta.empresa, banco: conta.banco, contaNome: conta.nome || '', mes, link, formato: ofx ? 'OFX' : (f.name.split('.').pop() || '').toUpperCase(),
        saldo: ofx ? ofx.saldo : (m.querySelector('#xsf').value !== '' ? +m.querySelector('#xsf').value : null), saldoInicial: !ofx && m.querySelector('#xsi').value !== '' ? +m.querySelector('#xsi').value : undefined, transacoes: trans, por: eu(), em: new Date().toISOString() });
      H.salvar(); H.fecharModal(); H.toast(trans ? `Extrato guardado: ${trans.filter(t => t.lancId).length} de ${trans.length} movimentos batem com o Financeiro.` : 'Extrato guardado'); H.render();
    };
  }

  function configurar() {
    const c = cfg(), cnpjs = Object.assign({ WindGate: '58.762.606/0001-44', JeT: '' }, c.cnpjs), contas = (c.contas || []).slice();
    const pedro = (H.db.users || {}).pedro || {};
    const m = H.modal('Configurar Fiscal & Contabilidade', `<h3 class="h3">CNPJs do grupo</h3><div class="fields"><div class="f w2"><label class="lbl" for="cs">SF Trading</label><input id="cs" value="${esc(cnpjs.WindGate)}"></div><div class="f w2"><label class="lbl" for="cj">JeT Import</label><input id="cj" value="${esc(cnpjs.JeT)}"></div></div>
      <h3 class="h3" style="margin-top:14px">Contas</h3><p class="note">Conta bancária tem extrato e saldo conferidos. Câmbio e cartão servem para marcar por onde o pagamento saiu, sem extrato.</p><div class="list" id="cl"></div><div class="fields"><div class="f"><label class="lbl" for="cbe">Empresa</label><select id="cbe"><option value="WindGate">SF</option><option value="JeT">JeT</option></select></div><div class="f"><label class="lbl" for="cbb">Banco</label><input id="cbb" placeholder="Ex.: Itaú"></div><div class="f"><label class="lbl" for="cbn">Agência/conta</label><input id="cbn"></div><div class="f"><label class="lbl" for="cbt">Tipo</label><select id="cbt">${W.TIPOS_CONTA.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div><div class="f" style="align-self:end"><button class="btn" id="cba" type="button">Adicionar</button></div></div>
      ${H.pode('fiscal.total') ? `<h3 class="h3" style="margin-top:14px">Fechamento trimestral</h3><div class="fields"><div class="f w2"><label class="lbl" for="cmot">Motivos de lançamento sem nota (um por linha)</label><textarea id="cmot" rows="6">${esc(W.motivosSemNota(H.db).map(x => x[1]).join('\n'))}</textarea></div><div class="f w2"><label class="lbl" for="cnat">Naturezas das despesas da empresa (uma por linha)</label><textarea id="cnat" rows="6">${esc(W.naturezas(H.db).join('\n'))}</textarea></div></div>` : ''}
      <h3 class="h3" style="margin-top:14px">E-mail de notas</h3><div class="fields"><div class="f w4"><label class="lbl" for="ce">Endereço que encaminha para o sistema</label><input id="ce" value="${esc(c.emailNotas || '')}" placeholder="notas@windgate.com.br"></div></div>
      ${H.pode('torre.outros') ? `<h3 class="h3" style="margin-top:14px">Acesso do contador</h3><div class="fields"><div class="f w2"><label class="lbl" for="pn">Nome</label><input id="pn" value="${esc(pedro.nome || 'Pedro')}"></div><div class="f w2"><label class="lbl" for="pp">PIN de acesso</label><input id="pp" inputmode="numeric" maxlength="8" placeholder="${pedro.pin ? 'manter o atual' : '4 a 8 números'}"></div></div>
      <p class="note">O contador vê só esta área: notas e extratos. O servidor não envia a ele operações, financeiro, CRM nem cotações.</p>` : ''}`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="cok">Salvar</button>');
    const desenhar = () => { m.querySelector('#cl').innerHTML = contas.map((x, i) => `<div class="row"><span>${x.empresa === 'JeT' ? 'JeT' : 'SF'} · ${esc(x.banco)} ${esc(x.nome || '')}${x.tipo && x.tipo !== 'banco' ? ' <span class="note">(' + esc(x.tipo) + ')</span>' : ''}</span><button class="btn ghost sm" data-rm="${i}" type="button">Remover</button></div>`).join('') || '<p class="note">Nenhuma conta cadastrada.</p>';
      m.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { contas.splice(+b.dataset.rm, 1); desenhar(); }); };
    desenhar();
    m.querySelector('#cl').insertAdjacentHTML('afterend', '<p style="margin:6px 0"><button class="btn sm" type="button" id="cmig">Preencher a conta dos lançamentos sem conta</button> <span class="note">JeT no Itaú da JeT, o resto no Santander da SF. Fica marcado para revisar; nada é apagado.</span></p>');
    m.querySelector('#cmig').onclick = () => { const r = W.migrarContas(H.db, eu()); if (!r.jet && !r.sf) return H.toast('Cadastre antes a conta do Santander da SF e a do Itaú da JeT.'); H.salvar(); H.toast(r.preenchidos + ' lançamento(s) receberam conta. Revise os pagos por câmbio e cartão.'); };
    m.querySelector('#cba').onclick = () => { const b = m.querySelector('#cbb').value.trim(); if (!b) return; contas.push({ id: W.novoId(), empresa: m.querySelector('#cbe').value, banco: b, nome: m.querySelector('#cbn').value.trim(), tipo: (m.querySelector('#cbt') || {}).value || 'banco', ativa: true }); m.querySelector('#cbb').value = m.querySelector('#cbn').value = ''; desenhar(); };
    m.querySelector('#cok').onclick = () => {
      const extra = {};
      if (m.querySelector('#cmot')) {
        const ant = W.motivosSemNota(H.db), slug = l => l.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
        extra.motivosSemNota = m.querySelector('#cmot').value.split('\n').map(x => x.trim()).filter(Boolean).map(l => { const a = ant.find(x => x[1] === l); return [a ? a[0] : slug(l), l]; });
        extra.naturezas = m.querySelector('#cnat').value.split('\n').map(x => x.trim()).filter(Boolean);
      }
      H.db.hubPainel._fiscal = Object.assign({}, c, { cnpjs: { WindGate: m.querySelector('#cs').value.trim(), JeT: m.querySelector('#cj').value.trim() }, contas, emailNotas: m.querySelector('#ce').value.trim() }, extra);
      const pp = m.querySelector('#pp');
      if (pp && (pp.value.trim() || !pedro.pin)) {
        const pin = pp.value.trim(); if (!/^\d{4,8}$/.test(pin)) { H.toast('PIN do contador com 4 a 8 números'); return; }
        H.db.users.pedro = Object.assign({}, pedro, { nome: m.querySelector('#pn').value.trim() || 'Pedro', papel: 'Contador', cor: '#5B6B8C', pin, perfilHub: 'contador', tabs: [], fin: false });
      } else if (pp && pedro.pin) H.db.users.pedro = Object.assign({}, pedro, { nome: m.querySelector('#pn').value.trim() || pedro.nome, perfilHub: 'contador' });
      H.salvar(); H.fecharModal(); H.toast('Configuração salva'); H.render();
    };
  }
})();
