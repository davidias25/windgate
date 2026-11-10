/**
 * Arquivos do contrato padrão: DOCX e PDF, a partir dos blocos já preenchidos.
 * Logo centralizada em todas as páginas e [PENDENTE] em amarelo nos dois.
 * O texto oficial fica em src/contratos/modelo-jt.json e modelo-sf.json: sem o arquivo, não há geração.
 */
const fs = require('fs');
const path = require('path');
const { criarZip } = require('./zip.service');

const PASTA = path.join(__dirname, '../contratos');
const PENDENTE = '[PENDENTE]';

function modelo(estrutura) {
  const arq = path.join(PASTA, `modelo-${estrutura}.json`);
  if (!fs.existsSync(arq)) return null;
  return JSON.parse(fs.readFileSync(arq, 'utf8'));
}
const modelosInstalados = () => ({ jt: !!modelo('jt'), sf: !!modelo('sf') });

/* Logo branca da proposta, sobre a faixa azul do cabeçalho. Está no sistema atual, sem arquivo a mais. */
let logoCache = null;
function logoPng() {
  if (logoCache) return logoCache;
  const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
  const m = /const LOGO_WHITE_SRC = "data:image\/png;base64,([^"]+)"/.exec(html);
  if (!m) throw new Error('Logo não encontrada.');
  return (logoCache = Buffer.from(m[1], 'base64'));
}

const xml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Um parágrafo em pedaços: **negrito** como no modelo, e o [PENDENTE] em amarelo. */
function runs(texto, negrito, sz) {
  const rpr = (neg, amarelo) => `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${neg ? '<w:b/>' : ''}${amarelo ? '<w:highlight w:val="yellow"/>' : ''}<w:sz w:val="${sz || 21}"/></w:rPr>`;
  return String(texto == null ? '' : texto).split('**').map((t, i) => t.split(/(\[PENDENTE\])/).filter(x => x !== '').map(p => p.split('\n').map((l, k) => `<w:r>${rpr(negrito || i % 2 === 1, p === PENDENTE)}${k ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(l)}</w:t></w:r>`).join('')).join('')).join('');
}
const par = (texto, negrito, centro, sz, antes) => `<w:p><w:pPr>${antes ? `<w:keepNext/><w:spacing w:before="${antes}" w:after="80"/>` : '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>'}${centro ? '<w:jc w:val="center"/>' : antes ? '<w:jc w:val="left"/>' : '<w:jc w:val="both"/>'}</w:pPr>${runs(texto, negrito, sz)}</w:p>`;
function tabela(b) {
  const n = (b.linhas[0] || b.colunas || []).length, larg = b.larguras || Array(n).fill(100 / n), LT = 9070;
  const cel = (t, i, neg) => `<w:tc><w:tcPr><w:tcW w:w="${Math.round(larg[i] / 100 * LT)}" w:type="dxa"/>${neg ? '<w:shd w:val="clear" w:color="auto" w:fill="E7EAF2"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${runs(t, neg, 19)}</w:p></w:tc>`;
  const borda = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('');
  const cab = b.semCabecalho || !(b.colunas || []).length ? '' : `<w:tr>${b.colunas.map((c, i) => cel(c, i, true)).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${LT}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${borda}</w:tblBorders></w:tblPr><w:tblGrid>${larg.map(l => `<w:gridCol w:w="${Math.round(l / 100 * LT)}"/>`).join('')}</w:tblGrid>${cab}${b.linhas.map(l => `<w:tr>${l.map((c, i) => cel(c, i)).join('')}</w:tr>`).join('')}</w:tbl><w:p><w:pPr><w:spacing w:after="40"/></w:pPr></w:p>`;
}
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const EMU_L = 1905000, EMU_A = 549910; // 150 × 43,3 pt
function gerarDocx(preenchido, quando) {
  const corpo = preenchido.blocos.map(b => (b.t === 'tabela' ? tabela(b) : b.t === 'quebra' ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : b.t === 'titulo' ? par(b.texto, true, true, 26) : b.t === 'centro' ? par(b.texto, false, true) : b.t === 'clausula' ? par(b.texto, true, false, 21, 200) : par(b.texto))).join('');
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}><w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="1B2A5B"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${EMU_L}" cy="${EMU_A}"/><wp:docPr id="1" name="Logo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${EMU_L}" cy="${EMU_A}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:hdr>`;
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${corpo}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1800" w:right="1200" w:bottom="1200" w:left="1200" w:header="300" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return criarZip([
    { nome: '[Content_Types].xml', dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>' },
    { nome: '_rels/.rels', dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { nome: 'word/document.xml', dados: documento },
    { nome: 'word/_rels/document.xml.rels', dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>' },
    { nome: 'word/header1.xml', dados: header },
    { nome: 'word/_rels/header1.xml.rels', dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>' },
    { nome: 'word/media/logo.png', dados: logoPng() }
  ], quando);
}

function gerarPdf(preenchido) {
  const { jsPDF } = require('../../public/hub/vendor/jspdf.umd.min.js');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }), L = 595.28, M = 50, largura = L - 2 * M, base = 'data:image/png;base64,' + logoPng().toString('base64');
  let y = 100;
  const cabecalho = () => { doc.setFillColor(27, 42, 91); doc.rect(0, 0, L, 62, 'F'); doc.addImage(base, 'PNG', (L - 150) / 2, 9, 150, 43.3); };
  const quebra = h => { if (y + h > 790) { doc.addPage(); cabecalho(); y = 90; } };
  /* A largura sem kerning é a que o jsPDF usa para desenhar: com kerning, as palavras se encostam. */
  const larguraDe = (t, tam) => doc.getStringUnitWidth(t, { kerning: {} }) * tam / doc.internal.scaleFactor;
  /* Texto corrido com **negrito** e [PENDENTE] em amarelo: palavra a palavra, porque a fonte muda no meio da linha. */
  function palavras(texto, base) {
    const out = [];
    String(texto == null ? '' : texto).split('**').forEach((t, i) => t.split(/(\s+)/).filter(x => x !== '').forEach(p => out.push({ p, b: base || i % 2 === 1 })));
    return out;
  }
  function escrever(texto, x, largura2, opts) {
    const o = opts || {}, altura = o.altura || 13, tam = o.tam || 10;
    let linha = [], w = 0, yy = o.y != null ? o.y : y, linhas = 0;
    const medir = t => { doc.setFont('helvetica', t.b ? 'bold' : 'normal'); doc.setFontSize(tam); return larguraDe(t.p, tam); };
    const desce = () => {
      while (linha.length && /^\s+$/.test(linha[linha.length - 1].p)) { w -= linha[linha.length - 1].w; linha.pop(); }
      if (o.y == null) { quebra(altura); yy = y; }
      let cx = o.centro ? x + (largura2 - w) / 2 : x;
      linha.forEach(t => {
        doc.setFont('helvetica', t.b ? 'bold' : 'normal'); doc.setFontSize(tam);
        if (t.p.includes(PENDENTE)) { doc.setFillColor(255, 235, 59); doc.rect(cx, yy - tam + 1, t.w, tam + 2, 'F'); }
        doc.setTextColor(0, 0, 0); doc.text(t.p, cx, yy); cx += t.w;
      });
      if (o.y == null) y += altura; else yy += altura;
      linha = []; w = 0; linhas++;
    };
    String(texto == null ? '' : texto).split('\n').forEach(par2 => {
      palavras(par2, o.negrito).forEach(t => {
        t.w = medir(t);
        if (w + t.w > largura2 && linha.length && !/^\s+$/.test(t.p)) desce();
        if (!linha.length && /^\s+$/.test(t.p)) return;
        linha.push(t); w += t.w;
      });
      desce();
    });
    return linhas;
  }
  const contarLinhas = (texto, largura2, tam, negrito) => {
    let n = 0;
    String(texto == null ? '' : texto).split('\n').forEach(pa => { let w = 0, l = 1; palavras(pa, negrito).forEach(t => { doc.setFont('helvetica', t.b ? 'bold' : 'normal'); doc.setFontSize(tam); const tw = larguraDe(t.p, tam); if (w + tw > largura2 && w > 0) { l++; w = 0; } w += tw; }); n += l; });
    return n;
  };
  cabecalho();
  preenchido.blocos.forEach(b => {
    if (b.t === 'tabela') {
      // As assinaturas e as testemunhas ficam na mesma página.
      if (b.semCabecalho && String(b.linhas[0][0]).startsWith('CONTRATADA')) quebra(190);
      const n = (b.linhas[0] || b.colunas).length, larg = (b.larguras || Array(n).fill(100 / n)).map(p => p / 100 * largura);
      const linha = (l, negrito) => {
        const h = Math.max(...l.map((c, i) => contarLinhas(c, larg[i] - 8, 9, negrito))) * 11 + 6;
        quebra(h);
        let x = M; const topo = y - 9;
        if (negrito) { doc.setFillColor(231, 234, 242); doc.rect(M, topo, largura, h, 'F'); }
        l.forEach((c, i) => { escrever(c, x + 4, larg[i] - 8, { y, tam: 9, altura: 11, negrito }); doc.setDrawColor(128); doc.rect(x, topo, larg[i], h); x += larg[i]; });
        y += h;
      };
      if (!b.semCabecalho && (b.colunas || []).length) linha(b.colunas, true);
      b.linhas.forEach(l => linha(l)); y += 10; return;
    }
    if (b.t === 'quebra') { doc.addPage(); cabecalho(); y = 90; return; }
    if (b.t === 'clausula') { quebra(30); y += 6; }
    const tam = b.t === 'titulo' ? 12 : 10;
    escrever(b.texto, M, largura, { tam, altura: b.t === 'titulo' ? 15 : 13, negrito: b.t === 'titulo' || b.t === 'clausula', centro: b.t === 'titulo' || b.t === 'centro' });
    y += b.t === 'clausula' ? 2 : 6;
  });
  return Buffer.from(doc.output('arraybuffer'));
}

module.exports = { modelo, modelosInstalados, gerarDocx, gerarPdf, logoPng, PASTA };
