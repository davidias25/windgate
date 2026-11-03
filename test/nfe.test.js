/**
 * Emissão de NF-e (Focus NFe): montagem de cada cenário (A a G) com números
 * conferidos à mão, pendências que bloqueiam, idempotência da transmissão,
 * webhook, cancelamento, carta de correção, conferência cruzada e permissões
 * no servidor. A Focus é SIMULADA em todos os testes — nenhum chama a API real.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const TMP = path.join(os.tmpdir(), `windgate-nfe-${process.pid}.json`);
process.env.NODE_ENV = 'test';
process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = TMP;
process.env.WINDGATE_DB_SECRET = 'segredo-nfe-' + process.pid;
process.env.FOCUS_NFE_TOKEN_SF = 'tk-sf-secreto';
process.env.FOCUS_NFE_TOKEN_JET = 'tk-jet-secreto';
process.env.FOCUS_NFE_AMBIENTE = 'homologacao';
process.env.FOCUS_WEBHOOK_TOKEN = 'wh-123';

const W = require('../public/hub/js/nfe-regras.js');
const R = Object.assign({}, require('../public/hub/js/regras.js'), W);
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const igual = (a, b) => Math.abs(a - b) < 0.005;
const clone = x => JSON.parse(JSON.stringify(x));

function banco() {
  const end = (cidade, uf, cod, cep) => ({ logradouro: 'Rua das Indústrias', numero: '100', bairro: 'Centro', cidade, uf, codigoMunicipio: cod, cep });
  return {
    users: { samir: { nome: 'Samir', pin: '1' }, davi: { nome: 'Davi', pin: '2' }, matheus: { nome: 'Matheus', pin: '3' }, ivina: { nome: 'Ívina', pin: '4' }, pedro: { nome: 'Pedro', pin: '5' }, oneide: { nome: 'Oneide', pin: '6' } },
    hubPainel: { _fiscal: { cnpjs: { WindGate: '58.762.606/0001-44', JeT: '11.222.333/0001-81' } },
      _nfeConfig: { urfs: { '0317900': { nome: 'Pecém', uf: 'CE' } }, empresas: { JeT: { nome: 'JeT Import', razaoSocial: 'JET IMPORT LTDA', cnpj: '11222333000181', ie: '082123456', logradouro: 'Av. Jerônimo Monteiro', numero: '100', bairro: 'Centro', municipio: 'Vitória', codigo_municipio: '3205309', uf: 'ES', cep: '29010000' } } } },
    crm: [
      { _id: 'c1', empresa: 'Custódio Máquinas', cnpj: '11.444.777/0001-61', contribuinte: false, email: 'compras@custodio.com.br', end: end('Fortaleza', 'CE', '2304400', '60000-000') },
      { _id: 'c2', empresa: 'Construtora Beta', cnpj: '45.997.418/0001-53', contribuinte: true, ie: '061234567', end: end('Fortaleza', 'CE', '2304400', '60100000') },
      { _id: 'c3', empresa: 'Encomendante AL', cnpj: '33.000.167/0001-01', contribuinte: true, ie: '240000000', end: end('Maceió', 'AL', '2704302', '57000000') }
    ],
    ops: [
      { _id: 'o20', id: 'OP20', cliente: 'Custódio Máquinas', modalidade: 'conta e ordem', empresa: 'WindGate', status: 'chegada', duimp: '26BR0000012345-6', destinoPorto: 'Pecém', fornecedor: 'Shandong Machinery Co',
        duimpDados: retrato(), portalEventos: [{ id: 'e1', de: 'despachante', acao: 'desembaracado', data: '2026-10-22', texto: '', em: '2026-10-22T15:00:00Z' }] },
      { _id: 'o30', id: 'OP30', cliente: 'Encomendante AL', modalidade: 'encomenda', empresa: 'WindGate', status: 'chegada' },
      { _id: 'o40', id: 'OP40', cliente: 'Construtora Beta', modalidade: 'propria', empresa: 'WindGate', status: 'logistica' }
    ],
    quotes: {
      q20: { fields: { opNum: 'OP20', txDesp: '5', txFrete: '5', pctInv: '100', icmsEnt: '1.6', freteUSD: '0', seguro: '0', capatazia: '0', siscomex: '154.23', afrmm: '250' }, items: [{ d: 'Betoneira 400L', ncm: '8474.31.00', q: 2, u: 1000, p: 100, ii: 20, ipi: 0, pis: 2.1, cofins: 9.65 }], preco: 30000 },
      q30: { fields: { opNum: 'OP30', txDesp: '5' }, items: [{ d: 'Escora metálica', ncm: '73089090', q: 100, u: 20, ii: 10.8, ipi: 5, pis: 2.1, cofins: 9.65 }], preco: 20000 },
      q40: { fields: { opNum: 'OP40', txDesp: '5' }, items: [{ d: 'Rolo compactador', ncm: '84294000', q: 1, u: 2000, ii: 12.6, ipi: 0, mono: true }, { d: 'Bateria de lítio', ncm: '85076000', q: 10, u: 100, ii: 14, ipi: 3.25 }], preco: 50000 }
    },
    ncmlib: { '84743100': { ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, c5291: true, mono: false } },
    fin: [{ _id: 'f1', op: 'OP20', tipo: 'Receita', valor: 1000, status: 'Previsto' }],
    docs: [], hubNotas: [], hubExtratos: [], hubNFe: [], _removidos: {}
  };
}
/* Retrato da DUIMP (formato normalizado do Portal Único), com os números conferidos à mão. */
const NUM20 = '26BR00000123456', REF_A = 'wg-sf-duimp-26br00000123456-a-1';
const r2 = v => Math.round(v * 100 + 1e-7) / 100;
function itemDuimp(n, va, sisc, afrmm, o) {
  o = o || {};
  return Object.assign({ numero: n, ncm: '84743100', produtoCodigo: '1001', descricao: 'Betoneira 400L', quantidade: 2, unidadeComercial: 'UN', valorAduaneiroBRL: va, valorMercadoriaBRL: r2(va - (o.frete || 0) - (o.seguro || 0)), freteBRL: o.frete || 0, seguroBRL: o.seguro || 0, taxaSiscomex: sisc, afrmm,
    intermedio: { modalidade: o.modalidade || 'conta e ordem', cnpj: o.cnpj == null ? '11444777000161' : o.cnpj },
    exportador: { codigo: 'EXP1', nome: 'Shandong Machinery Co', pais: 'CN', logradouro: 'No. 8 Industrial Rd', cidade: 'Jinan', noCatalogo: true }, fabricante: { codigo: 'FAB1', noCatalogo: true },
    tributos: { ii: { base: va, aliquota: 20, devido: r2(va * 0.2) }, ipi: { base: r2(va * 1.2), aliquota: 0, devido: 0 }, pis: { base: va, aliquota: 2.1, devido: r2(va * 0.021) }, cofins: { base: va, aliquota: 9.65, devido: r2(va * 0.0965) } }, op: null }, o.item);
}
function retrato(o) {
  o = o || {};
  const itens = o.itens || [itemDuimp(1, 10000, 154.23, 250, Object.assign({ frete: 480, seguro: 20 }, o))];
  const soma = k => r2(itens.reduce((s, i) => s + ((i.tributos[k] || {}).devido || 0), 0));
  return { versao: '1', consultadoEm: '2026-10-28T10:00:00Z', geral: { numero: o.numero || NUM20, versao: '1', dataRegistro: '2026-10-20T10:00:00-0300', unidadeDespacho: '0317900', tipoIdentificacaoCarga: 'CE', viaTransporte: 1,
    importador: { cnpj: '58762606000144' }, taxaCambio: 5, valorAduaneiroBRL: r2(itens.reduce((s, i) => s + i.valorAduaneiroBRL, 0)), totais: { ii: { devido: soma('ii') }, ipi: { devido: 0 }, pis: { devido: soma('pis') }, cofins: { devido: soma('cofins') } } }, itens };
}
const montar = (db, cen, op, extra) => { const e = R.sugerirEntrada(db, { cenario: cen, opId: op }); return R.montarNFe(db, Object.assign({}, e, { ambiente: 'homologacao', dataEmissao: '2026-10-29' }, extra && extra(e))); };
/* Nota autorizada no sistema, para os cenários que dependem dela (B, D, G). */
const autorizada = (db, cen, op, m, chave) => ({ _id: 'n-' + cen + op, ref: 'wg-' + cen + op, op, cenario: cen, empresa: m.empresa, status: 'autorizada', chave, numero: '1', serie: '1', payload: m.payload, totais: m.totais, entrada: m.entrada || {}, criadaEm: '2026-10-29T10:00:00Z' });

(async () => {
  /* ======================= Montagem por cenário ======================= */
  console.log('\nA · entrada de importação (SF, conta e ordem) — nasce da DUIMP:');
  const db = banco();
  const sA = R.sugerirEntrada(db, { cenario: 'A', opId: 'OP20' });
  ok(sA.duimpNumero === NUM20 && sA.itens.length === 0, 'a entrada aponta a DUIMP da operação; os itens não vêm da cotação');
  const mA = montar(db, 'A', 'OP20');
  const iA = mA.payload.items[0], diA = iA.documentos_importacao[0];
  ok(mA.pendencias.length === 0, 'sem pendências com a DUIMP importada' + (mA.pendencias.length ? ': ' + mA.pendencias.map(p => p.msg).join(' | ') : ''));
  ok(iA.cfop === '3102' && mA.payload.tipo_documento === 0 && mA.payload.local_destino === 3 && mA.payload.indicador_inscricao_estadual_destinatario === 9, 'CFOP 3102, entrada, destino exterior, IE indicador 9');
  // Padrão do Maino (NF 88): produto = mercadoria 9.500 · frete 480 e seguro 20 no item (VA 10.000) · II 2.000 · PIS 210 · COFINS 965 — da DUIMP
  ok(iA.valor_bruto === 9500 && iA.valor_frete === 480 && iA.valor_seguro === 20 && iA.ii_base_calculo === 10000 && iA.ii_valor === 2000 && iA.ii_despesas_aduaneiras === 404.23 && iA.pis_valor === 210 && iA.cofins_valor === 965, 'produto = mercadoria 9.500, frete 480 e seguro 20 no item; II 2.000, PIS 210 e COFINS 965 como na DUIMP; despesas aduaneiras 404,23');
  ok(iA.codigo_produto === '1' && iA.descricao === 'ITEM 1 - Betoneira 400L', 'código = nº do item da DUIMP; descrição "ITEM 1 - …", como no Maino');
  ok(iA.icms_situacao_tributaria === '51' && iA.icms_base_calculo === 0 && iA.icms_valor === 0 && mA.totais.icms === 0, 'ICMS CST 51 zerado (benefício de AL fica fora da nota)');
  // IBS/CBS: base = VA 10.000 + II 2.000 + Siscomex 154,23 + AFRMM 250 = 12.404,23 · CBS 0,9% = 111,64 · IBS 0,1% = 12,40
  ok(iA.ibs_cbs_situacao_tributaria === '000' && iA.ibs_cbs_classificacao_tributaria === '000001' && iA.ibs_cbs_base_calculo === 12404.23 && iA.cbs_valor === 111.64 && iA.ibs_uf_valor === 12.4, 'IBS/CBS CST 000 / 000001 sobre 12.404,23: CBS 111,64 e IBS 12,40');
  // Total = 9.500 + 480 + 20 + 2.000 + 154,23 = 12.154,23
  ok(iA.valor_outras_despesas === 154.23 && mA.totais.total === 12154.23 && mA.totais.somaItens === mA.totais.total, 'outras despesas = Siscomex 154,23; total 12.154,23 = soma dos itens');
  ok(diA.numero === NUM20 && diA.valor_afrmm === 250 && diA.via_transporte === 1 && diA.uf_desembaraco_aduaneiro === 'CE' && diA.data_desembaraco_aduaneiro === '2026-10-22' && diA.adicoes[0].numero === 1 && diA.adicoes[0].codigo_fabricante_estrangeiro === 'FAB1', 'DUIMP no item: número (15 posições), AFRMM, via marítima, desembaraço do aviso do despachante e adição = item da DUIMP');
  ok(diA.forma_intermedio === 2 && diA.cnpj === '11444777000161' && diA.uf_terceiro === 'CE', 'conta e ordem pela DUIMP: forma de intermediação 2 com CNPJ do adquirente e UF do CRM');
  ok(mA.payload.nome_destinatario === W.HOMOLOGACAO_NOME && /DUIMP 26BR00000123456/.test(mA.payload.informacoes_adicionais_contribuinte), 'homologação: destinatário com o texto exigido pela SEFAZ; DUIMP nas informações complementares');
  ok(mA.avisos.some(a => /a validar/.test(a)), 'cenário ainda não conferido aparece como "a validar"');

  const db30 = banco(); Object.assign(db30.ops[1], { duimp: '26BR00000222222', duimpDados: retrato({ numero: '26BR00000222222', modalidade: 'encomenda', cnpj: '33000167000101' }) });
  const di30 = R.montarNFe(db30, { cenario: 'A', opId: 'OP30', dataEmissao: '2026-10-29' }).payload.items[0].documentos_importacao[0];
  ok(di30.forma_intermedio === 3 && di30.cnpj === '33000167000101' && di30.uf_terceiro === 'AL', 'encomenda: forma de intermediação 3 com CNPJ do encomendante e UF do CRM');
  const db40 = banco(); Object.assign(db40.ops[2], { duimp: '26BR00000333333', duimpDados: retrato({ numero: '26BR00000333333', modalidade: 'propria', cnpj: '' }) });
  const di40 = R.montarNFe(db40, { cenario: 'A', opId: 'OP40', dataEmissao: '2026-10-29' }).payload.items[0].documentos_importacao[0];
  ok(di40.forma_intermedio === 1 && !di40.cnpj, 'importação própria: forma de intermediação 1, sem terceiro');

  // AFRMM informado pelo despachante (não veio na DUIMP): rateado pelo valor, o último item fecha a conta.
  const dbR2 = banco(); dbR2.ops[0].duimpDados = retrato({ itens: [itemDuimp(1, 3333.33, 0, 0), itemDuimp(2, 6666.67, 0, 0)] });
  const mA2 = R.montarNFe(dbR2, { cenario: 'A', opId: 'OP20', dataEmissao: '2026-10-29', extras: { duimp: { afrmm: 100.02 } } });
  ok(mA2.payload.items[0].ii_despesas_aduaneiras === 33.34 && mA2.payload.items[1].ii_despesas_aduaneiras === 66.68, 'AFRMM do despachante rateado: 33,34 + 66,68 = 100,02, sem centavo perdido');
  ok(igual(mA2.totais.total, mA2.totais.somaItens) && igual(mA2.payload.items.reduce((s, x) => s + x.valor_bruto + (x.valor_frete || 0) + (x.valor_seguro || 0) + x.ii_valor + x.ipi_valor + x.valor_outras_despesas, 0), mA2.totais.total), 'total da nota = soma dos itens arredondados a 2 casas');

  console.log('\nPendências que bloqueiam:');
  const pA = mexe => { const d = banco(); mexe(d.ops[0].duimpDados, d); return R.montarNFe(d, { cenario: 'A', opId: 'OP20', dataEmissao: '2026-10-29' }).pendencias.map(p => p.campo); };
  ok(pA(r => { r.itens[0].ncm = ''; }).includes('items[1].codigo_ncm'), 'item da DUIMP sem NCM: pendência');
  ok(pA((r, d) => { delete d.ops[0].duimpDados; }).includes('duimp'), 'sem DUIMP importada: pendência');
  ok(pA(r => { r.itens[0].afrmm = 0; }).includes('documentos_importacao.valor_afrmm'), 'marítimo sem AFRMM: pendência');
  ok(pA(r => { r.itens[0].fabricante = null; }).some(c => /adicoes/.test(c)), 'item sem fabricante: pendência');
  const prodNC = R.montarNFe(db, { cenario: 'A', opId: 'OP20', ambiente: 'producao', dataEmissao: '2026-10-29' });
  ok(prodNC.pendencias.some(p => p.campo === 'cenario'), 'em produção, cenário não conferido pelo contador é pendência');

  console.log('\nB · saída na conta e ordem:');
  const dbB = banco(); dbB.hubNFe.push(autorizada(dbB, 'A', 'OP20', mA, '2'.repeat(44)));
  const mB0 = montar(dbB, 'B', 'OP20');
  ok(mB0.pendencias.some(p => p.campo === 'cfop') && mB0.pendencias.some(p => p.campo === 'pis_situacao_tributaria'), 'CFOP e CST de PIS/COFINS "conforme o contador": pendentes até ele definir');
  dbB.hubPainel._nfeCenarios = { B: { campos: { cfop_interna: '5949', cfop_interestadual: '6949', pis_cst: '49', cofins_cst: '49' } } };
  const mB = montar(dbB, 'B', 'OP20');
  const iB = mB.payload.items[0];
  ok(mB.pendencias.length === 0 && iB.cfop === '6949' && mB.payload.notas_referenciadas[0].chave_nfe === '2'.repeat(44), 'com o cenário definido: CFOP 6949 (SF/AL → adquirente/CE) e referência à NF de entrada');
  // Custo repassado = total da NF de entrada 12.154,23 (frete e seguro inclusos); ICMS 4% = 486,17
  ok(iB.valor_bruto === 12154.23 && iB.icms_valor === 486.17 && iB.icms_aliquota === 4 && mB.totais.total === 12154.23, 'preço = custo de importação repassado (12.154,23); ICMS interestadual 4% = 486,17');
  const dbBsem = banco(); dbBsem.hubPainel._nfeCenarios = dbB.hubPainel._nfeCenarios;
  ok(montar(dbBsem, 'B', 'OP20').pendencias.some(p => p.campo === 'notas_referenciadas'), 'sem NF de entrada autorizada, a saída na conta e ordem não sai');

  console.log('\nC · saída na encomenda (interna em AL):');
  const mC = montar(db, 'C', 'OP30'), iC = mC.payload.items[0];
  // 100 × 200 = 20.000 · IPI 5% = 1.000 (por fora) · ICMS 19% s/ 20.000 = 3.800 · PIS/COFINS s/ (20.000 − 3.800) = 16.200: PIS 267,30 · COFINS 7,6% 1.231,20
  ok(mC.pendencias.length === 0 && iC.cfop === '5102' && mC.payload.local_destino === 1, 'SF (AL) → encomendante (AL): CFOP 5102, operação interna');
  ok(iC.valor_bruto === 20000 && iC.ipi_valor === 1000 && iC.icms_base_calculo === 20000 && iC.icms_valor === 3800 && iC.pis_base_calculo === 16200 && iC.pis_valor === 267.3 && iC.cofins_aliquota_porcentual === 7.6 && iC.cofins_valor === 1231.2, 'IPI 1.000; ICMS 19% = 3.800 sem IPI na base (contribuinte); PIS/COFINS sem o ICMS na base (NF 96): PIS 267,30; COFINS 7,6% 1.231,20');
  ok(mC.totais.total === 21000 && mC.totais.total === mC.totais.somaItens, 'total 21.000 = produtos + IPI');

  console.log('\nD · triangular SF → JeT:');
  const dbD = banco(); dbD.hubNFe.push(autorizada(dbD, 'A', 'OP20', mA, '2'.repeat(44)));
  const mD = montar(dbD, 'D', 'OP20'), iD = mD.payload.items[0];
  // Piso = 12.154,23 ÷ (1 − 4%) = 12.660,66 · ICMS 4% = 506,43 · base PIS/COFINS 12.154,23 · PIS 1,65% = 200,54 · COFINS 7,6% = 923,72
  ok(mD.pendencias.length === 0 && iD.cfop === '6102' && iD.icms_origem === '1' && mD.payload.cnpj_destinatario === '11222333000181' && mD.payload.inscricao_estadual_destinatario === '082123456', 'CFOP 6102, origem 1, destinatária JeT com CNPJ e IE da configuração');
  ok(iD.valor_bruto === 12660.66 && iD.icms_valor === 506.43 && iD.pis_base_calculo === 12154.23 && iD.pis_valor === 200.54 && iD.cofins_valor === 923.72, 'preço no piso 12.660,66; ICMS 4% = 506,43; PIS 200,54; COFINS 923,72');
  const mDbaixo = R.montarNFe(dbD, Object.assign(R.sugerirEntrada(dbD, { cenario: 'D', opId: 'OP20' }), { ambiente: 'homologacao', dataEmissao: '2026-10-29' }, { itens: [Object.assign(R.sugerirEntrada(dbD, { cenario: 'D', opId: 'OP20' }).itens[0], { valorUnitario: 6000 })] }));
  ok(mDbaixo.pendencias.some(p => p.campo === 'piso'), 'abaixo do piso (12.000 < 12.660,66): pendência, não transmite');

  console.log('\nE · JeT → cliente contribuinte:');
  const mE = montar(db, 'E', 'OP40'), [e1, e2] = mE.payload.items;
  // Preço 50.000 rateado pelo FOB (2/3 e 1/3): 33.333,33 + 16.666,67
  ok(mE.pendencias.length === 0 && e1.cfop === '6102' && e1.icms_origem === '2' && mE.payload.indicador_inscricao_estadual_destinatario === 1 && mE.payload.inscricao_estadual_destinatario === '061234567', 'JeT (ES) → contribuinte (CE): CFOP 6102, origem 2, IE do cliente');
  ok(e1.valor_bruto === 33333.33 && e2.valor_bruto === 16666.67 && e1.icms_valor === 1333.33 && e2.icms_valor === 666.67, 'preço rateado 33.333,33 + 16.666,67; ICMS 4% = 1.333,33 + 666,67');
  ok(e1.pis_situacao_tributaria === '04' && e1.pis_valor === undefined && e1.cofins_situacao_tributaria === '04' && e2.pis_situacao_tributaria === '01' && e2.pis_valor === 264 && e2.cofins_valor === 1216, 'item monofásico com CST 04 e sem valor; o outro com PIS 264,00 e COFINS 1.216,00 (base 16.666,67 − 666,67)');
  ok(mE.totais.total === 50000 && mE.totais.total === mE.totais.somaItens && !e1.icms_valor_uf_destino, 'total 50.000 = soma dos itens; sem DIFAL para contribuinte');
  const dbE2 = banco(); dbE2.crm[1].contribuinte = false;
  ok(montar(dbE2, 'E', 'OP40').pendencias.some(p => /cenário F/.test(p.msg)), 'cliente não contribuinte no cenário E: pendência mandando usar o F');

  console.log('\nF · JeT → consumidor final não contribuinte (DIFAL):');
  const mF = montar(db, 'F', 'OP20'), iF = mF.payload.items[0];
  ok(mF.pendencias.length === 0 && iF.cfop === '6108' && mF.payload.consumidor_final === 1 && mF.payload.indicador_inscricao_estadual_destinatario === 9 && !mF.payload.inscricao_estadual_destinatario, 'CFOP 6108, consumidor final 1, IE indicador 9');
  // 30.000 · ICMS 4% = 1.200 · 52/91: base destino = 30.000 × 8,8 ÷ 20 = 13.200 · DIFAL = 13.200 × 20% − 1.200 = 1.440 (= 4,8% do valor)
  ok(iF.icms_valor === 1200 && iF.icms_base_calculo_uf_destino === 13200 && iF.icms_aliquota_interna_uf_destino === 20 && iF.icms_aliquota_interestadual === 4 && iF.icms_percentual_partilha === 100 && iF.icms_valor_uf_destino === 1440, 'Convênio 52/91: base do destino reduzida a 13.200 e DIFAL 1.440 (carga 8,8% − 4%)');
  ok(/Convênio ICMS 52\/91/.test(mF.payload.informacoes_adicionais_contribuinte) && mF.totais.difal === 1440 && mF.totais.total === 30000, 'redução do 52/91 citada nas informações complementares; DIFAL fora do total da nota');
  const mF2 = montar(db, 'F', 'OP20', e => ({ itens: [Object.assign(e.itens[0], { c5291: false, mono: true })] })), iF2 = mF2.payload.items[0];
  ok(iF2.icms_base_calculo_uf_destino === 30000 && iF2.icms_valor_uf_destino === 4800 && iF2.pis_situacao_tributaria === '04' && iF2.pis_valor === undefined, 'sem 52/91: base cheia e DIFAL 4.800 (20% − 4%); item monofásico com CST 04');
  const dbF3 = banco(); dbF3.crm[0].end.uf = 'PI'; dbF3.crm[0].end.codigoMunicipio = '2211001';
  ok(montar(dbF3, 'F', 'OP20').pendencias.some(p => p.campo === 'icms_aliquota_interna_uf_destino'), 'UF sem alíquota interna cadastrada: pendência, nunca um valor padrão');
  const dbF4 = banco(); dbF4.crm[0].contribuinte = true;
  ok(montar(dbF4, 'F', 'OP20').pendencias.some(p => /cenário E/.test(p.msg)), 'cliente contribuinte no cenário F: pendência mandando usar o E');

  console.log('\nG · complementar com referência:');
  const dbG = banco(); dbG.hubNFe.push(autorizada(dbG, 'D', 'OP20', Object.assign({}, mD, { entrada: R.sugerirEntrada(dbD, { cenario: 'D', opId: 'OP20' }) }), '3'.repeat(44)));
  const mG = R.montarNFe(dbG, { cenario: 'G', ambiente: 'homologacao', dataEmissao: '2026-10-29', extras: { referencia: 'n-DOP20', finalidade: 2, cfop: '6102' }, itens: [{ ncm: '84743100', descricao: 'Complemento de preço', quantidade: 1, valorUnitario: 100 }] });
  ok(mG.pendencias.length === 0 && mG.payload.finalidade_emissao === 2 && mG.payload.notas_referenciadas[0].chave_nfe === '3'.repeat(44) && mG.empresa === 'WindGate', 'finalidade 2 com a chave da nota original, emitida pela mesma empresa');
  ok(mG.payload.items[0].icms_valor === 4 && mG.payload.items[0].pis_valor === 1.58 && mG.payload.items[0].cofins_valor === 7.3 && mG.payload.cnpj_destinatario === '11222333000181', 'segue a tributação da original (4%, PIS e COFINS) e o mesmo destinatário');
  ok(R.montarNFe(dbG, { cenario: 'G', ambiente: 'homologacao', extras: { finalidade: 2, cfop: '6102' }, itens: [{ ncm: '84743100', descricao: 'x', quantidade: 1, valorUnitario: 1 }] }).pendencias.some(p => p.campo === 'notas_referenciadas'), 'sem a nota original: pendência (notas_referenciadas é obrigatório)');

  console.log('\nTributos por data:');
  const m27 = R.montarNFe(db, Object.assign(R.sugerirEntrada(db, { cenario: 'C', opId: 'OP30' }), { ambiente: 'homologacao', dataEmissao: '2027-03-01' }));
  ok(m27.payload.items[0].pis_situacao_tributaria === '08' && m27.payload.items[0].pis_valor === undefined && m27.payload.items[0].ipi_valor === 0 && m27.pendencias.some(p => p.campo === 'ibs_cbs'), '2027: PIS/COFINS extintos (CST 08), IPI zerado e IBS/CBS obrigatório até o contador definir');
  const db26 = banco(); db26.hubPainel._nfeCenarios = { C: { campos: { ibs_cbs_cst: '000', ibs_cbs_classificacao: '000001' } } };
  const i26 = R.montarNFe(db26, Object.assign(R.sugerirEntrada(db26, { cenario: 'C', opId: 'OP30' }), { ambiente: 'homologacao', dataEmissao: '2026-10-29' })).payload.items[0];
  ok(i26.ibs_cbs_base_calculo === 14701.5 && i26.cbs_aliquota === 0.9 && i26.cbs_valor === 132.31 && i26.ibs_uf_aliquota === 0.1 && i26.ibs_uf_valor === 14.7, '2026 com o grupo definido: base = 20.000 − ICMS − PIS − COFINS = 14.701,50; CBS 0,9% = 132,31 e IBS 0,1% = 14,70 (informativos)');

  console.log('\nReferência e permissões (regras puras):');
  const dbR = banco(); dbR.hubNFe = [{ ref: 'wg-sf-op20-a-1' }, { ref: 'wg-sf-op20-a-2', refsAnteriores: ['wg-sf-op20-a-3'] }];
  ok(R.proximaRef(dbR, 'WindGate', 'OP20', 'A') === 'wg-sf-op20-a-4' && R.proximaRef(dbR, 'JeT', 'OP20', 'F') === 'wg-jet-op20-f-1', 'referência única por empresa/operação/cenário, sem reaproveitar uma já usada');
  const nt = { status: 'conferida', montadoPor: 'davi', pendencias: [], ambiente: 'producao' };
  ok(!R.podeAcao(dbR, 'davi', nt, 'transmitir', 'producao').ok && R.podeAcao(dbR, 'pedro', nt, 'transmitir', 'producao').ok, 'produção com conferência cruzada: quem montou não transmite; o outro emissor transmite');
  ok(R.podeAcao(dbR, 'davi', Object.assign({}, nt, { ambiente: 'homologacao' }), 'transmitir', 'homologacao').ok, 'homologação: um só basta');
  dbR.hubPainel._nfeConfig = { conferenciaCruzada: false };
  ok(R.podeAcao(dbR, 'davi', nt, 'transmitir', 'producao').ok, 'conferência cruzada desligada pelo Davi: ele mesmo transmite');
  ok(['samir', 'matheus', 'ivina', 'oneide'].every(k => R.podeAcao(dbR, k, null, 'montar', 'homologacao').codigo === 403) && R.pode(dbR, 'samir', 'nfe.ver') && !R.pode(dbR, 'samir', 'nfe.emitir'), 'Samir vê e não emite; Matheus, Ívina e Oneide não emitem');

  /* ======================= Servidor ======================= */
  console.log('\nServidor (Focus simulada):');
  fs.writeFileSync(TMP, JSON.stringify(banco()));
  const app = require('../src/server');
  const focus = require('../src/services/nfe.service');
  const auth = require('../src/services/auth.service');
  const srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const F = { notas: {}, posts: 0, chamadas: [] };
  const resp = (status, corpo, tipo) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => tipo || 'application/json' }, text: async () => typeof corpo === 'string' ? corpo : JSON.stringify(corpo), arrayBuffer: async () => Buffer.from(typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) });
  focus._usarFetch(async (url, o) => {
    F.chamadas.push({ url, metodo: o.method, auth: o.headers.Authorization });
    const u = new URL(url), m = u.pathname.match(/^\/v2\/nfe\/([^/]+)(\/\w+)?$/);
    if (!url.startsWith('https://homologacao.focusnfe.com.br') && !url.startsWith('https://api.focusnfe.com.br')) return resp(599, 'fora da Focus');
    if (u.pathname.startsWith('/arquivos/')) return resp(200, 'conteudo de ' + u.pathname, 'application/octet-stream');
    if (u.pathname === '/v2/nfe/danfe') return resp(200, '%PDF-1.4 previa', 'application/pdf');
    if (u.pathname === '/v2/nfe' && o.method === 'POST') { F.posts++; const ref = u.searchParams.get('ref'); F.notas[ref] = F.reprovar === ref ? { status: 'erro_autorizacao', status_sefaz: '539', mensagem_sefaz: 'Rejeição: Duplicidade de NF-e com diferença na chave' } : { status: 'processando_autorizacao', ref }; F.ultimoCorpo = JSON.parse(o.body); return resp(202, F.notas[ref]); }
    if (m && o.method === 'GET') return F.notas[decodeURIComponent(m[1])] ? resp(200, F.notas[decodeURIComponent(m[1])]) : resp(404, { codigo: 'nao_encontrado', mensagem: 'Nota fiscal não encontrada.' });
    if (m && o.method === 'DELETE') { F.notas[decodeURIComponent(m[1])] = Object.assign({}, F.notas[decodeURIComponent(m[1])], { status: 'cancelado' }); return resp(200, { status: 'cancelado', status_sefaz: '135', mensagem_sefaz: 'Evento registrado e vinculado a NF-e', caminho_xml_cancelamento: '/arquivos/canc.xml' }); }
    if (m && m[2] === '/carta_correcao') return resp(200, { status: 'autorizado', status_sefaz: '135', mensagem_sefaz: 'Evento registrado', numero_carta_correcao: 1, caminho_xml_carta_correcao: '/arquivos/cce.xml', caminho_pdf_carta_correcao: '/arquivos/cce.pdf' });
    if (m && m[2] === '/email') return resp(200, { mensagem: 'agendado' });
    return resp(400, { codigo: 'requisicao_invalida' });
  });
  focus._usarArmazenamento(async nome => 'https://storage.teste/' + nome);
  const autorizar = (ref, chave, numero) => { F.notas[ref] = { status: 'autorizado', ref, status_sefaz: '100', mensagem_sefaz: 'Autorizado o uso da NF-e', chave_nfe: 'NFe' + chave, numero, serie: '1', protocolo: '1352600000' + numero, caminho_xml_nota_fiscal: `/arquivos/${ref}.xml`, caminho_danfe: `/arquivos/${ref}.pdf` }; };
  const tk = {}; ['samir', 'davi', 'matheus', 'ivina', 'pedro', 'oneide'].forEach(k => { tk[k] = auth.emitirToken(k); });
  const chamar = async (quem, metodo, caminho, corpo) => { const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk[quem] }, body: corpo ? JSON.stringify(corpo) : undefined }); const tipo = r.headers.get('content-type') || ''; return { status: r.status, tipo, j: /json/.test(tipo) ? await r.json() : null, texto: /json/.test(tipo) ? '' : await r.text() }; };
  const lerDB = async quem => (await chamar(quem, 'GET', '/api/db')).j.db;
  const respostas = [];

  const corpoA = { cenario: 'A', opId: 'OP20' };
  require('../src/services/portal-unico.service')._usarRequisicao(async url => /autenticar$/.test(new URL(url).pathname)
    ? { status: 200, headers: { 'set-token': 'Bearer sim', 'x-csrf-token': 'c' }, corpo: '' } : { status: 200, headers: {}, corpo: JSON.stringify({ numero: NUM20, versao: '1' }) });
  for (const k of ['samir', 'matheus', 'ivina', 'oneide']) { const r = await chamar(k, 'POST', '/api/nfe/montar', corpoA); ok(r.status === 403, `${k} não monta NF-e (403)`); }
  let r = await chamar('davi', 'POST', '/api/nfe/montar', corpoA); respostas.push(r);
  const nA = r.j.nota;
  ok(r.status === 200 && nA.pendencias.length === 0 && nA.status === 'rascunho' && nA.ref === REF_A && nA.ambiente === 'homologacao' && nA.montadoPor === 'davi', 'Davi monta a entrada no servidor: rascunho, referência estável, homologação, sem pendências');
  ok(nA.totais.total === 12154.23, 'o servidor chega ao mesmo total conferido à mão (12.154,23)');
  r = await chamar('pedro', 'POST', '/api/nfe/montar', { cenario: 'B', opId: 'OP20' }); respostas.push(r);
  const nP = r.j.nota;
  ok(r.status === 200 && nP.pendencias.some(p => p.campo === 'cfop') && nP.ref === 'wg-sf-op20-b-1' && nP.montadoPor === 'pedro', 'o contador monta pelo servidor (sem ler operações nem cotações) e recebe as pendências');
  r = await chamar('davi', 'POST', `/api/nfe/${nP._id}/conferir`);
  ok(r.status === 409, 'nota com pendência não é conferida (409)');
  r = await chamar('davi', 'POST', `/api/nfe/${nP._id}/transmitir`);
  ok(r.status === 409 && F.posts === 0, 'nota com pendência não é transmitida e nada vai à Focus');

  r = await chamar('davi', 'POST', `/api/nfe/${nA._id}/previa`);
  ok(r.status === 200 && /pdf/.test(r.tipo) && /%PDF/.test(r.texto), 'prévia do DANFE volta como PDF, sem transmitir');
  r = await chamar('davi', 'POST', `/api/nfe/${nA._id}/transmitir`);
  ok(r.status === 409 && F.posts === 0, 'rascunho não transmite: precisa conferir antes');
  r = await chamar('davi', 'POST', `/api/nfe/${nA._id}/conferir`);
  ok(r.status === 200 && r.j.nota.status === 'conferida' && r.j.nota.conferidoPor === 'davi', 'homologação: quem montou também confere');
  r = await chamar('davi', 'POST', `/api/nfe/${nA._id}/transmitir`); respostas.push(r);
  ok(r.status === 200 && r.j.nota.status === 'enviada' && F.posts === 1 && r.j.nota.transmitidoPor === 'davi', 'transmitida: um POST na Focus, nota enviada');
  const ultimo = F.chamadas.filter(c => c.metodo === 'POST' && /\/v2\/nfe\?ref=/.test(c.url)).pop();
  ok(/ref=wg-sf-duimp-26br00000123456-a-1$/.test(ultimo.url) && ultimo.auth === 'Basic ' + Buffer.from('tk-sf-secreto:').toString('base64') && /^homologacao/.test(new URL(ultimo.url).host), 'POST com ?ref=, token da SF e servidor de homologação');
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/.test(F.ultimoCorpo.data_emissao) && F.ultimoCorpo.items[0].documentos_importacao[0].numero === '26BR00000123456', 'data de emissão do momento do envio (fuso de SP); DUIMP no item');
  r = await chamar('davi', 'POST', `/api/nfe/${nA._id}/transmitir`);
  ok(r.status === 200 && r.j.jaEnviada && F.posts === 1, 'transmitir de novo só consulta: continua 1 POST');
  const [t1, t2] = await Promise.all([chamar('davi', 'POST', `/api/nfe/${nA._id}/transmitir`), chamar('davi', 'POST', `/api/nfe/${nA._id}/transmitir`)]);
  ok(F.posts === 1 && [t1.status, t2.status].every(s => s === 200 || s === 409), 'dois cliques ao mesmo tempo: nenhum POST a mais');

  console.log('\nWebhook e autorização:');
  autorizar(REF_A, '2'.repeat(44), '101');
  r = await fetch(base + '/api/webhooks/focus/errado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: REF_A }) });
  ok(r.status === 401, 'aviso com token errado é recusado (401)');
  r = await fetch(base + '/api/webhooks/focus/wh-123', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: REF_A, status: 'cancelado' }) });
  const jw = await r.json();
  ok(r.status === 200 && jw.status === 'autorizada', 'aviso da Focus dispara a consulta: o status vem da consulta (autorizada), não do corpo do aviso');
  let dbS = await lerDB('davi'), nAut = dbS.hubNFe.find(n => n._id === nA._id);
  ok(nAut.status === 'autorizada' && nAut.chave === '2'.repeat(44) && nAut.numero === '101' && nAut.protocolo === '1352600000101', 'chave, número e protocolo gravados');
  ok(nAut.xmlLink === 'https://storage.teste/NFe_101_SF.xml' && nAut.danfeLink === 'https://storage.teste/NFe_101_SF.pdf' && nAut.arquivosSalvos, 'XML e DANFE baixados da Focus e guardados no Storage');
  const doc = dbS.docs.find(d => d.nfe === nA._id), notaF = dbS.hubNotas.find(n => n.nfe === nA._id);
  ok(doc && doc.op === 'OP20' && doc.tipo === 'nfe' && doc.link === nAut.danfeLink, 'documento criado no GED da operação');
  ok(notaF && notaF.chave === nAut.chave && notaF.tipo === 'entrada' && notaF.empresa === 'WindGate' && notaF.valor === 12154.23 && notaF.xmlLink === nAut.xmlLink, 'registrada em hubNotas como nota de entrada, para o Fiscal e o contador');
  r = await fetch(base + '/api/webhooks/focus/wh-123', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: REF_A }) });
  dbS = await lerDB('davi');
  ok(dbS.docs.filter(d => d.nfe === nA._id).length === 1 && dbS.hubNotas.filter(n => n.nfe === nA._id).length === 1, 'aviso repetido não duplica documento nem nota fiscal');

  console.log('\nReferência que já existe na Focus vira consulta:');
  r = await chamar('davi', 'POST', '/api/nfe/montar', { cenario: 'C', opId: 'OP30' });
  const nC = r.j.nota; await chamar('davi', 'POST', `/api/nfe/${nC._id}/conferir`);
  autorizar(nC.ref, '4'.repeat(44), '202');
  r = await chamar('davi', 'POST', `/api/nfe/${nC._id}/transmitir`);
  ok(r.status === 200 && r.j.jaExistia && r.j.nota.status === 'autorizada' && F.posts === 1, 'referência já registrada: consulta e autoriza, sem POST novo');

  console.log('\nRejeição:');
  r = await chamar('davi', 'POST', '/api/nfe/montar', { cenario: 'D', opId: 'OP20' });
  const nD = r.j.nota; await chamar('davi', 'POST', `/api/nfe/${nD._id}/conferir`);
  F.reprovar = nD.ref;
  r = await chamar('davi', 'POST', `/api/nfe/${nD._id}/transmitir`);
  ok(r.j.nota.status === 'rejeitada' && /Duplicidade/.test(r.j.nota.mensagemSefaz) && r.j.nota.statusSefaz === '539', 'rejeição mostra a mensagem da SEFAZ em português, com o código');
  r = await chamar('davi', 'POST', '/api/nfe/montar', { id: nD._id });
  ok(r.status === 200 && r.j.nota.status === 'rascunho' && r.j.nota.ref === nD.ref, 'rejeitada volta a rascunho com a MESMA referência');
  F.reprovar = null;

  console.log('\nCancelamento e carta de correção:');
  r = await chamar('samir', 'POST', `/api/nfe/${nA._id}/cancelar`, { justificativa: 'Erro no valor da mercadoria informado' });
  ok(r.status === 403, 'Samir não cancela (403)');
  r = await chamar('davi', 'POST', `/api/nfe/${nA._id}/cancelar`, { justificativa: 'curta' });
  ok(r.status === 400, 'justificativa com menos de 15 caracteres é recusada');
  r = await chamar('davi', 'POST', `/api/nfe/${nC._id}/carta-correcao`, { correcao: 'Corrigir o endereço de entrega para Rua B, 20' });
  ok(r.status === 200 && r.j.nota.cartas.length === 1 && r.j.nota.cartas[0].pdfLink === 'https://storage.teste/NFe_202_CCe1.pdf', 'carta de correção registrada com PDF e histórico');
  r = await chamar('pedro', 'POST', `/api/nfe/${nA._id}/cancelar`, { justificativa: 'Erro no valor da mercadoria informado' });
  ok(r.status === 200 && r.j.nota.status === 'cancelada' && r.j.nota.canceladoPor === 'pedro' && r.j.nota.xmlCancelamentoLink, 'o contador cancela dentro do prazo; XML do cancelamento guardado');
  dbS = await lerDB('davi');
  ok(dbS.hubNotas.find(n => n.nfe === nA._id).cancelada === true && /CANCELADA/.test(dbS.docs.find(d => d.nfe === nA._id).obs), 'cancelamento marcado no Fiscal e no GED (nada apagado)');
  await chamar('davi', 'POST', '/api/nfe/config', { prazoCancelamentoHoras: 0.00001 });
  await new Promise(x => setTimeout(x, 60));
  r = await chamar('davi', 'POST', `/api/nfe/${nC._id}/cancelar`, { justificativa: 'Erro no valor da mercadoria informado' });
  ok(r.status === 409 && /prazo/i.test(r.j.message) && F.chamadas.filter(c => c.metodo === 'DELETE').length === 1, 'fora do prazo de cancelamento: recusado antes de chamar a Focus');
  await chamar('davi', 'POST', '/api/nfe/config', { prazoCancelamentoHoras: 24 });

  console.log('\nProdução e conferência cruzada:');
  process.env.FOCUS_NFE_AMBIENTE = 'producao';
  r = await chamar('davi', 'POST', `/api/nfe/${nD._id}/transmitir`);
  ok(r.status === 409, 'nota montada em homologação não vai para produção (409)');
  r = await chamar('pedro', 'POST', '/api/nfe/cenarios', { k: 'C', conferir: true, obs: 'conferido com a Gil' });
  ok(r.status === 200 && r.j.cenarios.find(c => c.k === 'C').conferido.por === 'pedro', 'o contador marca o cenário C como conferido');
  r = await chamar('davi', 'POST', '/api/nfe/cenarios', { k: 'C', campos: { cfop_interna: '5101' } });
  ok(r.status === 403, 'só a diretoria edita o cenário');
  r = await chamar('davi', 'POST', '/api/nfe/montar', { cenario: 'C', opId: 'OP30' });
  const nPr = r.j.nota;
  ok(nPr.ambiente === 'producao' && nPr.pendencias.length === 0 && nPr.payload.nome_destinatario === 'Encomendante AL', 'produção: nota de cenário conferido, sem o texto de homologação');
  r = await chamar('davi', 'POST', `/api/nfe/${nPr._id}/conferir`);
  ok(r.status === 409, 'produção: quem montou não confere (409)');
  r = await chamar('pedro', 'POST', `/api/nfe/${nPr._id}/conferir`);
  ok(r.status === 200, 'o Pedro confere a nota do Davi');
  const postsAntes = F.posts;
  r = await chamar('davi', 'POST', `/api/nfe/${nPr._id}/transmitir`);
  ok(r.status === 409 && F.posts === postsAntes, 'produção: quem montou não transmite (409) e nada vai à Focus');
  r = await chamar('pedro', 'POST', `/api/nfe/${nPr._id}/transmitir`);
  const ultProd = F.chamadas.filter(c => c.metodo === 'POST' && /\/v2\/nfe\?ref=/.test(c.url)).pop();
  ok(r.status === 200 && F.posts === postsAntes + 1 && /^api\.focusnfe/.test(new URL(ultProd.url).host), 'o Pedro transmite em produção pelo servidor de produção');
  r = await chamar('pedro', 'POST', '/api/nfe/config', { conferenciaCruzada: false });
  ok(r.status === 403, 'só o Davi desliga a conferência cruzada');
  r = await chamar('davi', 'POST', '/api/nfe/config', { conferenciaCruzada: false });
  ok(r.status === 200 && r.j.config.conferenciaCruzada === false, 'o Davi desliga a conferência cruzada');
  process.env.FOCUS_NFE_AMBIENTE = 'homologacao';

  console.log('\nLeitura e gravação por perfil:');
  ok((await lerDB('samir')).hubNFe.length >= 4, 'Samir lê as NF-e');
  for (const k of ['ivina', 'oneide', 'matheus']) ok(!(await lerDB(k)).hubNFe, `${k} não lê hubNFe`);
  r = await chamar('matheus', 'GET', `/api/nfe/${nA._id}/status`);
  ok(r.status === 403, 'Matheus não consulta NF-e (403)');
  r = await chamar('samir', 'GET', `/api/nfe/${nC._id}/status`);
  ok(r.status === 200 && r.j.nota.status === 'autorizada', 'Samir acompanha a situação');
  const lp = await lerDB('pedro');
  ok(lp.hubNFe.length >= 4 && !lp.ops && !lp.fin && !lp.quotes && !lp.crm && lp.hubNotas, 'o contador lê hubNFe e notas, e continua sem operações, financeiro, cotações e CRM');
  const antesC = (await lerDB('davi')).hubNFe.find(n => n._id === nC._id);
  r = await chamar('pedro', 'POST', '/api/db', { hubNFe: [Object.assign({}, antesC, { status: 'rascunho', chave: '9'.repeat(44), obs: 'lançada no SPED' }), { _id: 'nfe-forjada', status: 'autorizada' }], ops: [{ _id: 'o20', id: 'OP20', cliente: 'HACK' }], fin: [], _removidos: { o30: Date.now(), [nA._id]: Date.now() } });
  dbS = await lerDB('davi');
  const depoisC = dbS.hubNFe.find(n => n._id === nC._id);
  ok(r.status === 200 && depoisC.obs === 'lançada no SPED' && depoisC.status === 'autorizada' && depoisC.chave === '4'.repeat(44), 'o contador grava hubNFe (a observação) e o servidor preserva status e chave');
  ok(!dbS.hubNFe.some(n => n._id === 'nfe-forjada') && dbS.hubNFe.some(n => n._id === nA._id), 'nota criada pelo /api/db é descartada; NF-e não é excluída');
  ok(dbS.ops.find(o => o.id === 'OP20').cliente === 'Custódio Máquinas' && dbS.ops.some(o => o.id === 'OP30') && dbS.fin.length === 1, 'nada além de hubNFe: operação e financeiro intactos');
  r = await chamar('davi', 'POST', '/api/db', { hubNFe: [Object.assign({}, depoisC, { status: 'cancelada' })], hubPainel: { _nfeConfig: { conferenciaCruzada: true } } });
  dbS = await lerDB('davi');
  ok(dbS.hubNFe.find(n => n._id === nC._id).status === 'autorizada' && dbS.hubPainel._nfeConfig.conferenciaCruzada === false, 'nem quem emite muda status ou configuração pelo /api/db: só pelas rotas');
  const acesso = require('../src/services/acesso.service');
  const gp = acesso.paraGravacao(dbS, { hubNFe: [Object.assign({}, depoisC, { obs: 'x' })], quotes: { q: {} }, crm: [{ _id: 'z' }] }, 'pedro');
  ok(Object.keys(gp).sort().join() === '_removidos,hubNFe' && gp.hubNFe[0].obs === 'x', 'filtro do contador: só hubNFe passa');

  console.log('\nIntegrações e segredo:');
  r = await chamar('davi', 'GET', '/api/integracoes');
  ok(r.j.integracoes.nfeEmissao.ok && /homologação/.test(r.j.integracoes.nfeEmissao.detalhe), 'Integrações mostra a emissão de NF-e ligada e o ambiente');
  r = await chamar('davi', 'GET', '/api/nfe/contexto'); respostas.push(r);
  ok(r.j.tokens.WindGate && r.j.tokens.JeT && r.j.ambiente === 'homologacao', 'contexto diz só se há token, nunca qual');
  const tudo = JSON.stringify(respostas.map(x => x.j)) + JSON.stringify(await lerDB('davi')) + JSON.stringify(await lerDB('pedro'));
  ok(!tudo.includes('tk-sf-secreto') && !tudo.includes('tk-jet-secreto') && !tudo.includes(Buffer.from('tk-sf-secreto:').toString('base64')), 'o token da Focus não aparece em nenhuma resposta nem no banco');
  ok(F.chamadas.every(c => /focusnfe\.com\.br/.test(c.url)), 'todas as chamadas à Focus passaram pelo simulador');

  srv.close(); try { fs.unlinkSync(TMP); fs.unlinkSync(TMP + '.bak'); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
