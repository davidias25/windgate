/**
 * Cenários do caixa (números conferidos à mão) e link rastreável da proposta.
 */
const path = require('path'), fs = require('fs'), os = require('os');
process.env.NODE_ENV = 'test';
process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = path.join(os.tmpdir(), `windgate-proposta-${process.pid}.json`);
process.env.WINDGATE_DB_SECRET = '';
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/cotacao-regras.js'), require('../public/hub/js/cambio-regras.js'));
const link = require('../src/services/proposta-link.service');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

console.log('\nCenários do caixa, conferidos à mão:');
{
  /* Hoje: 09/11/2026, segunda. Caixa de partida: R$ 100.000 recebidos.
     Semana 09/11: paga fábrica 40.000. Semana 16/11: recebe 60.000 (dia 20). Semana 23/11: paga frete 130.000. Semana 30/11: recebe 50.000 (dia 03/12).
     Base:   60.000 · 120.000 · −10.000 · 40.000 → menor −10.000 em 23/11, 1 semana negativa.
     Dólar:  fábrica 44.000, frete 143.000 → 56.000 · 116.000 · −27.000 · 23.000 → menor −27.000, 1 semana.
     Atraso: 60.000 vai para 05/12 (semana 30/11) e 50.000 para 18/12 (semana 14/12)
             60.000 · 60.000 · −70.000 · −10.000 · −10.000 · 40.000 → menor −70.000, 3 semanas.
     Juntos: 56.000 · 56.000 · −87.000 · −27.000 · −27.000 · 23.000 → menor −87.000, 3 semanas. */
  const l = (id, tipo, desc, valor, venc, st) => ({ _id: id, op: 'OP1', tipo, desc, valor, vencimento: venc, status: st || 'Previsto', empresa: 'WindGate' });
  const db = { ops: [{ _id: 'o', id: 'OP1', status: 'producao' }], fin: [l('c', 'Receita', 'Sinal', 100000, '2026-10-01', 'Realizado'), l('a', 'Despesa', 'Sinal da fábrica', 40000, '2026-11-10'), l('b', 'Receita', 'Parcela', 60000, '2026-11-20'), l('d', 'Despesa', 'Frete internacional', 130000, '2026-11-25'), l('e', 'Receita', 'Parcela', 50000, '2026-12-03')] };
  db.fin[0].liquidadoEm = '2026-10-01';
  const c = Object.fromEntries(W.cenariosCaixa(db, '2026-11-09', 'todas').map(x => [x.k, x]));
  ok(c.base.menor === -10000 && c.base.semana === '2026-11-23' && c.base.semanasNegativas === 1, 'base: menor −R$ 10.000 na semana de 23/11, 1 semana negativa');
  ok(c.base.serie.slice(0, 4).map(s => s.caixa).join() === '60000,120000,-10000,40000', 'base: a série semana a semana');
  ok(c.dolar.menor === -27000 && c.dolar.semana === '2026-11-23' && c.dolar.semanasNegativas === 1, 'dólar +10%: menor −R$ 27.000, 1 semana negativa');
  ok(c.atraso.menor === -70000 && c.atraso.semana === '2026-11-23' && c.atraso.semanasNegativas === 3, 'atraso de 15 dias: menor −R$ 70.000, 3 semanas negativas');
  ok(c.ambos.menor === -87000 && c.ambos.semana === '2026-11-23' && c.ambos.semanasNegativas === 3, 'os dois juntos: menor −R$ 87.000, 3 semanas negativas');
  ok(db.fin[1].valor === 40000 && db.fin[2].vencimento === '2026-11-20', 'calcular os cenários não altera lançamento nenhum');
  // US$ 1.000 na operação, US$ 500 fechados: só metade sofre os 10%. Fábrica 40.000 → 42.000; frete 130.000 → 136.500. 58.000 · 118.000 · −18.500.
  const d2 = JSON.parse(JSON.stringify(db)); d2.ops[0].custeio = { fobUSD: 1000, freteUSD: 0 }; d2.hubCambio = [{ _id: 'x', op: 'OP1', status: 'fechado', valorME: 500, taxa: 5 }];
  const c2 = W.cenariosCaixa(d2, '2026-11-09', 'todas').find(x => x.k === 'dolar');
  ok(c2.menor === -18500, 'dólar +10% só na parte sem câmbio fechado: menor −R$ 18.500');
  const d3 = JSON.parse(JSON.stringify(db)); d3.ops[0].custeio = { fobUSD: 1000, freteUSD: 0 }; d3.hubCambio = [{ _id: 'x', op: 'OP1', status: 'fechado', valorME: 1000, taxa: 5 }];
  ok(W.cenariosCaixa(d3, '2026-11-09', 'todas').find(x => x.k === 'dolar').menor === -10000, 'câmbio todo fechado: o dólar não muda nada');
}

console.log('\nLink assinado:');
{
  const t = link.gerar('q1', '', 30, Date.parse('2026-11-06T00:00:00Z'));
  ok(link.ler(t, Date.parse('2026-11-20T00:00:00Z')).q === 'q1', 'lê o link dentro da validade');
  ok(link.ler(t, Date.parse('2026-12-10T00:00:00Z')) === null, 'recusa depois da validade');
  ok(link.ler(t.slice(0, -2) + 'xx') === null && link.ler('abc') === null && link.ler('') === null, 'recusa assinatura errada');
  const [, sig] = t.split('.'), outro = Buffer.from(JSON.stringify({ q: 'q2', c: '', exp: 4102444800 })).toString('base64url');
  ok(link.ler(outro + '.' + sig) === null, 'não dá para trocar a cotação do link');
}

console.log('\nFollow-up e texto no negócio:');
{
  const db = { crmOps: [{ _id: 'n', quoteId: 'q1', fase: 'proposta' }, { _id: 'g', quoteId: 'q2', fase: 'ganho' }], propostaLinks: [{ _id: 'l1', quoteId: 'q1', criadoEm: '2026-11-03T10:00:00Z' }, { _id: 'l2', quoteId: 'q2', criadoEm: '2026-11-01T10:00:00Z' }], propostaAberturas: [] };
  ok(W.followUpsProposta(db, '2026-11-05').length === 0, 'com 2 dias: ainda não');
  const f = W.followUpsProposta(db, '2026-11-06');
  ok(f.length === 1 && f[0].negocio._id === 'n' && f[0].dias === 3, 'sem abertura em 3 dias: follow-up sugerido; negócio ganho fica de fora');
  db.propostaAberturas.push({ _id: 'a', quoteId: 'q1', em: '2026-11-06T14:32:00' });
  ok(W.followUpsProposta(db, '2026-11-06').length === 0, 'abriu: sai do follow-up');
  db.propostaAberturas.push({ _id: 'b', quoteId: 'q1', em: '2026-11-07T09:05:00' });
  ok(W.textoAberturaProposta(W.aberturasDaProposta(db, 'q1')) === 'Proposta aberta em 07/11 09:05 (2 vezes)', 'Proposta aberta em 07/11 09:05 (2 vezes)');
  db.propostaAberturas.pop();
  ok(/\(1 vez\)$/.test(W.textoAberturaProposta(W.aberturasDaProposta(db, 'q1'))), 'uma vez, no singular');
  ok(W.textoAberturaProposta(W.aberturasDaProposta(db, 'q9')) === '', 'nunca aberta: sem texto');
}

(async () => {
  const app = require('../src/server'), srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const it = (d, q, u, pf) => Object.assign(W.ITEM_PADRAO(), { d, q, u, p: 10, ii: 14, ipi: 5, pf });
  const q = { id: 'q1', status: 'ok', criadoPor: 'davi', fields: Object.assign({}, W.PADRAO, { cliente: 'Cliente <b>Teste</b>', mercadoria: 'Escoras', tipoOp: 'triangular', txDesp: '5.3777', txFrete: '5.4888', freteUSD: '3000', margemPct: '25', opNum: 'OP9' }), items: [it('Escora', 100, 50), it('Carregador', 1, 300, 4031)], exps: [] };
  const R = W.calcular(q); Object.assign(q.fields, W.desemSugerir(q, R)); q.preco = R.preco; q.cambioProposta = W.congelarCambio(q, 5.4, '2026-11-06');
  const rasc = Object.assign({}, q, { id: 'q2', status: 'wait' });
  await post('/api/db', { quotes: { q1: q, q2: rasc }, crmOps: [{ _id: 'n', quoteId: 'q1', fase: 'proposta', resp: 'davi', clienteNome: 'Cliente Teste' }], users: { davi: { nome: 'Davi' } } });

  console.log('\nPágina da proposta:');
  ok((await post('/api/propostas/link', { quoteId: 'q2' })).status === 409, 'cotação não aprovada não gera link');
  ok((await post('/api/propostas/link', { quoteId: 'nada' })).status === 404, 'cotação inexistente não gera link');
  const r = await (await post('/api/propostas/link', { quoteId: 'q1', dias: 15 })).json();
  ok(r.success && r.caminho.startsWith('/p/proposta/') && r.dias === 15, 'gera o link, com validade');
  const pg = await fetch(base + r.caminho), html = await pg.text();
  ok(pg.status === 200 && /noindex/.test(pg.headers.get('x-robots-tag')) && pg.headers.get('cache-control') === 'no-store', 'abre sem login, fora de buscadores e de cache');
  ok(html.includes('Escora') && html.includes('Investimento total') && html.includes('5,4500') && html.includes('Parcelas'), 'mostra itens, investimento, referência do dólar e parcelas');
  ok(html.includes('R$&nbsp;4.031,00') || html.includes('R$ 4.031,00'), 'preço fixo do item mantido');
  ok(!html.includes('<b>Teste</b>') && html.includes('&lt;b&gt;Teste'), 'texto da cotação é escapado');
  const cq = W.custoCotacao(q), vazou = ['5,3777', '5.3777', '5,4888', '5.4888', 'margem', 'Margem', 'custo', 'Custo', 'FOB', 'spread', 'remessa', 'fábrica'].filter(x => html.includes(x));
  const valoresInternos = [cq.total, cq.valores.impostos, R.margem].map(v => (+v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).filter(x => html.includes(x));
  ok(vazou.filter(x => x !== 'FOB' || !html.includes('Incoterm FOB')).length === 0 && !valoresInternos.length, 'sem custo, margem, dólar de custo nem spread' + (vazou.length ? ': ' + vazou.join() : ''));

  console.log('\nAberturas:');
  const dbAgora = async () => { const j = await (await fetch(base + '/api/db')).json(); return j.db || j.data || j; };
  ok(W.aberturasDaProposta(await dbAgora(), 'q1').vezes === 0, 'só carregar a página não conta: prévia de WhatsApp e robô não rodam o script');
  ok(html.includes('/aberta'), 'quem conta é o navegador de quem abriu');
  ok((await post(r.caminho + '/aberta')).status === 200, 'registra a abertura');
  let d = await dbAgora();
  ok(W.aberturasDaProposta(d, 'q1').vezes === 1 && d.propostaAberturas[0].linkId, 'abertura guardada, com quando');
  const rec = (d.hubRecados || []).filter(x => /abriu a proposta/.test(x.texto || ''));
  ok(rec.length === 1 && rec[0].para === 'davi' && rec[0].texto.startsWith('Cliente Teste'), 'a primeira abertura gera recado para o dono do negócio');
  await post(r.caminho + '/aberta');
  d = await dbAgora();
  ok(W.aberturasDaProposta(d, 'q1').vezes === 1, 'recarregar a página no mesmo minuto não conta de novo');
  ok((await post('/p/proposta/invalido/aberta')).status === 410 && (await fetch(base + '/p/proposta/invalido')).status === 410, 'link inválido é recusado');

  srv.close(); try { fs.unlinkSync(process.env.WINDGATE_DB_FILE); fs.unlinkSync(process.env.WINDGATE_DB_FILE + '.bak'); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
