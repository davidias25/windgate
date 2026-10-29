/**
 * Gera, a partir do sistema atual (public/index.html), as duas peças da
 * proposta em PDF que o Hub 2.0 usa:
 *
 *   public/hub/vendor/jspdf.umd.min.js  — a mesma biblioteca jsPDF embutida
 *   public/hub/js/cotacao-pdf.js        — o gerador da proposta, copiado sem
 *                                          mudar uma linha, dentro de uma função
 *                                          que recebe a cotação aberta no Hub
 *
 * Copiar em vez de reescrever é o que garante que a proposta do Hub sai igual
 * à do sistema atual. test/cotacoes.test.js confere que a cópia continua
 * idêntica; se o index.html mudar a proposta, rode de novo:
 *   node scripts/gerar-cotacao-hub.js
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
// Quebra de linha normalizada: o Git do Windows pode trocar LF por CRLF no checkout.
const lf = t => t.replace(/\r\n/g, '\n');
const html = lf(fs.readFileSync(path.join(raiz, 'public/index.html'), 'utf8'));

function trechoProposta(texto) {
  texto = lf(texto);
  const ini = texto.indexOf('/* ============================================================\n   PROPOSTA EM PDF');
  const fim = texto.indexOf('/* ============================================================\n   INIT');
  if (ini < 0 || fim < 0) throw new Error('Marcadores da proposta não encontrados.');
  return texto.slice(ini, fim);
}
function bibliotecaJsPDF(texto) {
  texto = lf(texto);
  const m = /<script>(\/\* jsPDF [\d.]+ embutido \*\/[\s\S]*?)<\/script>/.exec(texto);
  if (!m) throw new Error('jsPDF embutido não encontrado.');
  return m[1];
}

function gerar() {
  const proposta = trechoProposta(html);
  const saida = `/* Hub 2.0 — proposta em PDF da cotação.
   GERADO por scripts/gerar-cotacao-hub.js a partir do sistema atual: o trecho
   entre os marcadores é cópia fiel do index.html. Não edite à mão — mude no
   index.html e gere de novo (test/cotacoes.test.js confere que são iguais).
   O Hub entrega a cotação aberta pelas mesmas funções que o código espera
   (V, N, state, R, toast…), e o PDF sai exatamente como no sistema atual. */
(function () {
  window.HUB_PROPOSTA = function (ctx) {
    const { V, N, fmt, esc, toast, cnpjFmt, crmDocAnexarProposta, carregarFotosDaProposta, desemErrors, openModal, closeModal, saveDB } = ctx;
    const $ = id => document.getElementById(id);
    const state = ctx.state, R = ctx.R, DB = ctx.DB;
/* ==== INÍCIO proposta-pdf ==== */
${proposta}/* ==== FIM proposta-pdf ==== */
    return { gerarPropostaPDF, gerarPropostaPrint, propostaBlocos, propostaBlocosPadrao, PROPOSTA_BLOCOS, PROPOSTA_CUSTOS };
  };
})();
`;
  fs.mkdirSync(path.join(raiz, 'public/hub/vendor'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'public/hub/js/cotacao-pdf.js'), saida);
  fs.writeFileSync(path.join(raiz, 'public/hub/vendor/jspdf.umd.min.js'), bibliotecaJsPDF(html));
  return { proposta: proposta.length };
}

if (require.main === module) { const r = gerar(); console.log(`Proposta copiada (${r.proposta} caracteres) e jsPDF extraído.`); }
module.exports = { trechoProposta, bibliotecaJsPDF, gerar, lf };
