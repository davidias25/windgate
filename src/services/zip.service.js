/**
 * ZIP mínimo (sem compressão, método "store"), sem dependência nova.
 * Usado no pacote trimestral do contador: planilha, XMLs/PDFs das notas,
 * extratos e comprovantes, em pastas por mês e conta. XML e PDF já vêm
 * comprimidos ou são pequenos; o ganho de comprimir não paga a dependência.
 */
const zlib = require('zlib');

const TAB = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = TAB[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const dosData = d => { const x = d || new Date(); return { hora: (x.getHours() << 11) | (x.getMinutes() << 5) | (x.getSeconds() >> 1), dia: ((x.getFullYear() - 1980) << 9) | ((x.getMonth() + 1) << 5) | x.getDate() }; };

/** arquivos: [{ nome: 'pasta/arquivo.ext', dados: Buffer|string }] → Buffer do .zip */
function criarZip(arquivos, quando) {
  const locais = [], centrais = []; let pos = 0;
  const { hora, dia } = dosData(quando);
  const usados = new Set();
  (arquivos || []).forEach(a => {
    let nome = String(a.nome || 'arquivo').replace(/\\/g, '/').replace(/^\/+/, '');
    for (let i = 2; usados.has(nome); i++) nome = String(a.nome).replace(/(\.[^./]+)?$/, m => `-${i}${m || ''}`);
    usados.add(nome);
    const dados = Buffer.isBuffer(a.dados) ? a.dados : Buffer.from(String(a.dados == null ? '' : a.dados), 'utf8');
    const n = Buffer.from(nome, 'utf8'), crc = crc32(dados);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(hora, 10); lh.writeUInt16LE(dia, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(dados.length, 18); lh.writeUInt32LE(dados.length, 22);
    lh.writeUInt16LE(n.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(hora, 12); ch.writeUInt16LE(dia, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(dados.length, 20); ch.writeUInt32LE(dados.length, 24);
    ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(pos, 42);
    locais.push(lh, n, dados); centrais.push(ch, n);
    pos += lh.length + n.length + dados.length;
  });
  const central = Buffer.concat(centrais), fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(usados.size, 8); fim.writeUInt16LE(usados.size, 10);
  fim.writeUInt32LE(central.length, 12); fim.writeUInt32LE(pos, 16);
  return Buffer.concat(locais.concat([central, fim]));
}

/** Leitura (para conferir o pacote nos testes): { nome: Buffer } */
function lerZip(buf) {
  const out = {}; let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const metodo = buf.readUInt16LE(i + 8), tam = buf.readUInt32LE(i + 18), ln = buf.readUInt16LE(i + 26), le = buf.readUInt16LE(i + 28);
    const nome = buf.slice(i + 30, i + 30 + ln).toString('utf8'), ini = i + 30 + ln + le, dados = buf.slice(ini, ini + tam);
    out[nome] = metodo === 8 ? zlib.inflateRawSync(dados) : dados;
    i = ini + tam;
  }
  return out;
}

module.exports = { criarZip, lerZip, crc32 };
