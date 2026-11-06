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

  console.log('\nProposta em PDF: conteúdo:');
  {
    const gerar = async (q, st) => {
      const log = [], R3 = C.calcular(q), ctxP = { document: { getElementById: () => ({}) }, console }; ctxP.window = ctxP; vm.createContext(ctxP);
      vm.runInContext(pdfHub, ctxP); ctxP.jspdf = { jsPDF: fakePDF(log) };
      const cp = C.camposDe(q);
      const P = ctxP.HUB_PROPOSTA({ V: k => cp[k] == null ? '' : String(cp[k]), N: k => parseFloat(cp[k]) || 0, fmt: v => (isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), esc: s => String(s), toast: () => {}, cnpjFmt: app.cnpjFmt, crmDocAnexarProposta: async () => null, desemErrors: () => C.desemErros(q, R3), carregarFotosDaProposta: async () => [],
        state: Object.assign({ items: q.items, fotos: [], blocos: C.propostaBlocosPadrao(), status: 'ok', id: 'q' }, st), R: R3 });
      await P.gerarPropostaPDF();
      return { log, txt: log.filter(x => x.startsWith('text')).join(' '), R: R3 };
    };
    const it = (d, q, u, pf) => Object.assign(C.ITEM_PADRAO(), { d, q, u, p: 10, ii: 14, ipi: 5, pf });
    const nova = (extra, itens) => { const q = { fields: Object.assign({}, C.PADRAO, { txDesp: '5.5', txFrete: '5.61', cliente: 'Cliente', freteUSD: '3000', aliqST: '16' }, extra), items: itens || [it('Empilhadeira', 4, 5000)], exps: [] }; Object.assign(q.fields, C.desemSugerir(q, C.calcular(q))); return q; };
    const dir = await gerar(nova({ tipoOp: 'direta' }));
    ok(dir.R.st > 0 && !dir.txt.includes('ICMS-DIFAL'), 'cliente contribuinte: sem o bloco de DIFAL, mesmo com valor');
    const zero = await gerar(nova({ tipoOp: 'triangular', ufDestino: 'ES', icmsDest: '17' }));
    const tri = await gerar(nova({ tipoOp: 'triangular' }));
    ok(tri.txt.includes('ICMS-DIFAL') && tri.R.tri.difal > 0, 'cliente não contribuinte: bloco de DIFAL com o valor do motor');
    ok(!zero.R.tri.difal ? !zero.txt.includes('ICMS-DIFAL') : true, 'DIFAL zero: sem o bloco');
    ok(!tri.txt.includes('exclusivo') && tri.txt.includes('Incoterm'), 'sem "exclusivo desta carga", e a entrega segue o Incoterm');
    ok(!/spread|remessa|contrato de c[aâ]mbio|margem/i.test(tri.txt + dir.txt) && !C.PROPOSTA_CUSTOS.some(x => x.k === 'cFob'), 'sem remessa, contrato de câmbio, spread, margem ou FOB');
    ok(tri.txt.includes('90 a 100') && !tri.txt.includes('110 a 120'), 'prazo padrão: 90 a 100 dias');
    ok((await gerar(nova({ tipoOp: 'triangular', prazoProposta: '75 a 85' }))).txt.includes('75 a 85'), 'prazo configurável por proposta');
    ok(tri.txt.includes('Previsão: '), 'previsão de data em cada parcela');
    const desc = await gerar(nova({ tipoOp: 'direta', descontoProposta: '1500' }));
    ok(desc.txt.includes('Desconto comercial') && !dir.txt.includes('Desconto comercial'), 'desconto comercial em linha própria, só quando há');
    /* Box amarelo: 3 linhas ou 30, a caixa acompanha. */
    const caixa = r => { const i = r.log.findIndex(x => x.includes('Validade e câmbio.')); return JSON.parse(r.log.slice(0, i).reverse().find(x => x.startsWith('rect')).slice(4))[3]; };
    const linhasTexto = r => { const i = r.log.findIndex(x => x.includes('Validade e câmbio.')); return JSON.parse(r.log.slice(i).find(x => x.startsWith('text') && x.includes('Os valores')).slice(4))[0].length; };
    ok(caixa(dir) >= 25 + linhasTexto(dir) * 9.5, 'a altura da caixa amarela sai do número de linhas');
    /* Preço fixo: exemplo do carregador. */
    const qf = nova({ tipoOp: 'direta' }, [it('Empilhadeira', 4, 5000), it('Carregador', 1, 3000, 4031)]), Rf = C.calcular(qf), baseF = Rf.preco - Rf.st;
    const li = C.propostaItens(qf, Rf, baseF), li2 = C.propostaItens(Object.assign({}, qf, { items: qf.items.map(x => Object.assign({}, x, { pf: undefined })) }), Rf, baseF);
    ok(li[1].unit === 4031 && li[1].total === 4031, 'acessório com preço fixo: continua R$ 4.031');
    ok(li2[1].unit > 4031, 'sem o preço fixo, o rateio pelo FOB mudaria esse preço');
    ok(Math.abs(li[0].total + li[1].total - baseF) < 0.01, 'os itens continuam somando o total, ao centavo');
    ok(C.conferirPrecosFixos(qf, baseF) === '' && /passam/.test(C.conferirPrecosFixos(qf, 100)), 'preço fixo acima do total é recusado');
    /* Câmbio */
    const Cb = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), C, require('../public/hub/js/cambio-regras.js'));
    const qc = nova({ tipoOp: 'direta' }); qc.cambioProposta = Cb.congelarCambio(qc, 5.4, '2026-11-06');
    const tx = Cb.textoCambio(Cb.tabelaCambio(qc)), comT = await gerar(qc, { tabelaCambio: tx });
    ok(comT.txt.includes('5,4500') && tx.linhas.every(l => comT.txt.includes(l[1])) && !comT.txt.includes('câmbio do dia'), 'a proposta mostra a referência e a tabela do item 3, sem o texto antigo');
    ok(!comT.txt.includes('5,5000') && !comT.txt.includes('5,61'), 'não mostra o dólar de custo');
  }

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
  ok(r1.id === 'OP77' && r1.op && r1.lancamentos.filter(l => l.tipo === 'Receita').length === 3 && r1.lancamentos.filter(l => l.tipo === 'Despesa' && !l.desc.startsWith('3º')).length === 2 && r1.lancamentos.some(l => l.desc.startsWith('3º pagamento') && l.custo) && r1.lancamentos[0].tipo === 'Receita' && r1.lancamentos[0].vencimento === '2026-11-03' && igual(r1.lancamentos[1].valor, +o.o1.toFixed(2)), 'aprovada vira operação com as 3 parcelas e os 3 pagamentos (5, 35 e 95 dias)');
  const r2 = C.operacaoDaCotacao({ ops: [r1.op], fin: r1.lancamentos }, qOp, C.calcular(qOp), 'Samir', '2026-10-29');
  ok(r2.jaLancado && !r2.op && r2.lancamentos.length === 0, 'aprovar de novo não duplica a operação nem o cronograma');

  console.log('\nRelançar no Financeiro o que foi excluído:');
  {
    const fin = () => r1.lancamentos.map(l => Object.assign({}, l, { data: '2026-10-01' }));
    const semUm = fin().filter(l => !l.desc.startsWith('2º pagamento'));
    const r3 = C.operacaoDaCotacao({ ops: [r1.op], fin: semUm }, qOp, C.calcular(qOp), 'Samir', '2026-11-20');
    ok(r3.relancar && !r3.jaLancado && r3.lancamentos.length === 1 && r3.lancamentos[0].desc.startsWith('2º pagamento') && r3.lancamentos[0].tipo === 'Despesa', 'excluído o 2º pagamento: volta só ele');
    ok(r3.lancamentos[0].vencimento === '2026-11-05' && r3.lancamentos[0].status === 'Previsto' && r3.lancamentos[0].origem === r1.lancamentos[0].origem, 'com a data do cronograma original (35 dias do lançamento), como previsto');
    const pago = fin().map((l, i) => i === 0 ? Object.assign(l, { status: 'Realizado' }) : l).filter(l => !l.desc.startsWith('3º'));
    const r4 = C.operacaoDaCotacao({ ops: [r1.op], fin: pago }, qOp, C.calcular(qOp), 'Samir', '2026-11-20');
    const qtd3 = fin().filter(l => l.desc.startsWith('3º')).length;
    ok(r4.lancamentos.length === qtd3 && r4.lancamentos.every(l => l.desc.startsWith('3º')) && r4.jaExistem === fin().length - qtd3, 'o que já foi pago continua e não é relançado; voltam só os excluídos');
    const r5 = C.operacaoDaCotacao({ ops: [r1.op], fin: [] }, qOp, C.calcular(qOp), 'Samir', '2026-11-20');
    ok(!r5.relancar && !r5.jaLancado && r5.lancamentos.length === r1.lancamentos.length && r5.lancamentos[0].vencimento === '2026-11-25', 'todos excluídos: lança o cronograma inteiro, a partir de hoje');
    const r6 = C.operacaoDaCotacao({ ops: [], fin: semUm }, qOp, C.calcular(qOp), 'Samir', '2026-11-20');
    ok(r6.op && r6.relancar && r6.lancamentos.length === 1, 'operação excluída e recriada: volta a operação e só o que falta');
  }

  console.log('\nMesma cotação reaproveitada para outro número:');
  {
    const qNova = Object.assign({}, qOp, { fields: Object.assign({}, qOp.fields, { opNum: 'op77.2' }) });
    const r7 = C.operacaoDaCotacao({ ops: [r1.op], fin: r1.lancamentos }, qNova, C.calcular(qNova), 'Samir', '2026-11-20');
    ok(r7.id === 'OP77.2' && r7.op && !r7.jaLancado && r7.outraOp && r7.lancamentos.length === r1.lancamentos.length && r7.lancamentos.every(l => l.op === 'OP77.2'), 'OP77.2 não conta os lançamentos da OP77: oferece o cronograma inteiro');
    ok(r7.emOutraOp.length === r1.lancamentos.length && r7.emOutraOp[0].op === 'OP77', 'e mostra os que estão na OP77');
    const fin8 = r1.lancamentos.concat(r7.lancamentos);
    const r8 = C.operacaoDaCotacao({ ops: [r1.op, r7.op], fin: fin8 }, qNova, C.calcular(qNova), 'Samir', '2026-11-20');
    ok(r8.jaLancado && !r8.outraOp && !r8.lancamentos.length && r8.existentes.length === r7.lancamentos.length, 'depois de lançada, a OP77.2 não duplica');
    const r9 = C.operacaoDaCotacao({ ops: [r1.op, r7.op], fin: fin8 }, qOp, C.calcular(qOp), 'Samir', '2026-11-20');
    ok(r9.jaLancado && r9.existentes.every(l => l.op === 'OP77'), 'e a OP77 continua vendo só os dela');
    const r10 = C.operacaoDaCotacao({ ops: [], fin: r1.lancamentos.map(l => Object.assign({}, l, { op: ' op77 ' })) }, qOp, C.calcular(qOp), 'Samir', '2026-11-20');
    ok(r10.jaLancado, 'espaço e maiúscula no código da operação não enganam a regra');
  }

  console.log('\nTaxas do dólar pela PTAX de compra:');
  {
    const t = C.taxasDaPtax(5.4321);
    ok(t.txDesp === 5.4864 && t.txFrete === 5.5961, 'despesas = PTAX compra + 1% (5,4321 → 5,4864); frete = despesas + 2% (5,5961)');
    ok(C.taxasDaPtax(0) === null && C.taxasDaPtax(undefined) === null, 'sem PTAX não inventa taxa');
  }

  console.log('\nCotação aprovada no funil do CRM:');
  {
    const T = '2026-11-04T10:00:00Z';
    const qf = id => Object.assign({}, base, { id, status: 'ok', aprovadoPor: 'Samir', criadoPor: 'Davi', fields: Object.assign({}, base.fields, { opNum: 'OP90', cliente: 'Lima Construtora', mercadoria: 'Escoras' }) });
    const d = { crm: [{ _id: 'cL1', empresa: 'Lima Construtora LTDA' }], crmOps: [], ops: [], qindex: [], quotes: {} };
    const a = C.negocioDaCotacao(d, qf('q_f1'), { preco: 150000, por: 'Samir', agora: T });
    const n = a.negocio;
    ok(a.criado && d.crmOps.length === 1 && n._id === 'cot-q_f1' && n.quoteId === 'q_f1', 'aprovada sem negócio: cria um no funil, com _id tirado da cotação');
    ok(C.faseDe(n) === 'proposta' && n.etapa === 'Proposta enviada' && n.proxData === '2026-11-06', 'entra em Proposta enviada, com follow-up em 2 dias');
    ok(n.clienteId === 'cL1' && n.clienteNome === 'Lima Construtora' && n.titulo === 'OP90 · Escoras' && n.valor === 150000 && n.resp === 'Davi', 'liga ao cliente do CRM, título com nº e mercadoria, valor da cotação, responsável quem montou');
    const b = C.negocioDaCotacao(d, qf('q_f1'), { preco: 150000, por: 'Samir', agora: T });
    ok(!b.criado && d.crmOps.length === 1, 'aprovar de novo não duplica o negócio');
    d.crmOps.push({ _id: 'n9', quoteId: 'q_f2', fase: 'lead', etapa: 'Novo contato', titulo: 'do pedido', valor: 0 });
    C.negocioDaCotacao(d, qf('q_f2'), { preco: 80000, agora: T });
    ok(d.crmOps.length === 2 && C.faseDe(d.crmOps[1]) === 'proposta' && d.crmOps[1].valor === 80000, 'negócio já ligado à cotação avança de Lead para Proposta e ganha o valor');
    d.crmOps.push({ _id: 'n10', quoteId: 'q_f3', fase: 'negociacao', etapa: 'Negociação' }, { _id: 'n11', quoteId: 'q_f4', fase: 'perdido', etapa: 'Perdido' });
    C.negocioDaCotacao(d, qf('q_f3'), { agora: T }); C.negocioDaCotacao(d, qf('q_f4'), { agora: T });
    ok(C.faseDe(d.crmOps[2]) === 'negociacao' && C.faseDe(d.crmOps[3]) === 'perdido', 'negócio em Negociação ou Perdido não volta de fase');
    d.ops.push({ id: 'OP90', quoteId: 'q_f1' });
    C.negocioDaCotacao(d, qf('q_f1'), { agora: T });
    ok(C.faseDe(n) === 'ganho' && n.opId === 'OP90', 'cotação que virou operação deixa o negócio Ganho, ligado à operação');

    const d2 = { crm: [], crmOps: [], ops: [], quotes: { q_a: qf('q_a'), q_w: Object.assign(qf('q_w'), { status: 'wait' }) },
      qindex: [{ _id: 'i1', id: 'q_a', status: 'ok', preco: 99000 }, { _id: 'i2', id: 'q_w', status: 'wait', preco: 1 }] };
    ok(C.funilDasCotacoes(d2, { agora: T }) === 1 && d2.crmOps.length === 1 && d2.crmOps[0].quoteId === 'q_a' && d2.crmOps[0].valor === 99000 && d2.crmOps[0].clienteNome === 'Lima Construtora', 'aprovadas antes da regra entram no funil; aguardando aprovação não');
    d2.crmOps = [];
    ok(C.funilDasCotacoes(d2, { agora: T }) === 0 && d2.crmOps.length === 0, 'negócio excluído depois não volta (índice marcado com funilEm)');
  }

  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
