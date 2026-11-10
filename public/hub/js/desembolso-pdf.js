/* Hub 2.0 — PDF do desembolso do cliente: A4 deitado, uma página, no padrão WindGate (modelo: desembolso da OP26).
   Recebe os dados prontos de W.dadosDesembolso: aqui só se desenha. O que é interno (US$ remetido à fábrica,
   spread, descrição interna do lançamento) nem chega até aqui. */
(function () {
  const H = window.HUB;
  const NAVY = [27, 42, 91], MAG = [181, 16, 107], ROXO = [104, 40, 140], CINZA = [100, 112, 125], TINTA = [24, 30, 45], LINHA = [221, 228, 234], FUNDO = [243, 245, 249];
  const SIT = { pago: { t: 'PAGO', c: [30, 130, 76], f: [226, 244, 233] }, proximo: { t: 'PRÓXIMO PAGAMENTO', c: [170, 110, 10], f: [253, 243, 210] }, aPagar: { t: 'A PAGAR', c: [37, 99, 235], f: [226, 236, 253] } };
  const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const sinal = v => (v >= 0 ? '+ ' : '– ') + brl(Math.abs(v));
  const taxa = (v, min) => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: min == null ? 4 : min, maximumFractionDigits: 4 });
  const dataBR = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
  let logo = null;
  async function carregarLogo() {
    if (logo) return logo;
    const r = await fetch('logo-branca.png'); if (!r.ok) throw new Error('logo');
    const b = await r.blob();
    logo = await new Promise((ok, erro) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = erro; fr.readAsDataURL(b); });
    return logo;
  }

  H.pdfDesembolso = async function (dd) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' }), L = 841.89, A = 595.28, M = 34, W0 = L - 2 * M;
    const f = (tam, neg, cor) => { doc.setFont('helvetica', neg ? 'bold' : 'normal'); doc.setFontSize(tam); doc.setTextColor(...(cor || TINTA)); };
    const cl = dd.clausula, ref = cl && cl.ref ? ` (cl. ${cl.ref})` : '';

    /* Onda navy com a faixa magenta na borda, e a logo vazada */
    doc.setFillColor(...MAG); doc.lines([[300, 0], [140, -10, 20, 60, -95, 85], [-120, 15, -260, 18, -345, 20]], 0, 0, [1, 1], 'F', true);
    doc.setFillColor(...NAVY); doc.lines([[420, 0], [-10, 45, -110, 70, -230, 85], [-80, 10, -170, 14, -190, 14]], 0, -1, [1, 1], 'F', true);
    doc.lines([[0, 0], [430, 0], [0, 0]], 0, 0, [1, 1], 'F', true);
    try { doc.addImage(await carregarLogo(), 'PNG', 34, 20, 168, 48.5); } catch (e) { f(22, true, [255, 255, 255]); doc.text('WindGate', 40, 56); }

    /* Cabeçalho à direita */
    const xr = L - M;
    f(7, true, CINZA); doc.text(`DESEMBOLSO DO CLIENTE · ATUALIZADO EM ${dataBR(dd.atualizado)}`, xr, 30, { align: 'right' });
    f(17, true, NAVY); doc.text(`${dd.op} · ${dd.cliente}`, xr, 52, { align: 'right' });
    if (dd.obra) { f(8, false, CINZA); doc.text(String(dd.obra).slice(0, 110), xr, 65, { align: 'right' }); }
    f(7, true, CINZA); doc.text('VALOR GLOBAL ATUALIZADO', xr, 85, { align: 'right' });
    f(22, true, MAG); doc.text(brl(dd.total), xr, 108, { align: 'right' });
    if (Math.abs(dd.reajuste) > 0.004) { f(7, false, CINZA); doc.text(`Contrato ${brl(dd.contrato)} ${dd.reajuste >= 0 ? '+' : '–'} reajuste cambial líquido ${brl(Math.abs(dd.reajuste))}${ref}`, xr, 120, { align: 'right' }); }

    /* Parcelas */
    let y = 148;
    const cols = { n: M + 22, nome: M + 52, venc: xr - 300, valor: xr - 150, sit: xr - 22 };
    f(6.5, true, CINZA); doc.text('#', cols.n, y, { align: 'center' }); doc.text('PARCELA', cols.nome, y); doc.text('VENCIMENTO', cols.venc, y, { align: 'center' }); doc.text('VALOR', cols.valor, y, { align: 'right' }); doc.text('SITUAÇÃO', cols.sit, y, { align: 'right' });
    y += 10;
    const alt = dd.parcelas.length > 4 ? 30 : 38;
    dd.parcelas.forEach((p, i) => {
      const prox = p.situacao === 'proximo', s = SIT[p.situacao] || SIT.aPagar;
      if (prox) { doc.setFillColor(255, 253, 245); doc.setDrawColor(...NAVY); doc.setLineWidth(1.3); }
      else { doc.setFillColor(...FUNDO); doc.setDrawColor(...LINHA); doc.setLineWidth(0.8); }
      doc.roundedRect(M + 4, y, W0 - 8, alt, alt / 2, alt / 2, 'FD');
      const m = y + alt / 2;
      doc.setFillColor(...NAVY); doc.circle(cols.n, m, 7.5, 'F'); f(7.5, true, [255, 255, 255]); doc.text(String(i + 1), cols.n, m + 2.6, { align: 'center' });
      f(10, true, NAVY); doc.text(String(p.rotulo).slice(0, 80), cols.nome, p.sub ? m - 1.5 : m + 3.5);
      if (p.sub) { f(7, false, CINZA); doc.text(String(p.sub).slice(0, 110), cols.nome, m + 9); }
      f(9, false, TINTA); doc.text(dataBR(p.vencimento), cols.venc, m + 3, { align: 'center' });
      f(10.5, true, NAVY); doc.text(brl(p.valor), cols.valor, m + 3.5, { align: 'right' });
      f(6.5, true, s.c); const tw = doc.getTextWidth(s.t) + 18;
      doc.setFillColor(...s.f); doc.roundedRect(cols.sit - tw + 6, m - 7.5, tw, 15, 7.5, 7.5, 'F'); doc.text(s.t, cols.sit - tw / 2 + 6, m + 2.4, { align: 'center' });
      y += alt + 6;
    });

    /* Barra Pago / A pagar, degradê magenta → roxo */
    y += 2; const hb = 26;
    const passos = 160;
    for (let i = 0; i < passos; i++) { const t = i / (passos - 1), c = MAG.map((v, k) => Math.round(v + (ROXO[k] - v) * t)); doc.setFillColor(...c); doc.rect(M + hb / 2 + i * (W0 - hb) / passos, y, (W0 - hb) / passos + 0.6, hb, 'F'); }
    doc.setFillColor(...MAG); doc.circle(M + hb / 2, y + hb / 2, hb / 2, 'F'); doc.setFillColor(...ROXO); doc.circle(xr - hb / 2, y + hb / 2, hb / 2, 'F');
    f(10, true, [255, 255, 255]); doc.text(`Pago ${brl(dd.pago)}`, M + 18, y + 17); doc.text(`A pagar ${brl(dd.aPagar)}`, xr - 18, y + 17, { align: 'right' });

    /* Dois blocos embaixo */
    const yb = y + hb + 16, base = A - 48, wl = W0 * 0.5 - 8, xd = M + wl + 16, wd = W0 - wl - 16;
    const caixa = (x, yy, w, h, titulo) => {
      doc.setDrawColor(...LINHA); doc.setLineWidth(0.8); doc.setFillColor(255, 255, 255); doc.roundedRect(x, yy, w, h, 9, 9, 'FD');
      if (!titulo) return yy;
      doc.setFillColor(...NAVY); doc.roundedRect(x, yy, w, 24, 9, 9, 'F'); doc.rect(x, yy + 12, w, 12, 'F');
      f(7.5, true, [255, 255, 255]); doc.text(titulo, x + 14, yy + 15.5);
      return yy + 24;
    };
    const cp = dd.composicao;
    let yy = caixa(M, yb, wl, base - yb, cp ? `COMPOSIÇÃO DA ${cp.rotulo.toUpperCase()} — REAJUSTE CAMBIAL${ref.toUpperCase()}` : 'PARCELAS E CÂMBIO') + 18;
    const lin = (a, b, o) => { const x = o || {}; f(x.tam || 9, !!x.neg, x.cor || TINTA); doc.text(a, M + 14, yy); f(x.tam || 9, true, x.corV || x.cor || TINTA); doc.text(b, M + wl - 14, yy, { align: 'right' }); yy += x.passo || 15; };
    if (cp) {
      lin(cp.rotuloContrato, brl(cp.contrato));
      cp.reajustes.forEach(r => lin(`Reajuste do ${r.ordem}º câmbio${r.rotulo ? ' — ' + r.rotulo : ''} (PTAX ${taxa(r.ptax)} em ${dataBR(r.data)})`, sinal(r.valor)));
      doc.setDrawColor(...LINHA); doc.line(M + 14, yy - 9, M + wl - 14, yy - 9); yy += 3;
      lin(`Total da ${cp.rotulo.toLowerCase()}`, brl(cp.total), { neg: true, tam: 10.5, cor: NAVY, corV: MAG, passo: 20 });
    }
    if (cl) {
      const faixa = (a, b) => { doc.setFillColor(...FUNDO); doc.roundedRect(M + 12, yy - 9, wl - 24, 14, 4, 4, 'F'); f(7.5, false, CINZA); doc.text(a, M + 20, yy + 0.5); f(7.5, true, TINTA); doc.text(b, M + wl - 20, yy + 0.5, { align: 'right' }); yy += 17; };
      faixa('PTAX de referência do contrato', 'R$ ' + taxa(cl.referencia, 2));
      faixa('Faixa sem reajuste', `R$ ${taxa(cl.faixaMin, 2)} a R$ ${taxa(cl.faixaMax, 2)}`);
      (cp ? cp.reajustes.slice().sort((a, b) => a.ordem - b.ordem) : []).forEach(r => faixa(`${r.ordem}º câmbio (${dataBR(r.data).slice(0, 5)}): ${r.dentro ? 'dentro da faixa' : r.variacao > 0 ? 'acima da faixa' : 'abaixo da faixa'}`, r.dentro ? 'sem reajuste' : `${r.variacao >= 0 ? '+' : '–'} R$ ${taxa(Math.abs(r.variacao), 2)} / US$`));
      doc.setDrawColor(...LINHA); doc.line(M + 14, yy - 4, M + wl - 14, yy - 4); yy += 7;
      f(6.8, false, CINZA); doc.text(doc.splitTextToSize(cl.texto, wl - 28), M + 14, yy);
    }
    /* Próximo pagamento */
    let yd = yb;
    if (dd.proxima) {
      f(7.2, false); const tx = doc.splitTextToSize(dd.proxima.libera || '', wd - 32), h = 58 + tx.length * 9;
      doc.setFillColor(253, 246, 222); doc.setDrawColor(240, 214, 140); doc.setLineWidth(0.8); doc.roundedRect(xd, yd, wd, h, 9, 9, 'FD');
      f(7.5, true, [170, 110, 10]); doc.text('PRÓXIMO PAGAMENTO', xd + 16, yd + 18);
      f(17, true, NAVY); doc.text(`${dataBR(dd.proxima.vencimento)}  ·  ${brl(dd.proxima.valor)}`, xd + 16, yd + 40);
      f(7.2, false, [140, 95, 10]); doc.text(tx, xd + 16, yd + 54);
      yd += h + 14;
    }
    /* Dados para pagamento */
    const pg = dd.pagamento || {};
    let yp = caixa(xd, yd, wd, Math.min(base - yd, pg.asaas ? 96 : 104), 'DADOS PARA PAGAMENTO · ' + (pg.asaas ? 'BOLETO / PIX' : 'PIX / TED')) + 20;
    f(10, true, NAVY); doc.text(String(pg.favorecido || '').toUpperCase(), xd + 16, yp); yp += 12;
    f(7.5, false, CINZA); doc.text('CNPJ ' + (pg.cnpj || '—'), xd + 16, yp); yp += 16;
    if (pg.asaas) { f(9, false, TINTA); doc.text('Boleto e PIX gerados pelo Asaas, enviados junto com este desembolso.', xd + 16, yp); }
    else {
      f(9, false, TINTA); doc.text([pg.banco && 'Banco ' + pg.banco.replace(/^banco\s+/i, ''), pg.agencia && 'Agência ' + pg.agencia, pg.conta && 'Conta Corrente ' + pg.conta].filter(Boolean).join('  ·  '), xd + 16, yp); yp += 16;
      if (pg.pix) { f(10, true, MAG); doc.text('PIX (CNPJ)  ' + pg.pix, xd + 16, yp); }
    }

    /* Rodapé */
    doc.setDrawColor(...LINHA); doc.setLineWidth(0.6); doc.line(M, A - 34, xr, A - 34);
    const ct = dd.contato || {};
    f(6.8, false, CINZA); doc.text(['WINDGATE · IMPORTAÇÃO E TRADING · Good winds open doors.', ct.nome, ct.fone, ct.email].filter(Boolean).join('  ·  '), M, A - 20);
    doc.text('Confirme os dados por telefone antes de qualquer transferência.', xr, A - 20, { align: 'right' });

    doc.save(`Desembolso_${String(dd.op).replace(/[^\w.-]+/g, '_')}_${String(dd.atualizado).slice(0, 10)}.pdf`);
    return doc;
  };
})();
