/**
 * Cotações no Hub 2.0: o motor sem tela (cotacao-regras.js) tem de chegar aos
 * MESMOS números do `calc()` do sistema atual, que foi validado centavo a
 * centavo. O teste carrega o index.html de verdade (test/dom-stub.js), preenche
 * os campos da tela com cotações geradas ao acaso e compara, campo a campo, o
 * `R` do sistema atual com o do Hub — na direta e na triangular, com a margem
 * em % e em R$. Confere também desembolso, rateio da proposta, alíquotas por
 * NCM, a cópia do motor triangular e as regras de gravação e aprovação.
 */
process.env.SUPABASE_DISABLED = '1';
const fs = require('fs'), path = require('path');
const { carregarApp } = require('./dom-stub');
const C = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/cotacao-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const igual = (a, b) => (a == null && b == null) || Math.abs((+a || 0) - (+b || 0)) < 1e-6;

/* Gerador determinístico (sempre as mesmas cotações). */
let semente = 20261029;
const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const entre = (a, b, casas) => +(a + rnd() * (b - a)).toFixed(casas == null ? 2 : casas);
const UFS = Object.keys(C.ICMS_INTERNO).concat([C.SEM_DIFAL]);
function cotacaoAleatoria(i) {
  const tri = rnd() < 0.45;
  const n = 1 + Math.floor(rnd() * 4);
  const items = Array.from({ length: n }, (_, k) => ({ d: 'Item ' + k, ncm: rnd() < 0.1 ? '7308' : '73089090', q: Math.ceil(entre(1, 500, 0)), u: entre(1, 3000), p: entre(0, 800),
    ii: entre(0, 20, 1), ipi: entre(0, 10, 2), pis: entre(1.5, 3.5, 2), cofins: entre(7, 11, 2), c5291: rnd() < 0.4, mono: rnd() < 0.2 }));
  const exps = Array.from({ length: Math.floor(rnd() * 5) }, (_, k) => ({ l: 'Desp ' + k, v: entre(0, 3000) }));
  const fields = { tipoOp: tri ? 'triangular' : 'direta', servFora: '0', fabSinal: String(entre(10, 60, 0)), desR1: '', desR2: '', desR3: '', opNum: 'OP' + i, cliente: 'Cliente ' + i,
    ufDestino: UFS[Math.floor(rnd() * UFS.length)], mercadoria: 'Mercadoria ' + i, origem: 'Xangai/China', destino: 'Fortaleza/CE', incoterm: 'FOB', modalCntr: 'FCL', qtdCntr: '1', prazo: '60', validade: '7',
    txFrete: String(entre(4.8, 6.2, 4)), txDesp: String(entre(4.8, 6.2, 4)), pctInv: String(rnd() < 0.5 ? 100 : entre(50, 100, 0)), icmsEnt: String(entre(0, 4, 1)), icmsDest: String(rnd() < 0.8 ? 4 : 12),
    pisS: String(entre(0, 2, 2)), cofS: String(entre(0, 8, 2)), ipiS: String(rnd() < 0.7 ? 0 : entre(0, 5, 2)), mkp: String(entre(0, 3, 1)), mkSF: String(entre(0, 5000)), mkJT: String(entre(0, 3000)),
    outrasAdu: String(rnd() < 0.5 ? 0 : entre(0, 4000)), aliqST: String(entre(0, 18, 1)), freteUSD: String(entre(0, 6000)), seguro: String(entre(0, 900)), capatazia: String(entre(0, 1500)),
    transporte: String(entre(0, 9000)), siscomex: String(entre(150, 600)), afrmm: String(entre(0, 2500)), honorarios: String(entre(0, 3000)), margemPct: String(entre(5, 40, 1)), margemBRL: String(entre(1000, 60000)) };
  return { id: 'q_' + i, fields, items, exps, fotos: [], status: 'draft' };
}

/* Roda o calc() do sistema atual com a cotação nos campos da tela. */
function rodarLegado(app, q, modo) {
  const doc = app.document;
  C.CAMPOS.forEach(k => { doc.getElementById(k).value = q.fields[k] == null ? '' : String(q.fields[k]); });
  doc.getElementById('ufDestino').options = [1];   // já montado: o calc() não volta a UF para CE
  app.avaliar('state = ' + JSON.stringify({ items: q.items, exps: q.exps, fotos: [], blocos: null, status: 'draft', id: q.id, criadoPor: null, aprovadoPor: null, editando: false }));
  app.calc();
  if (modo === 'brl') { doc.getElementById('margemBRL').value = q.fields.margemBRL; app.marginFromBRL(); }
  return app.avaliar('R');
}
const CHAVES = ['compra', 'impostos', 'despesas', 'resultante', 'custoReal', 'st', 'nfSaida', 'chTot', 'fob', '__ii', '__ipi', '__pis', '__cof', '__icms', 'margem', 'preco'];
const CHAVES_TRI = ['P', 'nfSF', 'nfJT', 'difal', 'icmsES', 'custoGrupo', 'dEff', 'piso', 'nfEntrada', 'resultante'];

(async () => {
  const app = carregarApp();
  app.avaliar("USER = { key: 'davi', nome: 'Davi Dias', aprova: false, fin: true }");

  console.log('\nMotor da cotação: Hub × sistema atual (centavo a centavo):');
  let difs = [], nTri = 0, nDir = 0;
  for (let i = 0; i < 400; i++) {
    const q = cotacaoAleatoria(i), modo = i % 3 === 0 ? 'brl' : 'pct';
    const L = rodarLegado(app, q, modo), H = C.calcular(q, { modo });
    CHAVES.forEach(k => { if (!igual(L[k], H[k])) difs.push(`${q.id} ${modo} ${k}: ${L[k]} × ${H[k]}`); });
    ['fob', 'freteInt', 'terrestre', 'seguro', 'portuarias', 'honorarios'].forEach(k => { if (!igual(L.comp[k], H.comp[k])) difs.push(`${q.id} comp.${k}`); });
    if (q.fields.tipoOp === 'triangular') { nTri++; CHAVES_TRI.forEach(k => { if (!igual(L.tri[k], H.tri[k])) difs.push(`${q.id} ${modo} tri.${k}: ${L.tri[k]} × ${H.tri[k]}`); }); }
    else { nDir++; if (H.tri !== null || L.tri !== null) difs.push(q.id + ' tri deveria ser null'); }
  }
  ok(difs.length === 0, `400 cotações (${nDir} diretas, ${nTri} triangulares; margem em % e em R$): custo, impostos, DIFAL, NFs, margem e preço iguais${difs.length ? ' — ' + difs.slice(0, 5).join(' | ') : ''}`);

  // Uma cotação conferida à mão: FOB 10.000 a R$ 5,00 = 50.000; frete 1.000 USD × 5,30 = 5.300
  const qm = { id: 'qm', items: [{ d: 'Escora', ncm: '73089090', q: 1000, u: 10, p: 1, ii: 10.8, ipi: 0, pis: 2.1, cofins: 9.65 }], exps: [],
    fields: Object.assign({}, C.PADRAO, { txFrete: '5.3', txDesp: '5', pctInv: '100', icmsEnt: '0', freteUSD: '1000', siscomex: '0', honorarios: '0', ufDestino: C.SEM_DIFAL, icmsDest: '0', pisS: '0', cofS: '0', mkp: '0', margemPct: '25' }) };
  const Rm = C.calcular(qm);
  // CIF 55.300 · II 10,8% = 5.972,40 · PIS 2,1% = 1.161,30 · COFINS 9,65% = 5.336,45 · créditos voltam como resultante negativa
  ok(igual(Rm.compra, 55300) && igual(Rm.__ii, 5972.4) && igual(Rm.__pis, 1161.3) && igual(Rm.__cof, 5336.45), 'conferida à mão: compra 55.300, II 5.972,40, PIS 1.161,30, COFINS 5.336,45');
  ok(igual(Rm.custoReal, 55300 + 5972.4 + 1161.3 + 5336.45 - 1161.3 - 5336.45) && igual(Rm.preco, Rm.custoReal * 1.25) && Rm.st === 0, 'custo real = compra + impostos − créditos de PIS/COFINS (sem saída); preço = custo + 25%; sem DIFAL');

  console.log('\nCópia do motor triangular:');
  const semCR = t => t.replace(/\r\n/g, '\n');   // o Git do Windows pode trocar LF por CRLF no checkout
  const html = semCR(fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8')), js = semCR(fs.readFileSync(path.join(__dirname, '../public/hub/js/cotacao-regras.js'), 'utf8'));
  const corte = t => t.slice(t.indexOf('/* ==== INÍCIO triangular-core'), t.indexOf('/* ==== FIM triangular-core ==== */')).trimEnd();
  ok(corte(html).length > 10000 && corte(html) === corte(js), 'o trecho triangular-core do Hub é idêntico ao do index.html');
  ok(JSON.stringify(/const ICMS_INTERNO=\{([\s\S]*?)\};/.exec(html)[1].replace(/\s/g, '').split(',').map(x => x.split(':')).map(([u, v]) => [u, +v])) === JSON.stringify(Object.entries(C.ICMS_INTERNO)), 'tabela de ICMS interno por UF igual à do sistema atual');
  const snapLeg = /function snapshot\(\)\{[\s\S]*?\[([^\]]*)\]\s*\.forEach/.exec(html)[1].replace(/['\s]/g, '').split(',');
  ok(JSON.stringify(snapLeg) === JSON.stringify(C.CAMPOS), 'mesmos campos gravados na cotação (snapshot) que o sistema atual');

  console.log('\nDesembolso:');
  let difD = [];
  for (let i = 0; i < 60; i++) {
    const q = cotacaoAleatoria(1000 + i);
    const L = rodarLegado(app, q, 'pct'); app.desemSugerir();
    const sug = { desR1: app.document.getElementById('desR1').value, desR2: app.document.getElementById('desR2').value, desR3: app.document.getElementById('desR3').value };
    const H = C.calcular(q), s = C.desemSugerir(q, H);
    if (L.preco > 0 && (s.desR1 !== sug.desR1 || s.desR2 !== sug.desR2 || s.desR3 !== sug.desR3)) difD.push(q.id + ' sugestão');
    const q2 = Object.assign({}, q, { fields: Object.assign({}, q.fields, i % 2 ? s : { desR1: '1', desR2: '1', desR3: '1' }) });
    rodarLegado(app, q2, 'pct');
    const el = JSON.stringify(app.desemErrors().map(e => e.replace(/ \(use ⚖ Sugerir\)/, ' (use Sugerir)'))), eh = JSON.stringify(C.desemErros(q2, C.calcular(q2)));
    if (el !== eh) difD.push(q.id + ' erros: ' + el.slice(0, 80) + ' × ' + eh.slice(0, 80));
  }
  ok(difD.length === 0, 'sugestão de parcelas e travas do desembolso iguais ao sistema atual (60 cotações)' + (difD.length ? ' — ' + difD.slice(0, 3).join(' | ') : ''));
  const qd = cotacaoAleatoria(7), Rd = C.calcular(qd), sd = C.desemSugerir(qd, Rd);
  const qd2 = Object.assign({}, qd, { fields: Object.assign({}, qd.fields, sd) });
  ok(C.desemErros(qd2, C.calcular(qd2)).length === 0, 'a distribuição sugerida passa na regra (recebimento cobre a saída em toda etapa)');

  console.log('\nProposta e NCM:');
  let difP = [];
  for (let i = 0; i < 40; i++) {
    const q = cotacaoAleatoria(2000 + i); const L = rodarLegado(app, q, 'pct'); const H = C.calcular(q);
    const base = (H.preco || 0) - (H.st || 0);
    if (JSON.stringify(app.propostaItens(base)) !== JSON.stringify(C.propostaItens(q, H, base))) difP.push(q.id);
  }
  ok(difP.length === 0, 'rateio dos preços por item na proposta igual ao sistema atual, fechando com o total');
  app.avaliar("DB = DB || {}; DB.ncmlib = { '84295900': { d: 'Escavadeira conferida', ii: 0, ipi: 0, pis: 2.1, cofins: 9.65, mono: true } }");
  const dbN = { ncmlib: app.avaliar('DB.ncmlib') };
  const ncms = ['84295900', '73089090', '85371090', '9999', '1', '39269090', '2208'];
  ok(ncms.every(n => JSON.stringify(Object.assign({}, app.getNCMAliquotas(n))) === JSON.stringify((({ por, em, ...x }) => x)(C.aliquotasNCM(dbN, n)))), 'alíquotas por NCM: Catálogo conferido → tabela → capítulo, iguais ao sistema atual');
  ok(JSON.stringify(C.propostaBlocosPadrao()) === JSON.stringify(app.propostaBlocosPadrao()), 'blocos padrão da proposta iguais (banco fora, custos desmarcados, DIFAL sempre)');

  console.log('\nProposta em PDF: Hub × sistema atual:');
  const ger = require('../scripts/gerar-cotacao-hub.js');
  const pdfHub = semCR(fs.readFileSync(path.join(__dirname, '../public/hub/js/cotacao-pdf.js'), 'utf8'));
  const entreMarcas = t => t.slice(t.indexOf('/* ==== INÍCIO proposta-pdf ==== */\n') + 36, t.indexOf('/* ==== FIM proposta-pdf ==== */'));
  ok(entreMarcas(pdfHub) === ger.trechoProposta(html), 'o gerador da proposta no Hub é cópia fiel do index.html (se mudar lá, rode scripts/gerar-cotacao-hub.js)');
  ok(semCR(fs.readFileSync(path.join(__dirname, '../public/hub/vendor/jspdf.umd.min.js'), 'utf8')) === ger.bibliotecaJsPDF(html), 'mesma biblioteca jsPDF do sistema atual');
  /* PDF de mentira que anota cada traço: os dois geradores têm de desenhar exatamente a mesma coisa. */
  const fakePDF = log => function () { const doc = this; ['setFillColor', 'rect', 'addImage', 'setTextColor', 'setFont', 'setFontSize', 'text', 'setDrawColor', 'setLineWidth', 'line', 'circle', 'addPage', 'setPage', 'save']
    .forEach(m => { doc[m] = (...a) => { log.push(m + JSON.stringify(a)); return doc; }; });
    doc.splitTextToSize = (t, w) => String(t).match(new RegExp('.{1,' + Math.max(10, Math.round(w / 5)) + '}(\\s|$)', 'g')) || [String(t)];
    doc.getNumberOfPages = () => log.filter(x => x.startsWith('addPage')).length + 1; doc.output = () => ({ size: 1 }); };
  const vm = require('vm');
  let difPdf = [];
  for (let i = 0; i < 12; i++) {
    const q = cotacaoAleatoria(3000 + i);
    Object.assign(q.fields, { validadeFrete: i % 2 ? '2026-12-15' : '', modalCntr: i % 3 ? 'FCL' : 'LCL', origem: i % 2 ? 'Ningbo/China' : 'Hamburgo/Alemanha', transporte: i % 4 ? q.fields.transporte : '0' });
    Object.assign(q.fields, C.desemSugerir(q, C.calcular(q)));
    const blocos = Object.fromEntries(C.PROPOSTA_BLOCOS.concat(C.PROPOSTA_CUSTOS).map((b, k) => [b.k, (k + i) % 3 !== 0])); blocos.difal = true;
    const logL = [], logH = [];
    rodarLegado(app, q, 'pct');
    C.CAMPOS.concat(['validadeFrete']).forEach(k => { app.document.getElementById(k).value = q.fields[k] == null ? '' : String(q.fields[k]); });
    app.avaliar(`state.status = 'ok'; state.blocos = ${JSON.stringify(blocos)}; DB = DB || {}; DB.crm = []`);
    app.jspdf = { jsPDF: fakePDF(logL) };
    await app.gerarPropostaPDF();
    const R2 = C.calcular(Object.assign({}, q, { fields: Object.assign({}, q.fields) }));
    const ctxH = { document: { getElementById: () => ({}) }, console }; ctxH.window = ctxH; vm.createContext(ctxH);
    vm.runInContext(pdfHub, ctxH);
    ctxH.jspdf = { jsPDF: fakePDF(logH) };
    const camposH = C.camposDe(q);
    const P = ctxH.HUB_PROPOSTA({ V: k => camposH[k] == null ? '' : String(camposH[k]), N: k => parseFloat(camposH[k]) || 0, fmt: v => (isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      esc: s => String(s), toast: () => {}, cnpjFmt: app.cnpjFmt, crmDocAnexarProposta: async () => null, desemErrors: () => C.desemErros(q, R2), carregarFotosDaProposta: async () => [],
      state: { items: q.items, fotos: [], blocos, status: 'ok', id: q.id }, R: R2 });
    await P.gerarPropostaPDF();
    if (logL.length < 50 || JSON.stringify(logL) !== JSON.stringify(logH)) { const k = logL.findIndex((x, j) => x !== logH[j]); difPdf.push(`${q.id}: ${logL.length}×${logH.length} traços, 1º diferente: ${logL[k]} | ${logH[k]}`); }
  }
  ok(difPdf.length === 0, '12 propostas (direta, triangular, com e sem cada bloco): o PDF do Hub desenha traço a traço o mesmo do sistema atual' + (difPdf.length ? ' — ' + difPdf.slice(0, 2).join(' || ') : ''));

  console.log('\nGravação, aprovação e operação:');
  const base = cotacaoAleatoria(9); const Rb = C.calcular(base);
  const aprovada = C.snapshot(Object.assign({}, base, { status: 'ok', aprovadoPor: 'Samir' }), Rb);
  ok(!C.prepararGravacao(Object.assign({}, base, { status: 'ok' }), Rb, aprovada, false).ok, 'cotação aprovada não se altera sem "Editar cotação"');
  const semMudar = C.prepararGravacao(Object.assign({}, base, { status: 'ok', aprovadoPor: 'Samir' }), Rb, aprovada, true, 'Davi', '2026-10-29T10:00:00Z');
  ok(semMudar.ok && !semMudar.revogou && semMudar.registro.status === 'ok' && igual(semMudar.registro.precoAprovado, Rb.preco) && semMudar.registro.editadoPor === 'Davi', 'editada sem mudar o preço: a aprovação continua, com quem editou registrado');
  const caro = Object.assign({}, base, { status: 'ok', aprovadoPor: 'Samir', fields: Object.assign({}, base.fields, { margemPct: String(+base.fields.margemPct + 5) }) });
  const mudou = C.prepararGravacao(caro, C.calcular(caro), aprovada, true, 'Davi');
  ok(mudou.ok && mudou.revogou && mudou.registro.status === 'wait' && mudou.registro.aprovadoPor === null && mudou.registro.precoAprovado === null, 'mudou o preço: volta para a aprovação do Samir');
  const antiga = { id: 'q_x', fields: Object.assign({}, base.fields, { campoNovoDoLegado: 'x' }), items: base.items, exps: base.exps, campoExtra: { a: 1 }, status: 'draft' };
  const sx = C.snapshot(antiga, C.calcular(antiga));
  ok(sx.fields.campoNovoDoLegado === 'x' && sx.campoExtra.a === 1 && C.CAMPOS.every(k => k in sx.fields), 'gravar pelo Hub preserva campos que o Hub não conhece');
  delete antiga.fields.ipiS; delete antiga.fields.mkSF;
  ok(C.camposDe(antiga).ipiS === '0' && C.camposDe(antiga).mkSF === '2000', 'cotação antiga sem um campo abre com o mesmo padrão do sistema atual (IPI saída 0, mark-up SF 2.000)');
  const qOp = Object.assign({}, base, { fields: Object.assign({}, base.fields, C.desemSugerir(base, Rb), { opNum: 'op77' }) });
  const r1 = C.operacaoDaCotacao({ ops: [], fin: [] }, qOp, C.calcular(qOp), 'Samir', '2026-10-29');
  const o = C.desemOuts(qOp, C.calcular(qOp));
  ok(r1.id === 'OP77' && r1.op && r1.lancamentos.length === 6 && r1.lancamentos[0].tipo === 'Receita' && r1.lancamentos[0].vencimento === '2026-11-03' && igual(r1.lancamentos[1].valor, +o.o1.toFixed(2)), 'aprovada vira operação com as 3 parcelas e os 3 pagamentos (5, 35 e 95 dias)');
  const r2 = C.operacaoDaCotacao({ ops: [r1.op], fin: r1.lancamentos }, qOp, C.calcular(qOp), 'Samir', '2026-10-29');
  ok(r2.jaLancado && !r2.op && r2.lancamentos.length === 0, 'aprovar de novo não duplica a operação nem o cronograma');

  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
