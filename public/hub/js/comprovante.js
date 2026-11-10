/* Hub 2.0 — "Enviar comprovante": PDF, imagem ou print colado → leitura por IA →
   sugestão (baixa de um previsto ou lançamento novo) → a pessoa confere e
   confirma. Nada é gravado sem o clique em Confirmar; quem grava é o servidor
   (POST /api/fin/comprovante/confirmar), que barra o comprovante repetido. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  const fila = [];          // [{ arquivo, url, link, sugestao, semIA, erro, pendenteId }]
  let pos = 0, opPadrao = '';

  const paraBase64 = f => new Promise((ok, erro) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = erro; fr.readAsDataURL(f); });
  async function subir(f) {
    const fd = new FormData(); fd.append('arquivo', f);
    const r = await H.api('/api/upload', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}));
    if (!j.success) throw new Error(j.message || 'falha no envio'); return H.linkDoUpload(j);
  }

  /** Abre a janela de envio. opts.op: operação da ficha (pré-seleciona no lançamento novo). */
  H.enviarComprovante = function (opts) {
    if (!H.pode('fin.lancar')) { H.toast('Só quem lança no Financeiro envia comprovante.'); return; }
    opPadrao = (opts && opts.op) || '';
    const pend = (H.db.hubComprovantes || []).filter(x => x && x.status === 'pendente');
    const m = H.modal('Enviar comprovante', `<p class="note" style="margin-bottom:10px">PDF ou imagem, vários de uma vez, ou cole um print aqui (Ctrl+V). A IA lê e sugere: dar baixa num lançamento previsto ou lançar um novo. <b>Nada é gravado até você confirmar.</b></p>
      <div class="fields"><div class="f w4"><label class="lbl" for="cpa">Comprovantes</label><input id="cpa" type="file" multiple accept=".pdf,image/*"></div>
        <div class="f w4"><label class="lbl" for="cpl">Texto do lançamento</label><input id="cpl" placeholder="o que vem escrito com o print, ex.: captação abgail op20"></div></div>
      <p class="note" style="margin-top:4px">O texto vira a descrição do lançamento novo; se citar a operação (op20, OP 20), o lançamento já vai para ela.</p>
      <div id="cpcola" tabindex="0" style="margin-top:8px;border:1px dashed var(--line);border-radius:8px;padding:14px;text-align:center" class="note">Clique aqui e cole o print (Ctrl+V)</div>
      <p class="note" id="cpst" style="margin-top:8px"></p>
      ${pend.length ? `<p style="margin-top:10px"><button class="btn sm" id="cppend" type="button">${pend.length} comprovante(s) do e-mail aguardando conferência</button></p>` : ''}`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="cpler">Ler comprovantes</button>');
    const colados = [];
    const st = m.querySelector('#cpst');
    m.querySelector('#cpcola').addEventListener('paste', e => {
      const fs = [...(e.clipboardData || {}).items || []].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
      fs.forEach((f, i) => colados.push(new File([f], `print-${Date.now()}-${i}.png`, { type: f.type || 'image/png' })));
      // Print copiado junto com a legenda: o texto vem no mesmo Ctrl+V.
      const tx = (e.clipboardData && e.clipboardData.getData('text/plain')) || '', cpl = m.querySelector('#cpl');
      if (tx.trim() && cpl && !cpl.value.trim()) cpl.value = tx.trim().replace(/\s+/g, ' ').slice(0, 120);
      st.textContent = `${colados.length} print(s) colado(s).`; e.preventDefault();
    });
    const bp = m.querySelector('#cppend'); if (bp) bp.onclick = () => { fila.length = 0; pos = 0; pend.forEach(x => fila.push({ link: x.link, url: x.link, nome: x.nome, sugestao: x.sugestao, pendenteId: x._id, lidoPorIA: true })); H.fecharModal(); mostrar(); };
    m.querySelector('#cpler').onclick = async e => {
      const arqs = [...m.querySelector('#cpa').files].concat(colados);
      if (!arqs.length) { H.toast('Escolha ou cole ao menos um comprovante'); return; }
      e.target.disabled = true; fila.length = 0; pos = 0;
      const legenda = m.querySelector('#cpl').value.trim(), leg = W.legendaDoComprovante(H.db, legenda);
      const manual = () => ({ acao: 'novo', campos: { tipo: 'Despesa', empresa: 'WindGate', op: leg.op || opPadrao || 'WindGate', data: W.hojeISO(), desc: leg.desc, contraparte: {} }, leitura: {},
        avisos: leg.opCitada && !leg.op ? [`O texto cita ${leg.opCitada}, que não está nas operações: confira a operação.`] : [] });
      for (let i = 0; i < arqs.length; i++) {
        const f = arqs[i]; st.textContent = `Lendo ${i + 1} de ${arqs.length}: ${f.name}…`;
        const item = { arquivo: f, nome: f.name, url: URL.createObjectURL(f), legenda };
        try {
          item.link = await subir(f);
          const r = await H.api('/api/ia/comprovante', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ arquivo: { nome: f.name, mime: f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : 'image/png'), base64: await paraBase64(f) }, legenda }) });
          const j = await r.json().catch(() => ({}));
          if (j.success) { item.sugestao = j.sugestao; item.lidoPorIA = true; }
          else if (j.semIA) { item.semIA = j.message; item.sugestao = manual(); }
          else { item.erro = j.message || 'não consegui ler'; item.sugestao = manual(); }
          if (opPadrao && item.sugestao.acao === 'novo' && (!item.sugestao.campos.op || item.sugestao.campos.op === 'WindGate')) item.sugestao.campos.op = opPadrao;
        } catch (x) { item.erro = 'arquivo não enviado: ' + x.message; item.sugestao = manual(); }
        fila.push(item);
      }
      H.fecharModal(); mostrar();
    };
  };

  /* Uma sugestão por vez, com o comprovante ao lado. */
  function mostrar() {
    const it = fila[pos];
    if (!it) { H.toast(fila.length ? 'Fila de comprovantes concluída' : 'Nada para conferir'); H.render(); return; }
    const s = it.sugestao || { acao: 'novo', campos: {} }, c = s.campos || {}, cp = c.contraparte || {}, dup = s.acao === 'duplicado';
    const ops = (H.db.ops || []).filter(o => o && o.id).map(o => o.id).sort((a, b) => String(b).localeCompare(String(a), 'pt-BR', { numeric: true }));
    const sel = (a, b) => String(a || '') === String(b) ? 'selected' : '';
    const ehPdf = /pdf/i.test((it.arquivo && it.arquivo.type) || it.nome || it.link || '');
    const ver = it.url ? (ehPdf ? `<object data="${esc(it.url)}" type="application/pdf" style="width:100%;height:440px"><a href="${esc(it.url)}" target="_blank" rel="noopener">Abrir o PDF</a></object>` : `<img src="${esc(it.url)}" alt="Comprovante" style="max-width:100%;max-height:440px;border:1px solid var(--line);border-radius:6px">`) : '<p class="note">Sem pré-visualização.</p>';
    const motivos = W.motivosSemNota(H.db), conf = (s.leitura && s.leitura.confianca) || {};
    const baixo = k => conf[k] != null && conf[k] < 0.7 ? ' <span class="pill warn" title="a IA leu com pouca certeza">conferir</span>' : '';
    const m = H.modal(`Comprovante ${pos + 1} de ${fila.length}${it.nome ? ' · ' + it.nome : ''}`, `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:14px">
      <div>${ver}</div><div>
      ${it.semIA ? `<p class="banner" style="margin-bottom:8px">${esc(it.semIA)}</p>` : ''}${it.erro ? `<p class="banner" style="margin-bottom:8px">Não consegui ler: ${esc(it.erro)}. Preencha à mão.</p>` : ''}
      ${dup ? `<p class="banner" style="margin-bottom:8px"><b>${esc((s.avisos || [])[0] || 'Comprovante já lançado.')}</b> Não será lançado de novo.</p>` : ''}
      ${(s.avisos || []).filter(() => !dup).map(a => `<p class="note" style="margin-bottom:4px">⚠ ${esc(a)}</p>`).join('')}
      ${dup ? '' : `<div class="fields">
        <div class="f w4"><label class="lbl" for="qa">O que fazer</label><select id="qa"><option value="novo" ${sel(s.acao, 'novo')}>Lançamento novo</option>${s.alvo ? `<option value="baixa" ${sel(s.acao, 'baixa')}>Dar baixa: ${esc(s.alvo.desc || '')} · ${esc(s.alvo.op || '')} · ${W.fmtBRL(s.alvo.valor)} · venc. ${W.dataBR(s.alvo.vencimento)}</option>` : ''}</select></div>
        <div class="f"><label class="lbl" for="qt">Tipo</label><select id="qt"><option ${sel(c.tipo, 'Despesa')}>Despesa</option><option ${sel(c.tipo, 'Receita')}>Receita</option></select></div>
        <div class="f"><label class="lbl" for="qv">Valor (R$)${baixo('valor')}</label><input id="qv" type="number" step="0.01" value="${c.valor || ''}"></div>
        <div class="f"><label class="lbl" for="qd">Data${baixo('data')}</label><input id="qd" type="date" value="${esc(W.soData(c.data))}"></div>
        <div class="f"><label class="lbl" for="qe">Empresa</label><select id="qe"><option value="WindGate" ${sel(c.empresa, 'WindGate')}>SF</option><option value="JeT" ${sel(c.empresa, 'JeT')}>JeT</option></select></div>
        <div class="f w2"><label class="lbl" for="qo">Operação</label><select id="qo"><option value="WindGate">Sem operação (despesa da empresa)</option>${ops.map(o => `<option ${sel(c.op, o)}>${esc(o)}</option>`).join('')}</select></div>
        <div class="f w2"><label class="lbl" for="qx">Descrição</label><input id="qx" value="${esc(c.desc || '')}"></div>
        <div class="f w2"><label class="lbl" for="qcn">${c.tipo === 'Receita' ? 'Pagador' : 'Favorecido'}${baixo('favorecido')}</label><input id="qcn" value="${esc(cp.nome || '')}"></div>
        <div class="f"><label class="lbl" for="qcd">CNPJ/CPF</label><input id="qcd" value="${esc(cp.documento || '')}"></div>
        <div class="f"><label class="lbl" for="qct">Contraparte</label><select id="qct">${W.TIPOS_CONTRAPARTE.map(([k, l]) => `<option value="${k}" ${sel(cp.tipo, k)}>${esc(l)}</option>`).join('')}</select></div>
        <div class="f w2"><label class="lbl" for="qsn">Sem nota? (motivo)</label><select id="qsn"><option value="">Tem nota (vincular depois)</option>${motivos.map(([k, l]) => `<option value="${esc(k)}" ${sel((c.semNota || {}).motivo, k)}>${esc(l)}</option>`).join('')}</select></div>
        <div class="f w2"><label class="lbl" for="qso">Complemento do motivo</label><input id="qso" value="${esc((c.semNota || {}).obs || '')}" placeholder="obrigatório em câmbio e outro"></div></div>
        ${s.leitura && s.leitura.idTransacao ? `<p class="note" style="margin-top:6px">Identificador: <span class="mono">${esc(s.leitura.idTransacao)}</span></p>` : ''}
        ${it.semIA ? '<p style="margin-top:8px"><button class="btn sm" id="qbusca" type="button">Procurar lançamento previsto que bate</button></p>' : ''}`}
      </div></div>`,
      `<button class="btn" data-x>Fechar a fila</button><button class="btn" id="qpula">${dup ? 'Próximo' : 'Pular'}</button>${dup ? '' : '<button class="btn blue" id="qok">Confirmar</button>'}`);
    m.querySelector('.modal').classList.add('larga');
    const g = id => m.querySelector(id);
    const ler = () => ({ acao: g('#qa').value, alvoId: g('#qa').value === 'baixa' ? s.alvoId : null, leitura: s.leitura || {},
      campos: Object.assign({}, c, { tipo: g('#qt').value, valor: +g('#qv').value, data: g('#qd').value, empresa: g('#qe').value, op: g('#qo').value || 'WindGate', desc: g('#qx').value.trim(),
        contraparte: { nome: g('#qcn').value.trim(), documento: g('#qcd').value.replace(/\D/g, ''), tipo: g('#qct').value },
        semNota: g('#qsn').value ? { motivo: g('#qsn').value, obs: g('#qso').value.trim() } : null }) });
    g('#qpula').onclick = () => { pos++; mostrar(); };
    const busca = g('#qbusca');
    if (busca) busca.onclick = async () => {
      const x = ler(), cnpjEmp = ((H.db.hubPainel._fiscal || {}).cnpjs || {})[x.campos.empresa] || (x.campos.empresa === 'WindGate' ? '58762606000144' : '');
      const leitura = { tipo: 'outro', data: x.campos.data, valor: x.campos.valor, descricao: x.campos.desc,
        pagador: x.campos.tipo === 'Receita' ? x.campos.contraparte : { documento: cnpjEmp }, favorecido: x.campos.tipo === 'Receita' ? { documento: cnpjEmp } : x.campos.contraparte };
      const r = await H.api('/api/fin/comprovante/sugerir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leitura, empresa: x.campos.empresa, legenda: it.legenda || '' }) });
      const j = await r.json().catch(() => ({}));
      if (j.success) { it.sugestao = j.sugestao; H.fecharModal(); mostrar(); } else H.toast(esc(j.message || 'Não consegui procurar.'));
    };
    const okb = g('#qok');
    if (okb) okb.onclick = async () => {
      const x = ler();
      if (!(x.campos.valor > 0) || !x.campos.data) { H.toast('Informe o valor e a data'); return; }
      okb.disabled = true; okb.textContent = 'Gravando…';
      try {
        const r = await H.api('/api/fin/comprovante/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sugestao: x, link: it.link || '', lidoPorIA: !!it.lidoPorIA, pendenteId: it.pendenteId || '' }) });
        const j = await r.json().catch(() => ({}));
        if (!j.success) { H.toast(esc(j.message || 'Não gravou.')); okb.disabled = false; okb.textContent = 'Confirmar'; return; }
        H.aplicarDoServidor('fin', j.lanc); if (j.pendente) H.aplicarDoServidor('hubComprovantes', j.pendente);
        H.toast(j.novo ? `Lançamento de <b>${W.fmtBRL(j.lanc.valor)}</b> registrado` : `Baixa de <b>${W.fmtBRL(j.lanc.valor)}</b> registrada`);
        pos++; mostrar();
      } catch (e) { okb.disabled = false; okb.textContent = 'Confirmar'; H.toast('Não consegui gravar agora.'); }
    };
  }
})();
