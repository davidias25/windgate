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
/** Um parágrafo em pedaços: o [PENDENTE] sai em amarelo. */
function runs(texto, negrito) {
  const rpr = (amarelo) => `<w:rPr>${negrito ? '<w:b/>' : ''}${amarelo ? '<w:highlight w:val="yellow"/>' : ''}<w:sz w:val="${negrito ? 22 : 21}"/></w:rPr>`;
  return String(texto == null ? '' : texto).split(/(\[PENDENTE\])/).filter(x => x !== '').map(p => `<w:r>${rpr(p === PENDENTE)}<w:t xml:space="preserve">${xml(p)}</w:t></w:r>`).join('');
}
const par = (texto, negrito, centro) => `<w:p><w:pPr>${centro ? '<w:jc w:val="center"/>' : '<w:jc w:val="both"/>'}<w:spacing w:after="120"/></w:pPr>${runs(texto, negrito)}</w:p>`;
function tabela(b) {
  const cel = (t, neg) => `<w:tc><w:tcPr><w:tcBorders><w:bottom w:val="single" w:sz="4" w:color="BBBBBB"/></w:tcBorders></w:tcPr><w:p>${runs(t, neg)}</w:p></w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tr>${b.colunas.map(c => cel(c, true)).join('')}</w:tr>${b.linhas.map(l => `<w:tr>${l.map(c => cel(c)).join('')}</w:tr>`).join('')}</w:tbl><w:p/>`;
}
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const EMU_L = 1905000, EMU_A = 549910; // 150 × 43,3 pt
function gerarDocx(preenchido, quando) {
  const corpo = preenchido.blocos.map(b => (b.t === 'tabela' ? tabela(b) : b.t === 'titulo' ? par(b.texto, true, true) : b.t === 'clausula' ? par(b.texto, true) : par(b.texto))).join('');
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
  const linhaComPendente = (linha, x, yy) => {
    let cx = x;
    String(linha).split(/(\[PENDENTE\])/).filter(p => p !== '').forEach(p => {
      const w = doc.getTextWidth(p);
      if (p === PENDENTE) { doc.setFillColor(255, 235, 59); doc.rect(cx, yy - 9, w, 12, 'F'); doc.setTextColor(0, 0, 0); }
      doc.text(p, cx, yy); cx += w;
    });
  };
  cabecalho();
  preenchido.blocos.forEach(b => {
    if (b.t === 'tabela') {
      const n = b.colunas.length, col = largura / n;
      const linha = (l, negrito) => { doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(9); const cs = l.map(c => doc.splitTextToSize(String(c), col - 8)), h = Math.max(...cs.map(c => c.length)) * 11 + 5; quebra(h); cs.forEach((c, i) => c.forEach((t, k) => linhaComPendente(t, M + i * col, y + k * 11))); doc.setDrawColor(200); doc.line(M, y + h - 9, M + largura, y + h - 9); y += h; };
      linha(b.colunas, true); b.linhas.forEach(l => linha(l)); y += 8; return;
    }
    const forte = b.t === 'titulo' || b.t === 'clausula';
    doc.setFont('helvetica', forte ? 'bold' : 'normal'); doc.setFontSize(b.t === 'titulo' ? 12 : 10); doc.setTextColor(0, 0, 0);
    doc.splitTextToSize(String(b.texto || ''), largura).forEach(t => {
      quebra(13);
      if (b.t === 'titulo') doc.text(t, L / 2, y, { align: 'center' }); else linhaComPendente(t, M, y);
      y += 13;
    });
    y += 6;
  });
  return Buffer.from(doc.output('arraybuffer'));
}

module.exports = { modelo, modelosInstalados, gerarDocx, gerarPdf, PASTA };
