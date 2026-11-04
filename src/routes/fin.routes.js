/**
 * Comprovante lido por IA → lançamento, e pacote trimestral do contador.
 *
 * Comprovante: POST /api/ia/comprovante só LÊ e SUGERE (nada é gravado);
 * POST /api/fin/comprovante/confirmar grava, depois de uma pessoa conferir a
 * sugestão na tela. Só quem tem `fin.lancar` (Davi, Matheus, diretoria).
 *
 * Pacote: POST /api/fiscal/pacote monta no servidor a planilha (.xlsx) e o ZIP
 * com notas, extratos e comprovantes. Só sai com o fechamento zerado; a
 * diretoria pode liberar com pendências, e fica registrado quem liberou e o
 * que faltava. O contador baixa pelo link registrado em
 * hubPainel._fiscal.entregas[tri] — nunca recebe o financeiro inteiro.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const W = Object.assign({}, require('../../public/hub/js/regras.js'), require('../../public/hub/js/comex.js'), require('../../public/hub/js/fin-regras.js'));
const { criarZip } = require('../services/zip.service');

module.exports = function registrar(app, ctx) {
  const { auth, gravarParcial, quemChat, pronto, db, ia, salvarArquivo } = ctx;
  const agora = () => new Date().toISOString();
  const nomeDe = (d, k) => String((((d && d.users) || {})[k] || {}).nome || k || '').split(' ')[0];
  const pode = (d, k, cap) => k === '(sem-auth)' || W.pode(d || {}, k, cap);

  async function base(req, res, cap, msg) {
    await pronto(); const d = db();
    if (!d) { res.status(503).json({ success: false, message: 'Banco central indisponível.' }); return null; }
    const k = quemChat(req);
    if (!pode(d, k, cap)) { res.status(403).json({ success: false, message: msg || 'Sem permissão.' }); return null; }
    return { d, k };
  }

  /* ---------- 1. Leitura: devolve a sugestão, não grava ---------- */
  app.post('/api/ia/comprovante', auth.exigirTokenSeAtiva, async (req, res) => {
    const b = await base(req, res, 'fin.lancar', 'Só quem lança no Financeiro envia comprovante.'); if (!b) return;
    const { arquivo, empresa } = req.body || {};
    if (!ia.ativa()) return res.json({ success: false, semIA: true, message: 'IA desligada: falta a chave no servidor. Preencha à mão; o arquivo fica anexado.' });
    if (!arquivo || !arquivo.base64) return res.status(400).json({ success: false, message: 'Envie o comprovante (PDF ou imagem).' });
    try {
      const lido = await ia.lerComprovante({ base64: arquivo.base64, mime: arquivo.mime });
      const sugestao = W.sugerirComprovante(b.d, lido, { empresa });
      res.json({ success: true, sugestao, modelo: ia.MODELO() });
    } catch (e) { res.status(e.semIA ? 200 : 502).json({ success: false, semIA: !!e.semIA, message: e.message }); }
  });

  /* Sugestão para leitura digitada à mão (sem IA): mesmas regras de baixa e duplicidade. */
  app.post('/api/fin/comprovante/sugerir', auth.exigirTokenSeAtiva, async (req, res) => {
    const b = await base(req, res, 'fin.lancar'); if (!b) return;
    res.json({ success: true, sugestao: W.sugerirComprovante(b.d, (req.body || {}).leitura || {}, { empresa: (req.body || {}).empresa }) });
  });

  /* ---------- 2. Confirmação humana: só aqui o lançamento é gravado ---------- */
  app.post('/api/fin/comprovante/confirmar', auth.exigirTokenSeAtiva, async (req, res) => {
    const b = await base(req, res, 'fin.lancar', 'Só quem lança no Financeiro confirma comprovante.'); if (!b) return;
    const { sugestao, link, lidoPorIA, pendenteId } = req.body || {};
    if (!sugestao || !['baixa', 'novo'].includes(sugestao.acao)) return res.status(sugestao && sugestao.acao === 'duplicado' ? 409 : 400).json({ success: false, message: sugestao && sugestao.acao === 'duplicado' ? 'Comprovante já lançado.' : 'Sugestão inválida.' });
    const r = W.aplicarComprovante(b.d, sugestao, { quem: nomeDe(b.d, b.k), agora: agora(), link, lidoPorIA: !!lidoPorIA, podeAlterarBaixaAlheia: pode(b.d, b.k, 'fin.excluir') });
    if (r.erro) return res.status(r.codigo || 400).json({ success: false, message: r.erro, duplicadoDe: r.duplicadoDe || null });
    const parcial = { fin: [r.lanc] };
    const pend = pendenteId && ((b.d.hubComprovantes || []).find(x => x && x._id === pendenteId));
    if (pend) parcial.hubComprovantes = [Object.assign({}, pend, { status: 'lancado', lancId: r.lanc._id, por: nomeDe(b.d, b.k), em: agora() })];
    try { await gravarParcial(parcial); res.json({ success: true, lanc: r.lanc, novo: r.novo, pendente: parcial.hubComprovantes ? parcial.hubComprovantes[0] : null }); }
    catch (e) { res.status(503).json({ success: false, message: e.message }); }
  });

  /* ---------- 3. Pacote do trimestre para o contador ---------- */
  const nomeConta = c => `${c.empresa === 'JeT' ? 'JeT' : 'SF'} ${c.banco || ''} ${c.nome || ''}`.replace(/\s+/g, ' ').trim();
  const limpo = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 60);
  const ext = (link, padrao) => { const m = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(String(link || '')); return m ? m[1].toLowerCase() : padrao; };
  async function baixar(link) {
    const s = String(link || '');
    if (s.startsWith('/uploads/')) { const p = path.join(__dirname, '../../uploads', path.basename(s)); return fs.readFileSync(p); }
    if (!/^https?:\/\//i.test(s)) throw new Error('link inválido');
    const r = await fetch(s); if (!r.ok) throw new Error('HTTP ' + r.status);
    return Buffer.from(await r.arrayBuffer());
  }
  function planilha(d, f, pendencias) {
    const P = W.linhasPacote(d, f), wb = XLSX.utils.book_new(), nomes = new Set();
    const aba = nome => { let n = String(nome).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Aba'; for (let i = 2; nomes.has(n); i++) n = n.slice(0, 28) + ' ' + i; nomes.add(n); return n; };
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Conta', 'Mês', 'Entradas', 'Saídas', 'Saldo do extrato', 'Saldo do sistema', 'Diferença']].concat(P.resumo)), aba('Resumo'));
    P.porConta.forEach(pc => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([W.COLUNAS_PACOTE].concat(pc.linhas)), aba(nomeConta(pc.conta))));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Data', 'Tipo', 'Número', 'Chave', 'Emitente', 'CNPJ emitente', 'Destinatário', 'CNPJ destinatário', 'Valor', 'Lançamento(s)', 'XML', 'PDF']].concat(P.notas)), aba('Notas do trimestre'));
    if (pendencias) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Pendência', 'Quantidade']].concat(W.PENDENCIAS.map(([k, l]) => [l, (f.pendencias[k] || []).length]).filter(x => x[1]))), aba('Pendências liberadas'));
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  app.post('/api/fiscal/pacote', auth.exigirTokenSeAtiva, async (req, res) => {
    const b = await base(req, res, 'fiscal.editar', 'Só quem confere o Fiscal gera o pacote do contador.'); if (!b) return;
    const { tri, empresa, liberar, motivo } = req.body || {};
    if (!/^\d{4}-T[1-4]$/.test(String(tri || ''))) return res.status(400).json({ success: false, message: 'Trimestre inválido (ex.: 2026-T3).' });
    const emp = empresa === 'JeT' || empresa === 'WindGate' ? empresa : 'todas', d = b.d;
    const f = W.fechamento(d, tri, emp, W.hojeISO());
    const diretoria = pode(d, b.k, 'fin.autorizar');
    if (!f.contas.length) return res.status(409).json({ success: false, message: 'Cadastre as contas bancárias antes de fechar o trimestre.' });
    if (!f.pronto && !(liberar && diretoria)) return res.status(409).json({ success: false, pendencias: f.qtdPendencias, message: `${f.qtdPendencias} pendência(s) no fechamento: o pacote só sai com tudo zerado${diretoria ? ' (ou liberado por você, com o motivo)' : ' (ou liberado pela diretoria)'}.` });
    if (!f.pronto && !String(motivo || '').trim()) return res.status(400).json({ success: false, message: 'Para liberar com pendências, escreva o motivo.' });

    /* Arquivos: notas por mês, extratos e comprovantes por mês e conta. */
    const arquivos = [], faltou = [];
    const juntar = async (link, nome) => { if (!link) return; try { arquivos.push({ nome, dados: await baixar(link) }); } catch (e) { faltou.push(`${nome}: ${e.message} (${link})`); } };
    const contaDe = id => f.contas.find(c => c.id === id);
    for (const n of (d.hubNotas || []).filter(n => n && W.trimestreDe(n.data) === tri && (emp === 'todas' || (n.empresa || 'WindGate') === emp))) {
      const pasta = `notas/${String(n.data).slice(0, 7)}`, nome = limpo(`${n.tipo || 'nota'}-${n.numero || n.chave || n._id}`);
      await juntar(n.xmlLink, `${pasta}/${nome}.xml`); await juntar(n.pdfLink, `${pasta}/${nome}.${ext(n.pdfLink, 'pdf')}`);
    }
    for (const e of (d.hubExtratos || []).filter(e => e && f.meses.includes(e.mes) && (emp === 'todas' || (e.empresa || 'WindGate') === emp))) {
      const c = contaDe(e.contaId); await juntar(e.link, `${e.mes}/${limpo(c ? nomeConta(c) : e.banco)}/extrato-${e.mes}.${ext(e.link, (e.formato || 'ofx').toLowerCase())}`);
    }
    for (const m of f.movimentos.filter(m => m.lanc)) {
      const c = contaDe(m.contaId), l = m.lanc, link = l.comp || (l.comprovante && l.comprovante.link);
      await juntar(link, `${m.mes}/${limpo(c ? nomeConta(c) : m.contaId)}/comprovantes/${m.data}-${limpo(l.desc || l._id).slice(0, 30)}-${String(l._id).slice(0, 8)}.${ext(link, 'pdf')}`);
    }
    const xlsx = planilha(d, f, !f.pronto);
    const resumo = W.linhasPacote(d, f).resumo.map(([conta, mes, entradas, saidas, extrato, sistema, dif]) => ({ conta, mes, entradas, saidas, extrato, sistema, dif }));
    const leia = [`Pacote do fechamento ${tri} · ${emp === 'todas' ? 'SF + JeT' : emp === 'JeT' ? 'JeT' : 'SF'}`, `Gerado por ${nomeDe(d, b.k)} em ${agora()}`,
      `Movimentos: ${f.total} · completos: ${f.completos} (${Math.round(f.pct * 100)}%)`, f.pronto ? 'Fechamento sem pendências.' : `LIBERADO COM ${f.qtdPendencias} PENDÊNCIA(S) por ${nomeDe(d, b.k)}: ${String(motivo).trim()}`,
      '', 'Saldos por conta e mês (extrato × sistema):', ...resumo.map(r => `${r.conta} ${r.mes}: extrato ${r.extrato} · sistema ${r.sistema} · diferença ${r.dif}`),
      ...(faltou.length ? ['', 'Arquivos que não foram baixados (link no registro):', ...faltou] : [])].join('\r\n');
    const zip = criarZip([{ nome: `fechamento-${tri}.xlsx`, dados: xlsx }, { nome: 'LEIA-ME.txt', dados: leia }].concat(arquivos));
    const hash = crypto.createHash('sha256').update(zip).digest('hex');
    let link = '';
    try { link = await salvarArquivo(`fechamento-${tri}-${emp}.zip`, zip, 'application/zip'); }
    catch (e) { return res.status(502).json({ success: false, message: 'Não consegui guardar o pacote: ' + e.message }); }
    const entrega = { em: agora(), por: nomeDe(d, b.k), empresa: emp, link, hash, bytes: zip.length, arquivos: arquivos.length + 2, faltou: faltou.length,
      resumo: { movimentos: f.total, completos: f.completos, pct: f.pct, saldos: resumo }, liberadoComPendencias: f.pronto ? null : { por: nomeDe(d, b.k), motivo: String(motivo).trim(), pendencias: Object.fromEntries(Object.entries(f.pendencias).filter(([, v]) => v.length).map(([k, v]) => [k, v.length])) } };
    const cfg = Object.assign({}, ((d.hubPainel || {})._fiscal) || {}), ant = (cfg.entregas || {})[tri] || {};
    cfg.entregas = Object.assign({}, cfg.entregas, { [tri]: Object.assign({}, ant, { em: entrega.em, por: entrega.por, link, hash, pacotes: Object.assign({}, ant.pacotes, { [emp]: entrega }) }) });
    try { await gravarParcial({ hubPainel: { _fiscal: cfg } }); } catch (e) { return res.status(503).json({ success: false, message: e.message }); }
    res.json({ success: true, entrega, fiscal: cfg });
  });

  /* ---------- Opcional: comprovante que chega por e-mail vira sugestão pendente ----------
     Desligado por padrão (WINDGATE_COMPROVANTES_EMAIL=1 liga). Nunca vira lançamento sozinho. */
  async function comprovantesDoEmail(anexos) {
    const d = db(); if (!d || !ia.ativa()) return 0;
    const novos = [];
    for (const a of anexos || []) {
      if ((d.hubComprovantes || []).some(x => x && x.hash === a.hash)) continue;
      try {
        const sugestao = W.sugerirComprovante(d, await ia.lerComprovante({ base64: a.base64, mime: a.mime }), {});
        novos.push({ _id: W.novoId(), status: 'pendente', origem: 'email', de: a.de || '', nome: a.nome || '', link: a.link || '', hash: a.hash || '', sugestao, em: agora() });
      } catch (e) { console.warn('⚠️ Comprovante do e-mail:', e.message); }
    }
    if (novos.length) await gravarParcial({ hubComprovantes: novos });
    return novos.length;
  }
  return { comprovantesDoEmail };
};
