/**
 * Link rastreável da proposta: assinado com o segredo do servidor, com validade, como o do portal.
 * A página mostra só a proposta: itens, parcelas e condições. Custo, margem e dólar de custo nunca entram.
 */
const crypto = require('crypto');
const segredo = () => (process.env.WINDGATE_DB_SECRET || 'dev') + ':proposta';
const b64 = s => Buffer.from(s).toString('base64url');
const assinar = corpo => crypto.createHmac('sha256', segredo()).update(corpo).digest('base64url').slice(0, 32);

function gerar(quoteId, clienteId, dias, agora) {
  const exp = Math.floor(((agora || Date.now()) + (dias || 30) * 864e5) / 1000);
  const corpo = b64(JSON.stringify({ q: quoteId, c: clienteId || '', exp, n: crypto.randomBytes(4).toString('hex') }));
  return corpo + '.' + assinar(corpo);
}
function ler(t, agora) {
  const [corpo, sig] = String(t || '').split('.');
  if (!corpo || !sig) return null;
  const ok = assinar(corpo);
  if (sig.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(ok))) return null;
  let d; try { d = JSON.parse(Buffer.from(corpo, 'base64url').toString()); } catch (e) { return null; }
  if (!d || !d.q || d.exp * 1000 < (agora || Date.now())) return null;
  return d;
}
const idDoLink = t => 'pl-' + String(t).split('.')[1].slice(0, 16);

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const CSS = `body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#F3F5F9;color:#1B2A5B}header{background:#1B2A5B;color:#fff;padding:22px 16px}header h1{margin:0;font-size:20px}main{max-width:760px;margin:0 auto;padding:16px}section{background:#fff;border:1px solid #DDE4EA;border-radius:6px;padding:14px;margin-bottom:12px}h2{font-size:14px;margin:0 0 8px;color:#B5106B}.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:7px 6px;border-bottom:1px solid #EDF1F5;text-align:left}.n{text-align:right;white-space:nowrap}.total{display:flex;justify-content:space-between;font-weight:700;font-size:17px;padding-top:10px}.nota{font-size:12px;color:#64707D;line-height:1.5}`;

/** Monta a página com o resumo que as regras da cotação entregam. */
function pagina(p, token) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Proposta WindGate</title><style>${CSS}</style></head><body>
<header><h1>Proposta comercial WindGate</h1><div>${esc(p.cliente)}</div></header><main>
<section><h2>Escopo</h2><p>${esc(p.mercadoria)}. Valores finais, nacionalizados, com entrega conforme o Incoterm ${esc(p.incoterm)}${p.destino ? ' (' + esc(p.destino) + ')' : ''}. Validade: ${esc(p.validade)} dias. Prazo estimado: ${esc(p.prazo)} dias.</p></section>
<section><h2>Itens</h2><div class="tw"><table><thead><tr><th>Item</th><th class="n">Qtd</th><th class="n">Preço unitário</th><th class="n">Total</th></tr></thead><tbody>
${p.itens.map(i => `<tr><td>${esc(i.d)}</td><td class="n">${esc(i.q)}</td><td class="n">${brl(i.unit)}</td><td class="n">${brl(i.total)}</td></tr>`).join('')}
${p.desconto > 0 ? `<tr><td>Desconto comercial</td><td></td><td></td><td class="n">- ${brl(p.desconto)}</td></tr>` : ''}</tbody></table></div>
<div class="total"><span>Investimento total</span><span>${brl(p.investimento)}</span></div>
${p.difal > 0 ? `<p class="nota">+ ICMS-DIFAL previsto de ${brl(p.difal)}: pago em guia à SEFAZ e reembolsado na 3ª parcela. Total estimado: <b>${brl(p.total)}</b>.</p>` : ''}</section>
<section><h2>Parcelas</h2><div class="tw"><table><thead><tr><th>Parcela</th><th class="n">Valor</th><th class="n">Previsão</th></tr></thead><tbody>${p.parcelas.map(x => `<tr><td>${x.n}ª${x.nome ? ' · ' + esc(x.nome) + (x.gatilho ? `<br><small>${esc(x.gatilho)}</small>` : '') : ''}</td><td class="n">${brl(x.valor)}${x.reajuste ? `<br><small>+ ${brl(x.reajuste)} reajuste cambial</small>` : ''}</td><td class="n">${x.prazo ? esc(x.prazo) : dataBR(x.previsao)}</td></tr>`).join('')}</tbody></table></div></section>
${p.cambio ? `<section><h2>Câmbio</h2><p>${esc(p.cambio.referencia)}</p><div class="tw"><table><thead><tr>${p.cambio.colunas.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${p.cambio.linhas.map(l => `<tr>${l.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="nota">${esc(p.cambio.regra)}</p></section>` : ''}
<p class="nota">WindGate · Importação e Trading · Good winds open doors.</p></main>
<script>fetch(${JSON.stringify('/p/proposta/' + token + '/aberta')},{method:'POST'}).catch(function(){});</script></body></html>`;
}
const paginaAviso = msg => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Proposta WindGate</title><style>${CSS}</style></head><body><header><h1>Proposta comercial WindGate</h1></header><main><section><p>${esc(msg)}</p></section></main></body></html>`;

module.exports = { gerar, ler, idDoLink, pagina, paginaAviso };
