/**
 * Apuração da operação triangular — SF Trading (AL) → JeT Import (ES) → cliente.
 *
 * Imprime a tela interna do Samir/Davi: custo linha a linha, impostos por NCM
 * com a fonte de cada alíquota, NF de entrada, piso e NF de saída, DIFAL com a
 * alíquota e a UF que a originou, resultante de impostos, custo total e margem.
 *
 * Roda o MESMO motor da tela: o trecho `triangular-core` é recortado do
 * public/index.html, para que apuração, proposta e sistema não divirjam.
 *
 *   node scripts/apurar-triangular.js                      # caso Diagonal (fixture)
 *   node scripts/apurar-triangular.js operacao.json        # uma operação sua
 *   node scripts/apurar-triangular.js operacao.json --json # saída em JSON
 *
 * O arquivo de entrada é um JSON com os parâmetros do prompt (taxaUsdDespesas,
 * itens, fatorInvoice, freteIntUsd, ufDestino, clienteContribuinte etc.).
 * NÃO grava nada e NÃO toca no banco.
 */
const fs = require('fs');
const path = require('path');

/* O motor mora no index.html, junto do código que roda no navegador. Recortar
   em vez de duplicar é o que garante que a proposta impressa e a tela mostrem
   o mesmo número. */
function carregarMotor(){
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const ini = html.indexOf('/* ==== INÍCIO triangular-core');
  const fim = html.indexOf('/* ==== FIM triangular-core ==== */');
  if (ini < 0 || fim < 0) {
    throw new Error('Marcadores "triangular-core" não encontrados em public/index.html.');
  }
  // A tabela de ICMS por UF vive fora do core; vai junto para o motor não
  // precisar de default nenhum.
  const mUF = /const ICMS_INTERNO=\{[\s\S]*?\};/.exec(html);
  const nomes = ['TRI_FONTES', 'TRI_PADRAO', 'triCalcular', 'triInternaDestino', 'ICMS_INTERNO'];
  return new Function((mUF ? mUF[0] : 'const ICMS_INTERNO={};') + '\n'
    + html.slice(ini, fim) + '\nreturn {' + nomes.join(',') + '};')();
}

const f = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
const padL = (s, n) => String(s == null ? '' : s).padStart(n);
const regra = n => '─'.repeat(n);

const motor = carregarMotor();

/* Caso Diagonal do prompt, usado quando nenhum arquivo é informado. */
const DIAGONAL = {
  _nome: 'Operação Diagonal (containers) — fixture do prompt',
  taxaUsdDespesas: 5.15,
  itens: [{ descricao: 'Containers', ncm: '9406.90.0090', qtd: 1, valorUnitarioUsd: 32214,
            ii: 20, ipi: 0, pisImp: 2.1, cofinsImp: 9.65 }],
  fatorInvoice: 50,
  freteIntUsd: 16000,
  seguroBrl: 1500, capataziaBrl: 1240,
  siscomex: 154.23, afrmm: 1024.00, honorarios: 1620.00,
  icmsEntradaEfetivo: 1.2,
  despesasNacionalizacao: 13933.00,
  markupComercialBrl: 2000.00,
  ufDestino: 'CE', clienteContribuinte: false, conv5291: false,
  freteTerrestreBrl: 6000.00,
  servicoWindgateBrl: 60000.00
};

const args = process.argv.slice(2);
const arquivo = args.find(a => !a.startsWith('--'));
const entrada = arquivo ? JSON.parse(fs.readFileSync(arquivo, 'utf8')) : DIAGONAL;
entrada.tabelaIcmsInterno = entrada.tabelaIcmsInterno || motor.ICMS_INTERNO;
entrada.usuario = entrada.usuario || process.env.USERNAME || process.env.USER || '(cli)';

const r = motor.triCalcular(entrada);

if (args.includes('--json')) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.travas.length ? 1 : 0);
}

console.log(`\n${regra(78)}`);
console.log(`  APURAÇÃO TRIANGULAR — ${entrada._nome || arquivo || 'operação'}`);
console.log(`  SF Trading (AL) → JeT Import (ES) → cliente ${entrada.ufDestino}`
  + ` · ${entrada.clienteContribuinte ? 'CONTRIBUINTE' : 'não contribuinte'}`);
console.log(regra(78));

/* Travas primeiro: se alguma bloqueia, o resto é só contexto. */
if (r.travas.length) {
  console.log('\n  ⛔ TRAVAS — a proposta não pode ser emitida assim:');
  r.travas.forEach(t => console.log(`     · [${t.codigo}] ${t.msg}`));
}
if (r.alertas.length) {
  console.log('\n  ⚠️  ALERTAS:');
  r.alertas.forEach(a => {
    console.log(`     · [${a.gravidade.toUpperCase()}] ${a.msg}`);
    if (a.log) console.log(`       log: ${JSON.stringify(a.log)}`);
  });
}

/* Memória de cálculo, bloco a bloco, com a fonte de cada alíquota. */
let blocoAtual = '';
console.log('');
r.memoria.forEach(m => {
  if (m.bloco !== blocoAtual) {
    blocoAtual = m.bloco;
    console.log(`\n  ${blocoAtual.toUpperCase()}`);
    console.log(`  ${regra(76)}`);
  }
  const val = (m.valor === null) ? '—' : f(m.valor);
  console.log(`  ${pad(m.rotulo, 40)} ${padL(val, 16)}`);
  if (m.formula) console.log(`  ${' '.repeat(2)}${pad('↳ ' + m.formula, 74)}`);
  if (m.fonte)   console.log(`  ${' '.repeat(2)}${pad('   fonte: ' + m.fonte, 74)}`);
});

/* Impostos por NCM — a conferência contra o Simulador Siscomex. */
console.log(`\n  IMPOSTOS POR NCM`);
console.log(`  ${regra(76)}`);
console.log(`  ${pad('produto', 26)} ${pad('NCM', 16)} ${padL('base', 14)} ${padL('II', 12)} ${padL('PIS+COFINS', 14)}`);
r.entrada.itens.forEach(it => {
  const i = it.impostos || {};
  console.log(`  ${pad(it.descricao, 26)} ${pad(it.ncm, 16)} ${padL(f(i.base), 14)} ${padL(f(i.ii), 12)} ${padL(f((i.pis || 0) + (i.cofins || 0)), 14)}`);
  console.log(`  ${' '.repeat(2)}↳ II ${it.ii}% · IPI ${it.ipi}% · PIS ${it.pisImp}% · COFINS ${it.cofinsImp}%  (${motor.TRI_FONTES.ii})`);
});

/* Rateio por produto — e a conferência cruzada da TRAVA 6. */
if (r.bloco7.porProduto.length > 1) {
  console.log(`\n  PREÇO POR PRODUTO`);
  console.log(`  ${regra(76)}`);
  r.bloco7.porProduto.forEach(p =>
    console.log(`  ${pad(p.descricao, 34)} qtd ${padL(p.qtd, 5)} ${padL(f(p.preco), 18)}`));
  const soma = r.bloco7.porProduto.reduce((a, p) => a + p.preco, 0);
  console.log(`  ${pad('soma do rateio', 34)} ${' '.repeat(9)} ${padL(f(soma), 18)}`
    + `  ${Math.abs(soma - r.bloco7.preco) <= 0.01 ? '✅ bate com o preço final' : '❌ NÃO bate'}`);
}

console.log(`\n  ${regra(76)}`);
console.log(`  ${pad('CUSTO WINDGATE', 40)} ${padL('R$ ' + f(r.bloco6.custo), 16)}`);
console.log(`  ${pad('Serviço WindGate', 40)} ${padL('R$ ' + f(r.bloco7.servico), 16)}`);
console.log(`  ${pad('PREÇO FINAL AO CLIENTE', 40)} ${padL('R$ ' + f(r.bloco7.preco), 16)}`);
console.log(`  ${pad('Margem', 40)} ${padL(r.bloco7.margemSobreCusto.toFixed(2) + '% s/custo', 16)}`
  + `   ${r.bloco7.margemSobrePreco.toFixed(2)}% s/preço`);
console.log(`  ${regra(76)}`);

/* Decisões em aberto que mudam o número, ditas em voz alta. */
console.log(`\n  PARÂMETROS QUE MUDAM O RESULTADO (pendências em aberto)`);
console.log(`  ${regra(76)}`);
console.log(`  · ICMS de entrada AL ....... ${entrada.icmsEntradaEfetivo != null ? entrada.icmsEntradaEfetivo : motor.TRI_PADRAO.icmsEntradaEfetivo}%`
  + `   (a operação recolhe 1,6%; o fixture do prompt usa 1,2%)`);
console.log(`  · Despesas na NF de entrada . ${r.opcoes.despesasNaNfEntrada ? 'DENTRO' : 'FORA'}   (pendência 2 — Pedro/Wellington)`);
console.log(`  · Base do DIFAL ............ ${r.opcoes.difalBaseDupla ? 'DUPLA (Conv. 236/2021)' : 'SIMPLES'}   (pendência 3)`);
console.log(`  · Invoice declarada ........ ${(r.entrada.fatorInvoice * 100).toFixed(0)}% do FOB   (pendência 4 — default deve ser 100%)`);

if (!r.opcoes.difalBaseDupla && r.bloco5.internaDestino !== null && !entrada.clienteContribuinte) {
  const dupla = motor.triCalcular(Object.assign({}, entrada, {
    opcoes: Object.assign({}, entrada.opcoes, { difalBaseDupla: true })
  }));
  console.log(`\n  Se a pendência 3 fechar em BASE DUPLA, o preço vai de R$ ${f(r.bloco7.preco)}`
    + ` para R$ ${f(dupla.bloco7.preco)}  (Δ R$ ${f(dupla.bloco7.preco - r.bloco7.preco)}).`);
}

console.log('');
process.exit(r.travas.length ? 1 : 0);
