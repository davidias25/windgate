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
            ${editar() ? `<button class="btn ${f.pronto ? 'pri' : ''}" id="fenv" ${f.entrega ? 'disabled' : ''}>${f.entrega ? 'Enviado ao contador em ' + W.dataBR(f.entrega.em) : 'Enviar trimestre ao contador'}</button>` : ''}
            ${H.perfil().id === 'contador' ? `<button class="btn pri" id="fapu" ${contador && contador.apuradoEm ? 'disabled' : ''}>${contador && contador.apuradoEm ? 'Apuração concluída' : 'Marcar trimestre como apurado'}</button>` : ''}</div></div>
          <div class="box"><div class="box-h"><h2>Extratos bancários</h2></div><div class="box-b list">
            ${f.extratos.length ? f.extratos.map(e => `<div class="row"><div><b>${esc(e.banco || '')} ${esc(e.contaNome || '')}</b> · ${e.mes.split('-').reverse().join('/')}<br><small class="note">${e.formato || ''}${e.transacoes ? ' · ' + e.transacoes.length + ' movimentos · ' + e.transacoes.filter(t => t.lancId).length + ' conciliados com o Financeiro' : ''}${e.saldo != null ? ' · saldo ' + W.fmtBRL(e.saldo) : ''}</small></div>${e.link ? `<a class="btn ghost sm" href="${esc(e.link)}" target="_blank" rel="noopener">Abrir</a>` : ''}</div>`).join('') : '<p class="empty">Nenhum extrato neste trimestre.</p>'}</div></div>
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
    const on = (id, fn) => { const x = el.querySelector(id); if (x) x.onclick = fn; };
    on('#fnota', novaNota); on('#fext', novoExtrato); on('#fcfg', configurar);
    on('#fenv', () => { const e = Object.assign({}, cfg().entregas, { [tri]: { em: new Date().toISOString(), por: eu() } }); H.db.hubPainel._fiscal = Object.assign({}, cfg(), { entregas: e }); H.salvar(); H.toast('Trimestre enviado ao contador. Ele vê tudo no acesso dele.'); H.render(); });
    on('#fapu', () => { H.db.hubPainel._fiscalContador = Object.assign({}, H.db.hubPainel._fiscalContador, { [tri]: { apuradoEm: new Date().toISOString(), por: eu() } }); H.salvar(); H.toast('Apuração registrada'); H.render(); });
    on('#fsefaz', async () => {
      const r = await H.api('/api/fiscal/sefaz', { method: 'POST' }); const j = await r.json().catch(() => ({}));
      H.toast(j.success ? `SEFAZ: ${j.novas} nota(s) nova(s) de ${j.consultadas} consultada(s).` : esc(j.message || 'Não consegui consultar.'));
    });
  };

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
    if (!j.success) throw new Error(j.message || 'falha no envio'); return j.finalUrl || j.supabaseUrl || j.localUrl;
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
      <div class="f"><label class="lbl" for="xm">Mês</label><input id="xm" type="month" value="${mesPad}"></div><div class="f w4"><label class="lbl" for="xa">Arquivo (OFX de preferência; PDF também vale)</label><input id="xa" type="file" accept=".ofx,.pdf,.csv"></div></div>
      <p class="note" style="margin-top:8px">Com OFX, o sistema confere cada movimento com o Financeiro e mostra o que não tem lançamento.</p><p class="note" id="xlido"></p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="xok">Guardar extrato</button>');
    let ofx = null;
    m.querySelector('#xa').onchange = e => { const f = e.target.files[0]; if (!f || !/\.ofx$/i.test(f.name)) return; const fr = new FileReader(); fr.onload = () => {
      ofx = W.lerOFX(fr.result); if (ofx) { m.querySelector('#xlido').textContent = `OFX lido: ${ofx.transacoes.length} movimentos de ${W.dataBR(ofx.inicio)} a ${W.dataBR(ofx.fim)}.`; if (ofx.inicio) m.querySelector('#xm').value = ofx.inicio.slice(0, 7); } }; fr.readAsText(f, 'latin1'); };
    m.querySelector('#xok').onclick = async () => {
      const f = m.querySelector('#xa').files[0]; if (!f) { H.toast('Escolha o arquivo do extrato'); return; }
      const conta = contas.find(c => c.id === m.querySelector('#xc').value), mes = m.querySelector('#xm').value;
      let link = ''; try { link = await subir(f); } catch (e) { H.toast('Arquivo não enviado (' + esc(e.message) + ').'); return; }
      const trans = ofx ? W.conciliar(H.db, ofx.transacoes, conta.empresa) : null;
      H.db.hubExtratos.unshift({ _id: W.novoId(), contaId: conta.id, empresa: conta.empresa, banco: conta.banco, contaNome: conta.nome || '', mes, link, formato: ofx ? 'OFX' : (f.name.split('.').pop() || '').toUpperCase(),
        saldo: ofx ? ofx.saldo : null, transacoes: trans, por: eu(), em: new Date().toISOString() });
      H.salvar(); H.fecharModal(); H.toast(trans ? `Extrato guardado: ${trans.filter(t => t.lancId).length} de ${trans.length} movimentos batem com o Financeiro.` : 'Extrato guardado'); H.render();
    };
  }

  function configurar() {
    const c = cfg(), cnpjs = Object.assign({ WindGate: '58.762.606/0001-44', JeT: '' }, c.cnpjs), contas = (c.contas || []).slice();
    const pedro = (H.db.users || {}).pedro || {};
    const m = H.modal('Configurar Fiscal & Contabilidade', `<h3 class="h3">CNPJs do grupo</h3><div class="fields"><div class="f w2"><label class="lbl" for="cs">SF Trading</label><input id="cs" value="${esc(cnpjs.WindGate)}"></div><div class="f w2"><label class="lbl" for="cj">JeT Import</label><input id="cj" value="${esc(cnpjs.JeT)}"></div></div>
      <h3 class="h3" style="margin-top:14px">Contas bancárias</h3><div class="list" id="cl"></div><div class="fields"><div class="f"><label class="lbl" for="cbe">Empresa</label><select id="cbe"><option value="WindGate">SF</option><option value="JeT">JeT</option></select></div><div class="f"><label class="lbl" for="cbb">Banco</label><input id="cbb" placeholder="Ex.: Itaú"></div><div class="f"><label class="lbl" for="cbn">Agência/conta</label><input id="cbn"></div><div class="f" style="align-self:end"><button class="btn" id="cba" type="button">Adicionar</button></div></div>
      <h3 class="h3" style="margin-top:14px">E-mail de notas</h3><div class="fields"><div class="f w4"><label class="lbl" for="ce">Endereço que encaminha para o sistema</label><input id="ce" value="${esc(c.emailNotas || '')}" placeholder="notas@windgate.com.br"></div></div>
      ${H.pode('torre.outros') ? `<h3 class="h3" style="margin-top:14px">Acesso do contador</h3><div class="fields"><div class="f w2"><label class="lbl" for="pn">Nome</label><input id="pn" value="${esc(pedro.nome || 'Pedro')}"></div><div class="f w2"><label class="lbl" for="pp">PIN de acesso</label><input id="pp" inputmode="numeric" maxlength="8" placeholder="${pedro.pin ? 'manter o atual' : '4 a 8 números'}"></div></div>
      <p class="note">O contador vê só esta área: notas e extratos. O servidor não envia a ele operações, financeiro, CRM nem cotações.</p>` : ''}`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="cok">Salvar</button>');
    const desenhar = () => { m.querySelector('#cl').innerHTML = contas.map((x, i) => `<div class="row"><span>${x.empresa === 'JeT' ? 'JeT' : 'SF'} · ${esc(x.banco)} ${esc(x.nome || '')}</span><button class="btn ghost sm" data-rm="${i}" type="button">Remover</button></div>`).join('') || '<p class="note">Nenhuma conta cadastrada.</p>';
      m.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { contas.splice(+b.dataset.rm, 1); desenhar(); }); };
    desenhar();
    m.querySelector('#cba').onclick = () => { const b = m.querySelector('#cbb').value.trim(); if (!b) return; contas.push({ id: W.novoId(), empresa: m.querySelector('#cbe').value, banco: b, nome: m.querySelector('#cbn').value.trim(), ativa: true }); m.querySelector('#cbb').value = m.querySelector('#cbn').value = ''; desenhar(); };
    m.querySelector('#cok').onclick = () => {
      H.db.hubPainel._fiscal = Object.assign({}, c, { cnpjs: { WindGate: m.querySelector('#cs').value.trim(), JeT: m.querySelector('#cj').value.trim() }, contas, emailNotas: m.querySelector('#ce').value.trim() });
      const pp = m.querySelector('#pp');
      if (pp && (pp.value.trim() || !pedro.pin)) {
        const pin = pp.value.trim(); if (!/^\d{4,8}$/.test(pin)) { H.toast('PIN do contador com 4 a 8 números'); return; }
        H.db.users.pedro = Object.assign({}, pedro, { nome: m.querySelector('#pn').value.trim() || 'Pedro', papel: 'Contador', cor: '#5B6B8C', pin, perfilHub: 'contador', tabs: [], fin: false });
      } else if (pp && pedro.pin) H.db.users.pedro = Object.assign({}, pedro, { nome: m.querySelector('#pn').value.trim() || pedro.nome, perfilHub: 'contador' });
      H.salvar(); H.fecharModal(); H.toast('Configuração salva'); H.render();
    };
  }
})();
