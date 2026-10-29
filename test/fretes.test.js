/**
 * Fretes & Benchmark do Hub 2.0: conversão pela PTAX com a regra do agente,
 * trava da PTAX na chegada, memória de preços por rota, leitura da proposta e
 * o formato do registro — o Hub edita o MESMO registro que o sistema atual
 * gravou sem perder campo nenhum. Números conferidos à mão.
 */
process.env.SUPABASE_DISABLED = '1';
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/fretes-regras.js'));
const { mesclarDB } = require('../src/services/db-merge.service');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b, t) => Math.abs(a - b) < (t || 0.01);
const clone = o => JSON.parse(JSON.stringify(o));

(async () => {
  console.log('\nRotas e formatos:');
  ok(W.rotaKey('Shanghai → Pecém') === 'shanghai → pecem' && W.rotaKey('shanghai para pecem') === 'shanghai → pecem' && W.rotaKey('SHANGHAI x PECÉM') === 'shanghai → pecem' && W.rotaKey('Shanghai -> Pecem') === 'shanghai → pecem', 'rota normalizada: seta, "para", "x" e acento chegam à mesma chave');
  ok(W.rotaKey('Ningbo') === 'ningbo', 'rota sem destino fica como está (normalizada)');
  ok(W.fmtUSD(1234.5) === 'USD 1.234,50' && W.fmtUSD('') === 'USD 0,00', 'dólar no formato do sistema atual: USD 1.234,50');
  ok(W.hojeBR(new Date(2026, 0, 5)) === '05/01/2026', 'data de registro em dd/mm/aaaa, como o sistema atual grava');
  ok(W.usdNum('2,500.00') === 2500 && W.usdNum('2.500,00') === 2500 && W.usdNum(1800) === 1800 && W.usdNum('') === 0, 'valor em dólar antigo gravado como texto vira número com a mesma regra da migração');

  console.log('\nConversão para reais (PTAX + regra do agente + taxas):');
  const agentes = { NSL: { tipo: 'Agente de carga', regra: 2.5, contato: '', fone: '' }, Suntrans: { tipo: 'Agente de carga', regra: 2.5, contato: '', fone: '' }, Fontime: { tipo: 'Agente de carga', regra: 2, contato: '', fone: '' }, MSC: { tipo: 'Armador direto', regra: 0, contato: '', fone: '' } };
  const fx = { rate: 5, date: '28/10/2026', source: 'PTAX · Banco Central', official: true };
  // 2.000 × 5,00 × 1,025 = 10.250 · + 1.500 de taxas = 11.750
  const c1 = W.freteBRL({ empresa: 'NSL', usd: 2000, brl: 1500 }, agentes, fx);
  ok(perto(c1.convertido, 10250) && perto(c1.extras, 1500) && perto(c1.brl, 11750) && c1.regra === 2.5 && !c1.locked, 'NSL: US$ 2.000 × 5,00 × 1,025 = R$ 10.250 + R$ 1.500 de taxas = R$ 11.750 (projeção)');
  // travada: 2.000 × 5,20 × 1,025 = 10.660
  const c2 = W.freteBRL({ empresa: 'NSL', usd: 2000, ptaxLock: { rate: 5.2, date: '20/10/2026', source: 'PTAX · Banco Central' } }, agentes, fx);
  ok(perto(c2.brl, 10660) && c2.locked && c2.fx.rate === 5.2, 'PTAX travada da chegada vence a do dia: 2.000 × 5,20 × 1,025 = R$ 10.660');
  ok(perto(W.freteBRL({ empresa: 'MSC', usd: 1000 }, agentes, fx).brl, 5000), 'armador sem acréscimo: 1.000 × 5,00 = R$ 5.000');
  ok(perto(W.freteBRL({ empresa: 'Desconhecida', usd: 1000 }, agentes, fx).brl, 5000), 'empresa fora da agenda converte sem acréscimo');
  ok(W.freteBRL({ empresa: 'NSL', usd: 2000 }, agentes, null) === null, 'dólar sem PTAX: não converte (tela pede a PTAX)');
  const c3 = W.freteBRL({ empresa: 'NSL', usd: 0, brl: 800 }, agentes, null);
  ok(c3 && c3.brl === 800 && c3.convertido === 0, 'só taxas em reais: R$ 800 mesmo sem PTAX');
  ok(W.freteBRL({ empresa: 'NSL' }, agentes, fx) === null, 'cotação sem valor nenhum: nada a mostrar');
  ok(perto(W.freteBRL({ empresa: 'Fontime', usd: '2,500.00' }, agentes, fx).brl, 12750), 'valor em texto antigo: 2.500 × 5 × 1,02 = R$ 12.750');
  const pv = W.previaFreteBRL(2000, 300, 2.5, fx);
  ok(pv && perto(pv.conv, 10250) && perto(pv.total, 10550), 'prévia do formulário: 10.250 + 300 = R$ 10.550');
  ok(W.previaFreteBRL(2000, 300, 2.5, null).semPtax && W.previaFreteBRL(0, 0, 0, fx) === null, 'prévia sem PTAX avisa; sem valores fica vazia');

  console.log('\nRegra da PTAX escrita pelo próprio banco:');
  const rg = W.regrasPtax(agentes);
  ok(rg.length === 3 && rg[0].regra === 2.5 && rg[0].nomes.join() === 'NSL,Suntrans' && rg[1].regra === 2 && rg[2].regra === 0 && rg[2].nomes.join() === 'MSC', 'agrupado por percentual, maior primeiro: 2,5% (NSL, Suntrans) · 2% (Fontime) · 0% (MSC)');
  ok(W.juntarNomes(['A', 'B', 'C']) === 'A, B e C' && W.juntarNomes(['A']) === 'A', 'nomes juntados em português');
  const gr = W.empresasFrete(agentes);
  ok(gr.agentes.length === 3 && gr.armadores.length === 1 && gr.armadores[0][0] === 'MSC', 'seletor: agentes de carga e armadores diretos separados');

  console.log('\nMemória de preços por rota (benchmark):');
  const fretes = [
    { _id: 'a', rota: 'Shanghai → Pecém', usd: 2400 },      // mais recente
    { _id: 'b', rota: 'shanghai para pecem', usd: 2100 },
    { _id: 'c', rota: 'SHANGHAI x PECÉM', usd: 2600 },
    { _id: 'd', rota: 'Ningbo → Santos', usd: 3000 },
    { _id: 'e', rota: 'Ningbo → Santos', usd: 0 },            // sem dólar: fora da memória
    { _id: 'f', rota: 'Qingdao → Suape', usd: 1000 },
    { _id: 'g', rota: 'Qingdao → Suape', usd: 1200 }
  ];
  const st = W.estatisticasRotas(fretes);
  const sp = st.find(r => r.chave === 'shanghai → pecem'), ns = st.find(r => r.chave === 'ningbo → santos'), qs = st.find(r => r.chave === 'qingdao → suape');
  ok(st.length === 3 && st[0].chave === 'shanghai → pecem', 'três rotas, na ordem em que aparecem (mais recente primeiro)');
  ok(sp.n === 3 && sp.min === 2100 && sp.mediana === 2400 && sp.ultima === 2400 && sp.delta === 300 && sp.leitura === 'brigar' && sp.rota === 'Shanghai → Pecém', 'Shanghai → Pecém: 3 cotações, menor 2.100, mediana 2.400, última 2.400 → dá para brigar 300');
  ok(ns.n === 1 && ns.leitura === 'poucas', 'rota com uma cotação só: "registre mais cotações"; a de US$ 0 não entra');
  ok(qs.mediana === 1200 && qs.ultima === 1000 && qs.leitura === 'melhor', 'quantidade par: mediana é o valor de cima (1.200), como no sistema atual; última 1.000 = no melhor preço');
  const ref = W.referenciaRota(fretes, 'Shanghai -> Pecem', 2500);
  ok(ref && ref.n === 3 && ref.min === 2100 && ref.acima === 400 && !ref.melhor, 'cotação nova de 2.500 na rota: 400 acima do menor (2.100) → há espaço para negociar');
  ok(W.referenciaRota(fretes, 'Shanghai → Pecém', 2000).melhor && W.referenciaRota(fretes, 'Xiamen → Pecém', 2000) === null && W.referenciaRota(fretes, 'Shanghai → Pecém', 0) === null, 'abaixo do menor = melhor valor; rota sem histórico ou sem valor: nada');

  console.log('\nPTAX: vigente, trava na chegada:');
  const srv = { success: true, venda: 5.4321, em: '2026-10-28 13:08:00.000', serie: [{ em: '2026-10-23', venda: 5.1 }, { em: '2026-10-26', venda: 5.2 }, { em: '2026-10-27', venda: 5.3 }, { em: '2026-10-28', venda: 5.4321 }] };
  const v1 = W.ptaxVigente(srv, { rate: 5.0, ts: 9e15 }, null);
  ok(v1.rate === 5.4321 && v1.official && v1.date === '28/10/2026', 'PTAX oficial do servidor vence a gravada: 5,4321 de 28/10/2026');
  const v2 = W.ptaxVigente(null, { rate: 5.1, ts: 100, official: true }, { rate: 5.3, ts: 200, manual: true });
  ok(v2.rate === 5.3 && v2.manual, 'sem o Banco Central: vale a mais recente entre a gravada e a manual (manual de agora)');
  ok(W.ptaxVigente(null, { rate: 5.1, ts: 300 }, { rate: 5.3, ts: 200 }).rate === 5.1 && W.ptaxVigente(null, null, null) === null, 'gravada mais nova vence a manual; nada disponível → sem PTAX');
  const pd = W.ptaxNaData(srv.serie, '2026-10-25');
  ok(pd && pd.rate === 5.1 && pd.date === '23/10/2026' && pd.source === 'PTAX · Banco Central', 'chegada num domingo (25/10): vale a PTAX da sexta 23/10 (5,10)');
  ok(W.ptaxNaData(srv.serie, '2026-10-27').rate === 5.3 && W.ptaxNaData(srv.serie, '2026-10-10') === null, 'chegada em dia útil pega a do dia; antes da série: busca no Banco Central');
  ok(W.precisaTravarPtax({ chegada: '2026-10-27' }, '2026-10-28') && W.precisaTravarPtax({ chegada: '2026-10-28' }, '2026-10-28') && !W.precisaTravarPtax({ chegada: '2026-10-29' }, '2026-10-28') && !W.precisaTravarPtax({ chegada: '2026-10-27', ptaxLock: { rate: 5 } }, '2026-10-28') && !W.precisaTravarPtax({ chegada: '' }, '2026-10-28'), 'trava quando a chegada é hoje ou passou e ainda não há trava');

  console.log('\nRegistro novo no formato do sistema atual:');
  const campos = { op: 'OP24', empresa: 'NSL', rota: 'Shanghai → Pecém', modal: 'FCL', contato: 'Ana', fone: '+55 85 9999', fabContato: 'Lily', fabEmail: 'lily@f.cn', fabWhats: '+86 1', usd: 2350, brl: 1200, chegada: '2026-12-20', validade: '15/11', status: 'Cotado', resp: 'Matheus' };
  const nf = W.novoFrete(campos, 'id-1', '29/10/2026');
  ok(nf._id === 'id-1' && nf.data === '29/10/2026' && nf.ptaxLock === null && W.FRETE_CAMPOS.every(k => nf[k] === campos[k]), 'novo: _id, data dd/mm/aaaa, os 15 campos do formulário e ptaxLock nulo');
  ok(Object.keys(nf).sort().join() === ['_id', 'data', 'ptaxLock'].concat(W.FRETE_CAMPOS).sort().join(), 'exatamente as chaves que o sistema atual grava, nenhuma a mais');
  ok(typeof W.novoFrete({}, 'x').usd === 'number' && W.novoFrete({}, 'x').rota === '', 'campo vazio: número vira 0, texto vira ""');

  console.log('\nIda e volta: o Hub edita o registro do sistema atual sem perder nada:');
  const legado = { _id: 'fr-legado', data: '01/10/2026', op: 'OP22', empresa: 'NSL', rota: 'Shanghai → Pecém', modal: 'FCL', contato: 'Ana', fone: '+55', fabContato: 'Lily', fabEmail: 'l@f.cn', fabWhats: '+86',
    usd: 2400, brl: 900, chegada: '2026-10-20', validade: '30/10', status: 'Negociando', resp: 'Matheus',
    ptaxLock: { rate: 5.21, date: '20/10/2026', source: 'PTAX · Banco Central' }, agente: 'NSL', obs: 'campo que o Hub não conhece', extra: { a: 1, b: [1, 2] } };
  const db = W.prepararBanco({ fretes: [clone(legado)], agentes: { NSL: { tipo: 'Agente de carga', regra: 2.5, contato: 'Ana', fone: '+55', email: 'ana@nsl.com', obs: 'só no antigo' }, MSC: { tipo: 'Armador direto', regra: 0, contato: '', fone: '' } } });
  const base = W.fotografarConteudo(db);
  const f = db.fretes[0];
  // O formulário do Hub manda os 15 campos; só status e usd mudaram.
  const doForm = {}; W.FRETE_CAMPOS.forEach(k => { doForm[k] = legado[k]; });
  doForm.status = 'Fechado'; doForm.usd = 2300;
  W.editarFrete(f, doForm);
  ok(f === db.fretes[0], 'edição no próprio objeto (não troca o registro)');
  ok(Object.keys(legado).every(k => k in f) && Object.keys(f).length === Object.keys(legado).length, 'todas as chaves gravadas pelo sistema atual continuam no registro, nenhuma nova');
  ok(Object.keys(legado).filter(k => !['status', 'usd'].includes(k)).every(k => JSON.stringify(f[k]) === JSON.stringify(legado[k])), 'campos não editados (data, ptaxLock, agente, obs, extra…) ficam idênticos');
  ok(f.status === 'Fechado' && f.usd === 2300, 'campos editados gravados');
  ok(f.ptaxLock && f.ptaxLock.rate === 5.21, 'chegada não mudou: PTAX travada continua');
  ok(W.guardarContatoAgente(db.agentes, 'NSL', 'Bruno', '') && db.agentes.NSL.contato === 'Bruno' && db.agentes.NSL.fone === '+55' && db.agentes.NSL.email === 'ana@nsl.com' && db.agentes.NSL.obs === 'só no antigo' && db.agentes.NSL.regra === 2.5, 'agenda: contato novo salvo, telefone vazio não apaga, campos desconhecidos do agente ficam');
  ok(!W.guardarContatoAgente(db.agentes, 'Inexistente', 'X', 'Y') && !('Inexistente' in db.agentes), 'empresa fora da agenda: não cria agente pelo contato');
  const { corpo } = W.diferencas(db, base);
  ok(corpo.fretes && corpo.fretes.length === 1 && JSON.stringify(corpo.fretes[0]) === JSON.stringify(f), 'gravação parcial sobe o registro inteiro (com os campos que o Hub não usa)');
  ok(corpo.agentes && Object.keys(corpo.agentes).join() === 'NSL' && corpo.agentes.NSL.email === 'ana@nsl.com', 'agenda: sobe só o agente alterado, inteiro');
  const servidor = { fretes: [clone(legado), { _id: 'outro', rota: 'Ningbo → Santos', usd: 3000, status: 'Cotado' }], agentes: { NSL: clone(db.agentes.NSL), MSC: { tipo: 'Armador direto', regra: 0, contato: '', fone: '' }, Fontime: { tipo: 'Agente de carga', regra: 2, contato: '', fone: '' } }, ptax: { rate: 5.0, ts: 1 }, _removidos: {} };
  servidor.agentes.NSL.contato = 'Ana';
  const mesclado = mesclarDB(servidor, JSON.parse(JSON.stringify(corpo)));
  const fm = mesclado.fretes.find(x => x._id === 'fr-legado');
  ok(fm && JSON.stringify(fm) === JSON.stringify(f) && mesclado.fretes.some(x => x._id === 'outro'), 'no servidor: a edição do Hub entra inteira e a cotação de outra pessoa fica');
  ok(mesclado.agentes.NSL.contato === 'Bruno' && mesclado.agentes.Fontime && mesclado.agentes.MSC && mesclado.ptax.rate === 5.0, 'no servidor: agente alterado, os outros agentes e a PTAX do sistema atual preservados');
  // O sistema atual lê de volta: o registro continua com o formato dele.
  ok(typeof fm.usd === 'number' && /^\d{2}\/\d{2}\/\d{4}$/.test(fm.data) && fm.ptaxLock.date === '20/10/2026', 'sistema atual lê o mesmo formato: usd número, data dd/mm/aaaa, ptaxLock {rate,date,source}');

  console.log('\nMudou a chegada, solta a trava:');
  const f2 = clone(legado);
  W.editarFrete(f2, Object.assign({}, doForm, { chegada: '2026-11-05' }));
  ok(f2.ptaxLock === null && f2.chegada === '2026-11-05' && f2.obs === legado.obs, 'chegada nova: ptaxLock nulo (busca a PTAX do novo dia), resto preservado');
  const f3 = clone(legado);
  W.editarFrete(f3, { status: 'Expirado' });
  ok(f3.status === 'Expirado' && f3.usd === 2400 && f3.ptaxLock.rate === 5.21, 'edição parcial só mexe no que veio');
  const ags = { NSL: { tipo: 'Agente de carga', regra: 2.5, contato: 'Ana', fone: '1' } };
  W.garantirAgente(ags, 'Nova Log'); W.garantirAgente(ags, 'NSL');
  ok(JSON.stringify(ags['Nova Log']) === JSON.stringify({ tipo: 'Agente de carga', regra: 0, contato: '', fone: '' }) && ags.NSL.regra === 2.5 && ags.NSL.contato === 'Ana', '"Outra…" cria o agente no formato do sistema atual e não sobrescreve um que já existe');

  console.log('\nLeitura automática da proposta:');
  const p1 = W.lerPropostaFrete("Proposta NSL Logistics\nOcean freight Shanghai to Pecem 1x40'HQ\nUSD 2,350.00 + BAF USD 150\nValidity: 15/11/2026\nETA: 20/12", 2026);
  ok(p1.empresa === 'NSL' && p1.usd === 2350 && p1.rota === 'Shanghai → Pecem' && p1.modal === 'FCL' && p1.validade === '15/11/2026' && p1.chegada === '2026-12-20', 'NSL · US$ 2.350 (maior valor) · Shanghai → Pecem · FCL · validade 15/11/2026 · chegada 2026-12-20');
  const p2 = W.lerPropostaFrete('Cotação Aliança — LCL Santos para Suape, US$ 1.250,00. Validade: 10/12', 2026);
  ok(p2.empresa === 'Aliança' && p2.usd === 1250 && p2.rota === 'Santos → Suape' && p2.modal === 'LCL' && p2.validade === '10/12' && !p2.chegada, 'Aliança (acento) · US$ 1.250,00 em formato brasileiro · LCL · validade 10/12');
  ok(Object.keys(W.lerPropostaFrete('bom dia, segue em anexo', 2026)).length === 0, 'texto sem nada reconhecível: nenhum campo');

  console.log('\nPedido de análise de mercado:');
  const pr = W.promptMercadoFrete([{ rota: 'Shanghai → Pecém', empresa: 'NSL', usd: 2400, modal: 'FCL', status: 'Cotado' }], '29/10/2026');
  ok(pr.includes('Hoje é 29/10/2026') && pr.includes('- Shanghai → Pecém · NSL · USD 2.400,00 · FCL · status Cotado'), 'pedido traz a data e as cotações no formato do sistema atual');
  ok(W.promptMercadoFrete([], '29/10/2026').includes('- (colar cotações aqui)'), 'sem cotações: espaço para colar');

  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
