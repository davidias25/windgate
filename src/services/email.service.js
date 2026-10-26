/**
 * E-mail de notas fiscais (domínio windgate.com.br, hospedagem própria → IMAP).
 *
 * Lê a caixa configurada (ex.: notas@windgate.com.br) a cada 10 minutos: o que
 * chega com XML de NF-e vira nota no Fiscal; PDF sem XML entra como "conferir",
 * com o arquivo anexado. A mensagem lida é marcada como vista e movida para a
 * pasta "Sistema" (se existir) para não ser lida de novo.
 *
 * Configuração só no servidor: IMAP_HOST, IMAP_PORTA (993), IMAP_USUARIO, IMAP_SENHA.
 */
const W = require('../../public/hub/js/regras.js');

const configurado = () => !!(process.env.IMAP_HOST && process.env.IMAP_USUARIO && process.env.IMAP_SENHA);

/** Converte uma mensagem já lida (mailparser) em notas. Separado para testar sem servidor de e-mail. */
function notasDaMensagem(msg, cnpjs, novaNota, salvarAnexo) {
  const out = [];
  const de = (msg.from && msg.from.text) || '', assunto = msg.subject || '';
  return Promise.all((msg.attachments || []).map(async a => {
    const nome = a.filename || 'anexo';
    if (/\.xml$/i.test(nome) || /xml/i.test(a.contentType || '')) {
      const nf = W.lerXmlNFe(a.content.toString('utf8'));
      if (nf) { const link = salvarAnexo ? await salvarAnexo(nome, a.content, a.contentType).catch(() => '') : ''; out.push(novaNota(Object.assign(nf, W.classificarNota(nf, cnpjs), { xmlLink: link, obs: `e-mail de ${de}: ${assunto}`.slice(0, 200) }), 'email')); }
    } else if (/\.pdf$/i.test(nome)) {
      const link = salvarAnexo ? await salvarAnexo(nome, a.content, a.contentType).catch(() => '') : '';
      out.push(novaNota({ tipo: 'outra', arquivo: nome, pdfLink: link, status: 'conferir', data: (msg.date ? new Date(msg.date) : new Date()).toISOString().slice(0, 10), obs: `e-mail de ${de}: ${assunto} · PDF sem XML: conferir`.slice(0, 200) }, 'email'));
    }
  })).then(() => {
    // Quando o XML e o PDF da mesma nota vêm juntos, o PDF não vira uma segunda nota.
    const temXml = out.some(n => n.chave);
    return temXml ? out.filter(n => n.chave || !/PDF sem XML/.test(n.obs)) : out;
  });
}

async function lerCaixa({ cnpjs, novaNota, salvarAnexo, limite }) {
  if (!configurado()) return { lidas: 0, notas: [] };
  const { ImapFlow } = require('imapflow');
  const { simpleParser } = require('mailparser');
  const cliente = new ImapFlow({ host: process.env.IMAP_HOST, port: +(process.env.IMAP_PORTA || 993), secure: (process.env.IMAP_SEGURO || '1') !== '0',
    auth: { user: process.env.IMAP_USUARIO, pass: process.env.IMAP_SENHA }, logger: false });
  await cliente.connect();
  const notas = []; let lidas = 0;
  const trava = await cliente.getMailboxLock(process.env.IMAP_PASTA || 'INBOX');
  try {
    const uids = (await cliente.search({ seen: false })) || [];
    for (const uid of uids.slice(0, limite || 30)) {
      const m = await cliente.fetchOne(uid, { source: true }, { uid: true });
      const msg = await simpleParser(m.source);
      notas.push(...await notasDaMensagem(msg, cnpjs, novaNota, salvarAnexo));
      await cliente.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
      try { await cliente.messageMove(uid, process.env.IMAP_PASTA_LIDAS || 'INBOX.Sistema', { uid: true }); } catch (e) { /* sem a pasta: fica só marcada como lida */ }
      lidas++;
    }
  } finally { trava.release(); await cliente.logout().catch(() => {}); }
  return { lidas, notas };
}

module.exports = { configurado, lerCaixa, notasDaMensagem };
