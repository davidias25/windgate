/**
 * Padrão da casa de reajuste cambial (modelo Marquise · OP228): faixa de estabilidade, só o excedente,
 * valor por unidade a cada R$ 0,10 por evento (alta e queda), PTAX do dia útil seguinte ao crédito
 * (remessas) ou do dia do registro da DI, e nada grava sem a aprovação do Samir.
 */
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/cotacao-regras.js'), require('../public/hub/js/cambio-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b) => Math.abs(a - b) < 0.005;

const REGRA_228 = { modelo: 'evento', referencia: 5.30, piso: 5.05, teto: 5.50, quantidade: 3200, eventos: [
  { k: 'rem1', rotulo: '1ª remessa à fábrica', gatilho: 'parcela', parcelaGatilho: 1, parcelaAlvo: 2, alta: 0.30, queda: 0.25 },
  { k: 'rem2', rotulo: '2ª remessa à fábrica', gatilho: 'parcela', parcelaGatilho: 2, parcelaAlvo: 3, alta: 0.70, queda: 0.60 },
  { k: 'di', rotulo: 'Registro da DI (frete e tributos)', gatilho: 'registroDI', parcelaAlvo: 4, alta: 0.95, queda: 0.85 }] };
const parc = (n, venc, extra) => Object.assign({ _id: 'p' + n, op: 'OP228', tipo: 'Receita', desc: n + 'º recebimento', valor: 107920, vencimento: venc, status: 'Previsto' }, extra || {});
function banco() {
  return { ops: [{ id: 'OP228', cliente: 'Marquise', status: 'contrato', regraCambial: JSON.parse(JSON.stringify(REGRA_228)) }],
    fin: [parc(1, '2026-11-13', { status: 'Realizado', liquidadoEm: '2026-11-13' }), parc(2, '2026-12-13'), parc(3, '2027-01-13'), parc(4, '2027-02-13')], quotes: {} };
}

console.log('\nRegra e cálculo:');
{
  ok(W.conferirRegra(REGRA_228).length === 0, 'regra da OP228 completa');
  const sem = W.conferirRegra({ modelo: 'evento' });
  ok(sem.some(e => /piso e o teto/.test(e)) && sem.some(e => /quantidade/.test(e)) && sem.some(e => /alta/.test(e)), 'regra vazia: aponta faixa, quantidade e valores por evento');
  ok(W.conferirRegra(Object.assign({}, REGRA_228, { eventos: [Object.assign({}, REGRA_228.eventos[0], { queda: 0.30 })] })).some(e => /queda tem de ser menor/.test(e)), 'queda igual à alta: recusada (a WindGate nunca perde margem)');
  const ev = REGRA_228.eventos[0];
  const a = W.calcularReajusteEvento(REGRA_228, ev, 5.6518);
  ok(a.sentido === 'alta' && perto(a.excedente, 0.1518) && perto(a.valor, 1457.28), 'Teste 1: (5,6518 − 5,50) ÷ 0,10 × 0,30 × 3.200 = R$ 1.457,28');
  ok(W.calcularReajusteEvento(REGRA_228, ev, 5.50).dentro && W.calcularReajusteEvento(REGRA_228, ev, 5.05).dentro && W.calcularReajusteEvento(REGRA_228, ev, 5.30).valor === 0, 'dentro da faixa (inclusive nas bordas): não muda');
  const q = W.calcularReajusteEvento(REGRA_228, ev, 4.95);
  ok(q.sentido === 'queda' && perto(q.valor, -800), 'queda: −(5,05 − 4,95) ÷ 0,10 × 0,25 × 3.200 = −R$ 800,00 (valor de queda, menor)');
}

console.log('\nDia útil seguinte ao crédito:');
ok(W.diaUtilSeguinte('2026-11-13') === '2026-11-16', 'crédito sexta 13/11 → segunda 16/11');
ok(W.diaUtilSeguinte('2026-11-19') === '2026-11-23', 'crédito 19/11 → 23/11 (20/11 é feriado nacional, depois fim de semana)');
ok(W.diaUtilSeguinte('2026-12-24') === '2026-12-28', 'véspera de Natal → 28/12');

console.log('\nEventos da OP228 (Teste 1):');
{
  const db = banco(), o = db.ops[0];
  let evs = W.eventosDaOp(db, o, {}, 5.40);
  ok(evs[0].status === 'aguardando-ptax' && evs[0].dataCredito === '2026-11-13' && evs[0].dataRef === '2026-11-16', 'parcela 01 recebida em 13/11: evento da 1ª remessa com PTAX de 16/11, aguardando a publicação');
  ok(evs[1].status === 'aguardando-gatilho' && /2ª parcela/.test(evs[1].motivo) && evs[1].estimativa && evs[1].estimativa.dentro, '2ª remessa espera o crédito da 2ª parcela (estimativa pela PTAX de hoje)');
  ok(evs[2].status === 'aguardando-gatilho' && /DI/.test(evs[2].motivo), 'DI espera o registro');
  const px = { '2026-11-16': 5.6518 };
  evs = W.eventosDaOp(db, o, px);
  ok(evs[0].status === 'aguardando-samir' && perto(evs[0].calculo.valor, 1457.28) && evs[0].alvo._id === 'p2' && perto(evs[0].novoValor, 109377.28), 'PTAX publicada: R$ 1.457,28 aguardando o Samir, na parcela 02 (R$ 109.377,28)');
  ok(db.fin[1].valor === 107920 && !db.fin[1].reajustes, 'antes da aprovação, nada muda na parcela');
  const r = W.aprovarReajusteEvento(db, o, 'rem1', px, 'Samir', '2026-11-16T15:00:00Z');
  const p2 = db.fin[1];
  ok(r.ok && perto(p2.valor, 109377.28) && p2.valorContrato === 107920 && p2.reajustes.length === 1 && p2.reajustes[0].obs === 'reajuste 1ª remessa à fábrica · PTAX 16/11/2026', 'aprovado: parcela 02 = R$ 107.920,00 + R$ 1.457,28 = R$ 109.377,28, com a observação');
  ok(o.reajustesEvento.rem1.status === 'aprovado' && o.reajustesEvento.rem1.por === 'Samir' && W.eventosDaOp(db, o, px)[0].status === 'aprovado', 'o evento fica aprovado (quem e quando)');
  ok(!W.aprovarReajusteEvento(db, o, 'rem1', px, 'Samir').ok && perto(db.fin[1].valor, 109377.28), 'aprovar de novo não soma duas vezes');
  const comp = W.composicaoParcela(p2);
  ok(comp.contrato === 107920 && perto(comp.total, 109377.28) && comp.reajustes[0].ptax === 5.6518, 'Desembolso: valor base + reajuste, pela PTAX oficial');
  ok(!JSON.stringify(comp).includes('porUnidade') && !JSON.stringify(comp).includes('quantidade'), 'o que o cliente vê não leva a tabela interna');
}

console.log('\nOP228 com reajuste já gravado direto (produção, PTAX 16/11 = 5,7324):');
{
  const db = banco(), o = db.ops[0], px = { '2026-11-16': 5.7324 };
  ok(perto(W.calcularReajusteEvento(REGRA_228, REGRA_228.eventos[0], 5.7324).valor, 2231.04), '(5,7324 − 5,50) ÷ 0,10 × 0,30 × 3.200 = R$ 2.231,04');
  const p2 = db.fin[1]; p2.valorContrato = 107920; p2.reajustes = [{ tipo: 'cambio', valor: 2231.04, obs: 'reajuste 1ª remessa · PTAX 16/11/2026' }]; p2.valor = 110151.04;
  const ev = W.eventosDaOp(db, o, px)[0];
  ok(ev.conflito && perto(ev.conflito.valor, 2231.04) && perto(ev.novoValorSubstituindo, 110151.04), 'o evento mostra que a parcela 02 já tem R$ 2.231,04 gravado');
  const r = W.aprovarReajusteEvento(db, o, 'rem1', px, 'Samir');
  ok(!r.ok && r.conflito && perto(p2.valor, 110151.04) && !o.reajustesEvento, 'aprovar sem decidir: recusa e não soma em dobro (não vira R$ 112.382,08)');
  const r2 = W.aprovarReajusteEvento(db, o, 'rem1', px, 'Samir', '2026-11-18T10:00:00Z', { substituir: true });
  ok(r2.ok && perto(p2.valor, 110151.04) && p2.reajustes.length === 1 && p2.reajustes[0].tipo === 'evento' && p2.alteracoes.some(a => a.reajustesAnteriores && a.reajustesAnteriores.length === 1), 'substituir: parcela 02 = R$ 110.151,04, uma vez só, e o anterior fica no histórico');
}

console.log('\nDI pela data do registro, recusa e dentro da faixa:');
{
  const db = banco(), o = db.ops[0];
  o.dataRegistroDI = '2027-01-20';
  db.fin[1].status = 'Realizado'; db.fin[1].liquidadoEm = '2026-12-14'; db.fin[2].status = 'Realizado'; db.fin[2].liquidadoEm = '2027-01-15';
  const px = { '2026-11-16': 5.40, '2026-12-15': 5.80, '2027-01-20': 4.90 };
  const evs = W.eventosDaOp(db, o, px);
  ok(evs[0].status === 'dentro-da-faixa' && evs[0].calculo.valor === 0, '1ª remessa dentro da faixa: sem reajuste e sem aprovação');
  const finAntes = JSON.stringify(db.fin);
  ok(W.registrarDentroDaFaixa(db, o, px) === 1 && o.reajustesEvento.rem1.status === 'dentro-da-faixa' && W.eventosDaOp(db, o, {})[0].status === 'dentro-da-faixa' && JSON.stringify(db.fin) === finAntes, 'dentro da faixa fica encerrado (mesmo sem a PTAX à mão) e nenhuma parcela muda');
  ok(W.registrarDentroDaFaixa(db, o, px) === 0, 'encerrar de novo não repete');
  ok(evs[2].dataRef === '2027-01-20' && evs[2].status === 'aguardando-samir' && perto(evs[2].calculo.valor, -(0.15 / 0.10) * 0.85 * 3200) && evs[2].alvo._id === 'p4', 'DI: PTAX do dia do registro (20/01), queda de R$ 4.080,00 na parcela 04');
  ok(W.recusarReajusteEvento(db, o, 'rem2', 'combinado com o cliente', 'Samir').ok && W.eventosDaOp(db, o, px)[1].status === 'recusado' && db.fin[2].valor === 107920, 'o Samir pode recusar: nada muda na parcela');
  db.fin[3].status = 'Realizado'; db.fin[3].liquidadoEm = '2027-02-13';
  ok(!W.aprovarReajusteEvento(db, o, 'di', px, 'Samir').ok, 'sem parcela em aberto: não grava');
}

console.log('\nTorre do Samir:');
{
  const db = banco(); db.users = { samir: { perfil: 'diretoria' }, matheus: { perfil: 'frete' } }; db.docs = []; db.hubCambio = [];
  const tit = k => W.excecoes(db, k, '2026-11-17').filter(x => /reajuste\(s\) cambial/.test(x.titulo));
  const t = tit('samir');
  ok(t.length === 1 && /1 reajuste/.test(t[0].titulo) && /OP228 · 1ª remessa/.test(t[0].detalhe) && t[0].ir[0] === 'contas' && t[0].ir[1] === 'receber', 'evento aconteceu: "1 reajuste cambial para conferir e aprovar", levando a Contas a receber');
  db.ops[0].reajustesEvento = { rem1: { status: 'aprovado' } };
  ok(!tit('samir').length, 'aprovado: sai da Torre');
}

console.log('\nOperações antigas e a correção cambial de antes:');
{
  const db = banco(); db.ops.push({ id: 'OP50', cliente: 'Diagonal', status: 'contrato' }); db.fin.push({ _id: 'd1', op: 'OP50', tipo: 'Receita', desc: '1º recebimento', valor: 50000, vencimento: '2026-12-01', status: 'Previsto' });
  const antes = JSON.stringify(db.fin), lista = W.opsSemRegraCambial(db);
  ok(lista.length === 1 && lista[0].o.id === 'OP50' && /não cadastrada/.test(lista[0].faltas[0]), 'Teste 4: a Diagonal (sem regra) aparece em "completar regra de câmbio"');
  ok(JSON.stringify(db.fin) === antes && W.eventosDaOp(db, db.ops[1], {}).length === 0, 'e nenhum valor dela muda');
  ok(!W.parcelasComCambio(db, '2026-11-16').some(p => p.o.id === 'OP228'), 'a OP228 sai da correção cambial antiga: nunca dois reajustes');
  const o = db.ops[1], r1 = W.salvarRegraOp(o, REGRA_228, 'Samir', '2026-11-17T10:00:00Z');
  ok(r1.mudou && o.regraCambial.hist[0].por === 'Samir' && !W.salvarRegraOp(o, REGRA_228, 'Davi').mudou, 'regra editada na operação: fica quem e quando; salvar igual não registra');
  ok(W.opsSemRegraCambial(db).length === 0, 'completa a regra: sai da lista');
  W.salvarRegraOp(o, { naoSeAplica: true }, 'Samir');
  ok(W.conferirRegra(o.regraCambial).length === 0 && W.eventosDaOp(db, o, {}).length === 0, '"não se aplica": sai da lista e não gera eventos');
}

console.log('\nPadrão da casa em Configurações (Parte 2.1):');
{
  const p0 = W.padraoDaCasa({});
  ok(!p0.cadastrado && p0.abaixo === 0.25 && p0.acima === 0.2 && p0.eventos.length === 3 && p0.eventos[1].alta === 0.7, 'sem cadastro: modelo Marquise (faixa −0,25/+0,20, 0,30/0,70/0,95 na alta)');
  const r = W.regraDoPadrao({}, 5.30, 3200);
  ok(r.piso === 5.05 && r.teto === 5.5 && W.conferirRegra(r).length === 0, 'referência 5,30 + 3.200 un. = a regra da OP228, completa');
  const db = { hubPainel: {} };
  ok(!W.salvarPadraoDaCasa(db, { abaixo: 0.2, acima: 0.2, eventos: [{ k: 'a', rotulo: 'x', alta: 0.5, queda: 0.5 }] }, 'Samir').ok, 'queda igual à alta: não salva');
  ok(W.salvarPadraoDaCasa(db, { abaixo: 0.10, acima: 0.15, eventos: p0.eventos }, 'Samir', '2026-11-19T10:00:00Z').ok && W.padraoDaCasa(db).cadastrado && W.padraoDaCasa(db).por === 'Samir', 'salvo com quem e quando');
  ok(W.regraDoPadrao(db, 5.40, 10).piso === 5.3 && W.regraDoPadrao(db, 5.40, 10).teto === 5.55, 'operação nova usa o padrão salvo');
  const nova = { id: 'OP300', cliente: 'X' }, antiga = { id: 'OP200', regraCambial: JSON.parse(JSON.stringify(REGRA_228)) };
  ok(W.aplicarPadraoNaOp(db, nova, 'Davi', '2026-11-19', { referencia: 5.40 }) && nova.regraCambial.piso === 5.3 && nova.regraCambial.hist[0].acao === 'copiada do padrão da casa', 'operação nova recebe a cópia, com registro');
  const antes = JSON.stringify(antiga);
  ok(!W.aplicarPadraoNaOp(db, antiga, 'Davi') && JSON.stringify(antiga) === antes, 'operação que já tem regra: nada muda');
  ok(!W.aplicarPadraoNaOp(db, { id: 'M1', papel: 'mae' }, 'Davi'), 'contêiner (mãe) não recebe regra');
  const semRef = { id: 'OP301', status: 'contrato' }; W.aplicarPadraoNaOp(db, semRef, 'Davi');
  const dbx = { ops: [semRef], fin: [parc(1, '2026-11-13', { op: 'OP301', status: 'Realizado', liquidadoEm: '2026-11-13' }), parc(2, '2026-12-13', { op: 'OP301' })], quotes: {} };
  ok(W.opsSemRegraCambial(dbx).some(f => f.o.id === 'OP301') && W.eventosDaOp(dbx, semRef, { '2026-11-16': 5.9 }).every(e => e.status === 'aguardando-gatilho'), 'sem referência: fica em "Completar regra" e não calcula nada (sem erro)');
  ok(/dia útil seguinte ao crédito/.test(W.textoRegra(r)) && !/remetid|contrato de câmbio|spread/i.test(W.textoRegra(r)), 'texto da regra: PTAX oficial, dia útil seguinte ao crédito; nada interno');
  const C = require('../public/hub/js/contrato-regras.js');
  const d = banco(); d.ops[0].clausulaCambial = { referencia: 5.2, faixaMin: 5.15, faixaMax: 5.25, repasseAlta: 1, repasseQueda: 0.7, remessas: [] };
  const dd = C.dadosDesembolso(d, 'OP228', '2026-11-19');
  ok(dd.clausula.faixaMin === 5.05 && dd.clausula.faixaMax === 5.5 && /dia útil seguinte/.test(dd.clausula.texto) && !/repassad/.test(dd.clausula.texto), 'desembolso da OP228: regra nova (5,05 a 5,50), não o repasse % antigo');
}

console.log('\nApuração cambial (PDF + e-mail):');
{
  const db = banco(), o = db.ops[0], px = { '2026-11-16': 5.7324 };
  const a = W.apuracaoCambial(db, o, 'rem1', px);
  const txt = a.texto + JSON.stringify(a.linhas);
  ok(a.ok && a.status === 'aguardando-samir' && perto(a.valor, 2231.04) && a.parcela === 2 && perto(a.novo, 110151.04), 'OP228: crédito 13/11, PTAX 16/11 R$ 5,7324, reajuste R$ 2.231,04 → 2ª parcela R$ 110.151,04');
  ok(/13\/11\/2026/.test(txt) && /16\/11\/2026/.test(txt) && /5,7324/.test(txt) && /0,2324/.test(txt) && /3\.200/.test(txt), 'mostra data do crédito, data de referência, PTAX oficial, excedente e cálculo');
  ok(!/remetid|contrato de câmbio|spread|custo|\bDI\b(?! \()/i.test(a.texto.replace('Registro da DI', '')), 'nunca valor remetido, contrato de câmbio, DI ou custo interno');
  W.aprovarReajusteEvento(db, o, 'rem1', px, 'Samir', '2026-11-17T10:00:00Z');
  const b = W.apuracaoCambial(db, o, 'rem1', px);
  ok(b.ok && b.status === 'aprovado' && perto(b.novo, 110151.04) && perto(b.anterior, 107920), 'depois de aprovado: mesma apuração, pela parcela gravada');
  ok(!W.apuracaoCambial(db, o, 'rem2', px).ok, 'evento que ainda não aconteceu: sem apuração');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exitCode = falhou ? 1 : 0;
