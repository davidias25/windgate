/**
 * Cotação com vários clientes no mesmo contêiner (etapa 1: só as regras, sem tela).
 * Caso de aceitação: 5 contêineres modulares, 4 empilhadeiras e 2 carregadores, câmbio 5,532
 * e FOB de R$ 126.162,79. As despesas são de exemplo. O Cliente B é suposição: direta, em CE.
 */
process.env.SUPABASE_DISABLED = '1';
const fs = require('fs'), path = require('path');
const C = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/cotacao-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.01 : t);
const reais = v => (+v).toFixed(2);

const CAMPOS = { tipoOp: 'direta', cliente: 'Márcio', ufDestino: 'RN', txDesp: '5.532', txFrete: '5.6426', pctInv: '100', icmsEnt: '1.6', icmsDest: '4', pisS: '1.65', cofS: '7.6', ipiS: '0', mkp: '1', aliqST: '16', fabSinal: '30',
  freteUSD: '6000', seguro: '800', capatazia: '1500', transporte: '9000', siscomex: '416.46', afrmm: '1100', honorarios: '1630', margemPct: '25', margemBRL: '0', outrasAdu: '0' };
const EXPS = [{ l: 'Scanner', v: 600 }, { l: 'THC', v: 1376 }];
const item = (d, q, u, p, cbm, ii, ipi, clienteId) => ({ d, ncm: '84271019', q, u, p, cbm, ii, ipi, pis: 2.1, cofins: 9.65, clienteId });
const itens = () => [item('Contêiner modular', 5, 1450, 2000, 15, 18, 0, 'A'), item('Empilhadeira', 2, 3595, 1200, 4, 12.6, 0, 'A'), item('Carregador', 2, 588, 30, 0.2, 14, 5, 'A'), item('Empilhadeira', 2, 3595, 1200, 4, 12.6, 0, 'B')];
const cliente = (id, nome, uf, extra) => Object.assign({ id, nome, ufDestino: uf, tipoOperacao: 'direta', clienteContribuinte: true, margemPct: '25', aliqST: '16', opNum: 'OP' + id, mercadoria: 'Carga de ' + nome }, extra || {});
const cotacao = (extra) => Object.assign({ id: 'q1', status: 'draft', fields: Object.assign({}, CAMPOS), items: itens(), exps: EXPS.map(e => Object.assign({}, e)), clientes: [cliente('A', 'Márcio', 'RN'), cliente('B', 'Cliente B', 'CE')], regraRateio: { frete: 'fob' } }, extra || {});
const semClientes = q => { const c = JSON.parse(JSON.stringify(q)); delete c.clientes; delete c.regraRateio; c.items.forEach(i => { delete i.clienteId; }); return c; };

console.log('\nTeste de aceitação:');
{
  const q = cotacao(), inteira = C.calcular(semClientes(q)), r = C.calcularPorCliente(q);
  ok(reais(inteira.fob) === '126162.79', 'FOB total de R$ 126.162,79, como no pedido');
  ok(!r.erros.length && !r.travas.length && r.clientes.length === 2, 'dois clientes, sem erro e sem trava');
  ok(perto(r.total.custo, inteira.custoReal), `(a) soma dos custos = custo da cotação inteira (R$ ${reais(r.total.custo)})`);
  ok(perto(r.clientes[0].R.fob + r.clientes[1].R.fob, inteira.fob), 'FOB dos clientes soma o FOB do contêiner');
  ok(perto(r.clientes[1].R.fob, 2 * 3595 * 5.532), 'Cliente B fica só com as 2 empilhadeiras');
  ['__ii', '__ipi', '__pis', '__cof', '__icms'].forEach(k => ok(perto(r.clientes[0].R[k] + r.clientes[1].R[k], inteira[k]), `${k.replace(/_/g, '').toUpperCase()}: a soma dos clientes é igual à da cotação inteira`));
  const [a, b] = r.clientes;
  ok(a.R.st > 0 && b.R.st > 0 && a.q.fields.ufDestino === 'RN' && b.q.fields.ufDestino === 'CE', '(b) DIFAL próprio, pela UF de cada cliente');
  const uma = C.calcularPorCliente(cotacao({ clientes: [cliente('A', 'Márcio', 'RN', { aliqST: '16' }), cliente('B', 'Cliente B', 'CE', { aliqST: '10' })] }));
  ok(uma.clientes[1].R.st < b.R.st && perto(uma.clientes[0].R.st, a.R.st), 'mudar a alíquota do Cliente B muda só o DIFAL dele');
  r.clientes.forEach(c => {
    const s = C.desemSugerir(c.q, c.R), d = C.desemOuts(c.q, c.R);
    const q2 = Object.assign({}, c.q, { fields: Object.assign({}, c.q.fields, s) });
    ok(!C.desemErros(q2, c.R).length && perto(d.o1 + d.o2, c.R.fob), `(b) ${c.nome}: cronograma próprio, com a regra de recebimento ≥ saída e fábrica proporcional ao FOB dele`);
  });
  ok(a.q.fields.cliente === 'Márcio' && a.q.items.length === 3 && !JSON.stringify(a.q).includes('Cliente B'), '(b) a cotação do Márcio para a proposta não cita o outro cliente');
  ok(b.q.items.length === 1 && !JSON.stringify(b.q).includes('Márcio') && !JSON.stringify(b.q).includes('Contêiner modular'), '(b) a do Cliente B não cita o Márcio nem os itens dele');
}

console.log('\nCom 1 cliente, nada muda:');
{
  const q = semClientes(cotacao()), r = C.calcularPorCliente(q), R = C.calcular(q);
  ok(!r.multi && JSON.stringify(r.clientes[0].R) === JSON.stringify(R), '(c) cotação de 1 cliente devolve exatamente o `calcular`');
  const c = C.clientesDe(q)[0];
  ok(c.nome === 'Márcio' && c.ufDestino === 'RN' && c.tipoOperacao === 'direta' && c.clienteContribuinte === true, 'cotação antiga vira 1 cliente com os campos de sempre');
  ok(q.clientes === undefined && !C.ehMultiCliente(q), 'e o registro continua sem `clientes`: nada é reescrito');
  const umSo = C.calcularPorCliente(Object.assign({}, q, { clientes: [c] }));
  ok(!umSo.multi && perto(umSo.total.preco, R.preco, 0), 'cotação com a lista de 1 cliente também usa o cálculo de sempre');
  ['backups/antes-hub-2.0-2026-10-26-18-27.json', '.diag/db.json'].forEach(b => {
    const p = path.join(__dirname, '..', b); if (!fs.existsSync(p)) return;
    const qs = Object.entries(JSON.parse(fs.readFileSync(p, 'utf8')).quotes || {}).filter(([, x]) => x && x.fields);
    const dif = qs.filter(([id, x]) => { const y = Object.assign({ id }, x); return JSON.stringify(C.calcularPorCliente(y).clientes[0].R) !== JSON.stringify(C.calcular(y)); });
    ok(qs.length > 0 && !dif.length, `${qs.length} cotações reais de ${path.basename(b)}: idênticas`);
  });
}

console.log('\nRegra de rateio só muda quem paga:');
{
  const q = cotacao({ regraRateio: { frete: 'cbm' } }), r = C.calcularPorCliente(q), fob = C.calcularPorCliente(cotacao()), inteira = C.calcular(semClientes(q));
  const frete = 6000 * 5.6426, cbmTotal = 5 * 15 + 2 * 4 + 2 * 0.2 + 2 * 4;
  ok(perto(r.clientes[1].R.custoPor.frete, frete * (8 / cbmTotal)), 'frete por CBM: Cliente B paga 8 m³ do total');
  ok(perto(r.total.custo, inteira.custoReal), 'soma dos custos continua igual à da cotação inteira');
  ['__ii', '__ipi', '__pis', '__cof', '__icms'].forEach(k => ok(perto(r.clientes[1].R[k], fob.clientes[1].R[k], 1e-6), `${k.replace(/_/g, '').toUpperCase()} do cliente não muda com o CBM`));
  ok(r.clientes[1].custo < fob.clientes[1].custo && r.clientes[0].custo > fob.clientes[0].custo, 'o custo muda: B ocupa pouco espaço e paga menos, A paga mais');
  ok(perto(r.clientes[1].R.preco, r.clientes[1].custo + r.clientes[1].R.st + r.clientes[1].custo * 0.25), 'preço = custo dele + DIFAL + margem sobre o custo dele');
  const manual = C.calcularPorCliente(cotacao({ regraRateio: { frete: 'manual', percentuais: { A: 60, B: 40 } } }));
  ok(perto(manual.clientes[1].R.custoPor.frete, frete * 0.4) && !manual.travas.length, 'percentual manual: 40% do frete para o Cliente B');
  const errado = C.calcularPorCliente(cotacao({ regraRateio: { frete: 'manual', percentuais: { A: 60, B: 30 } } }));
  ok(errado.erros.some(e => /somam 90/.test(e)) && !errado.clientes.length, 'percentual manual que não soma 100% impede o cálculo');
  const igual = C.calcularPorCliente(cotacao({ regraRateio: { honorarios: 'igual' } }));
  ok(perto(igual.clientes[0].R.custoPor.honorarios, 815), 'igual por cliente: metade dos honorários para cada um');
}

console.log('\nCBM ou peso sem preencher:');
{
  const semCbm = cotacao({ regraRateio: { frete: 'cbm' } }); semCbm.items[1].cbm = 0;
  let r = C.calcularPorCliente(semCbm);
  ok(C.regraEfetiva(semCbm, 'frete').regra === 'peso' && r.avisos.some(a => /Frete internacional: CBM.*peso/.test(a)), 'um item sem CBM: frete cai para peso, com alerta');
  const semNada = cotacao({ regraRateio: { frete: 'cbm' } }); semNada.items.forEach(i => { i.cbm = 0; i.p = 0; });
  r = C.calcularPorCliente(semNada);
  ok(C.regraEfetiva(semNada, 'frete').regra === 'fob' && r.avisos.some(a => /CBM e peso.*FOB/.test(a)) && !r.travas.length, 'sem CBM e sem peso: cai para FOB, com alerta, e a soma continua fechando');
  const semPeso = cotacao({ regraRateio: { seguro: 'peso' } }); semPeso.items[0].p = 0;
  r = C.calcularPorCliente(semPeso);
  ok(C.regraEfetiva(semPeso, 'seguro').regra === 'fob' && r.avisos.some(a => /Seguro: peso.*FOB/.test(a)), 'regra por peso com item zerado: cai para FOB, com alerta');
  ok(!C.calcularPorCliente(cotacao({ regraRateio: { frete: 'cbm' } })).avisos.length, 'tudo preenchido: nenhum alerta');
}

console.log('\nConferências:');
{
  const semDono = cotacao(); delete semDono.items[0].clienteId;
  ok(C.conferirClientes(semDono).erros.some(e => /sem cliente/.test(e)) && !C.calcularPorCliente(semDono).clientes.length, 'item sem cliente impede o cálculo');
  const vazio = cotacao(); vazio.items = vazio.items.filter(i => i.clienteId === 'A');
  ok(C.conferirClientes(vazio).erros.some(e => /Cliente B está sem itens/.test(e)), 'cliente sem itens impede o cálculo');
  const repetido = cotacao({ clientes: [cliente('A', 'Márcio', 'RN'), cliente('A', 'Outro', 'CE')] });
  ok(C.conferirClientes(repetido).erros.some(e => /mesmo código/.test(e)), 'código de cliente repetido é recusado');
}

console.log('\nTriangular, sem mark-up fixo (NF de saída = NF de entrada ÷ 0,96):');
{
  const q = cotacao({ clientes: [cliente('A', 'Márcio', 'CE', { tipoOperacao: 'triangular', clienteContribuinte: false }), cliente('B', 'Cliente B', 'CE', { tipoOperacao: 'triangular', clienteContribuinte: false })], regraRateio: { frete: 'cbm' } });
  q.fields.mkSF = '2000'; q.fields.mkJT = '1000';
  const r = C.calcularPorCliente(q), [a, b] = r.clientes;
  ok(a.R.tri && b.R.tri && !r.travas.length, 'os dois clientes triangulares calculam sem trava');
  ok(perto(a.R.tri.nfSF, a.R.tri.nfEntrada / 0.96, 1e-6) && perto(b.R.tri.nfSF, b.R.tri.nfEntrada / 0.96, 1e-6), 'NF de saída = NF de entrada ÷ 0,96, mesmo com R$ 2.000 no campo antigo');
  ok(perto(a.R.tri.nfJT, a.R.tri.nfSF, 1e-6), 'a nota da JeT ao cliente não ganha o mark-up de R$ 1.000');
  const inteira = C.calcular(Object.assign({}, semClientes(q), { fields: Object.assign({}, q.fields, { tipoOp: 'triangular', ufDestino: 'CE', mkSF: '0', mkJT: '0' }) }));
  /* O IPI de saída é NF × média do IPI dos itens: cada nota usa a média dos itens DELA, então a soma
     difere da nota única quando os clientes têm IPI diferente. Fora ele, todas as linhas do custo batem. */
  const ap = c => c.R.tri.apuracao, intA = inteira.tri.apuracao;
  const difIPI = ap(a).bloco4.IPIsai + ap(b).bloco4.IPIsai - intA.bloco4.IPIsai;
  ok(perto(a.custo + b.custo - inteira.tri.custoGrupo, difIPI), `soma dos custos = triangular inteira sem mark-up, mais a diferença do IPI de saída por nota (R$ ${reais(difIPI)})`);
  intA.bloco6.parcelas.forEach(([nome, v], i) => { if (/Resultante/.test(nome)) return; ok(perto(ap(a).bloco6.parcelas[i][1] + ap(b).bloco6.parcelas[i][1], v), `${nome}: bate com a cotação inteira`); });
  const semIpi = cotacao({ clientes: q.clientes, regraRateio: { frete: 'cbm' } }); semIpi.items.forEach(i => { i.ipi = 0; });
  const rs = C.calcularPorCliente(semIpi), ints = C.calcular(Object.assign({}, semClientes(semIpi), { fields: Object.assign({}, semIpi.fields, { tipoOp: 'triangular', ufDestino: 'CE', mkSF: '0', mkJT: '0' }) }));
  ok(perto(rs.total.custo, ints.tri.custoGrupo), 'sem IPI nos itens, a soma é igual à da triangular inteira');
  ok(perto(b.R.preco, b.custo * 1.25), 'preço da triangular = custo dele + margem');
  const qs = C.desemOuts(b.q, b.R);
  ok(perto(qs.base, b.custo), 'o desembolso da triangular usa o custo já com o rateio');
}

console.log('\nCliente direto e triangular no mesmo contêiner:');
{
  const q = cotacao({ clientes: [cliente('A', 'Márcio', 'RN'), cliente('B', 'Cliente B', 'CE', { tipoOperacao: 'triangular', clienteContribuinte: false, margemPct: '30' })], regraRateio: { frete: 'cbm' } });
  const r = C.calcularPorCliente(q), [a, b] = r.clientes, puro = C.calcularPorCliente(cotacao({ regraRateio: { frete: 'cbm' } }));
  ok(!r.travas.length && !a.R.tri && b.R.tri, 'cada cliente segue o tipo dele, sem trava');
  ok(perto(a.custo, puro.clientes[0].custo), 'o tipo do Cliente B não muda o custo do Márcio');
  ok(perto(b.R.margem, b.custo * 0.3), 'cada um tem a sua margem');
  const brl = C.calcularPorCliente(cotacao({ clientes: [cliente('A', 'Márcio', 'RN', { margemModo: 'brl', margemRS: '20000' }), cliente('B', 'Cliente B', 'CE')] }));
  ok(perto(brl.clientes[0].R.margem, 20000) && perto(brl.clientes[0].R.preco, brl.clientes[0].custo + brl.clientes[0].R.st + 20000), 'margem em reais também por cliente');
  ok(perto(r.total.preco, a.R.preco + b.R.preco), 'total da cotação = soma dos preços');
}

console.log('\nPropriedade: em cotações geradas, a soma sempre fecha:');
{
  let semente = 20261105; const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
  const entre = (a, b) => +(a + rnd() * (b - a)).toFixed(2), regras = ['fob', 'peso', 'cbm', 'igual'];
  let erros = 0, n = 0;
  for (let i = 0; i < 200; i++) {
    const nc = 2 + Math.floor(rnd() * 3), ids = Array.from({ length: nc }, (_, k) => 'c' + k);
    const its = ids.concat(ids.filter(() => rnd() < 0.5)).map(id => item('x', 1 + Math.floor(rnd() * 9), entre(50, 5000), rnd() < 0.15 ? 0 : entre(5, 900), rnd() < 0.15 ? 0 : entre(0.1, 20), entre(0, 20), entre(0, 8), id));
    const r0 = {}; C.GRUPOS_RATEIO.forEach(([g]) => { r0[g] = regras[Math.floor(rnd() * regras.length)]; });
    const q = cotacao({ items: its, clientes: ids.map(id => cliente(id, 'Cliente ' + id, 'RN')), regraRateio: r0, exps: [{ l: 'a', v: entre(0, 3000) }] });
    q.fields.freteUSD = String(entre(0, 9000)); q.fields.afrmm = String(entre(0, 2000)); q.fields.margemPct = String(entre(5, 40));
    const r = C.calcularPorCliente(q), R = C.calcular(semClientes(q)); n++;
    if (r.travas.length || r.erros.length || !perto(r.total.custo, R.custoReal)) erros++;
  }
  ok(!erros, `${n} cotações de 2 a 4 clientes, com regras variadas: custo fechou em todas` + (erros ? ` (falhou em ${erros})` : ''));
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
