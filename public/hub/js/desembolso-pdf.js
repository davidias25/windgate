/* Hub 2.0 — PDF do desembolso do cliente: A4 deitado, uma página, no padrão WindGate.
   Recebe os dados prontos de W.dadosDesembolso: aqui só se desenha. O que é interno (US$ remetido à fábrica,
   spread, descrição interna do lançamento) nem chega até aqui. */
(function () {
  const H = window.HUB, W = H.W;
  const NAVY = [27, 42, 91], MAG = [181, 16, 107], ROXO = [104, 52, 170], CINZA = [100, 112, 125], TINTA = [24, 30, 45];
  const VERDE = [30, 130, 76], VERDE_F = [232, 245, 238], AMAR_F = [252, 243, 205], AMAR = [140, 104, 10], AZUL = [37, 99, 235], AZUL_F = [232, 240, 254];
  const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const taxa = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
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
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' }), L = 841.89, A = 595.28;
    const fonte = (tam, neg, cor) => { doc.setFont('helvetica', neg ? 'bold' : 'normal'); doc.setFontSize(tam); doc.setTextColor(...(cor || TINTA)); };

    /* Onda navy no canto, com a logo vazada (branca, sem fundo). */
    doc.setFillColor(...NAVY); doc.ellipse(70, -40, 380, 160, 'F');
    doc.setFillColor(...MAG); doc.ellipse(-20, 118, 120, 8, 'F');
    try { doc.addImage(await carregarLogo(), 'PNG', 36, 30, 160, 46.2); } catch (e) { fonte(22, true, [255, 255, 255]); doc.text('WindGate', 40, 62); }

    /* Cabeçalho à direita */
    const xr = L - 36;
    fonte(9, false, CINZA); doc.text(`Desembolso do cliente · atualizado em ${dataBR(dd.atualizado)}`, xr, 34, { align: 'right' });
    fonte(15, true, NAVY); doc.text(`${dd.op} · ${dd.cliente}`, xr, 54, { align: 'right' });
    if (dd.obra) { fonte(9.5, false, CINZA); doc.text(String(dd.obra).slice(0, 80), xr, 69, { align: 'right' }); }
    fonte(8, true, CINZA); doc.text('VALOR GLOBAL ATUALIZADO', xr, 88, { align: 'right' });
    fonte(20, true, MAG); doc.text(brl(dd.total), xr, 110, { align: 'right' });
    if (Math.abs(dd.reajuste) > 0.004) { fonte(8.5, false, CINZA); doc.text(`Contrato ${brl(dd.contrato)} ${dd.reajuste >= 0 ? '+' : '-'} reajuste ${brl(Math.abs(dd.reajuste))}`, xr, 124, { align: 'right' }); }

    /* Parcelas em faixas */
    let y = 150; const x0 = 36, w = L - 72, alt = dd.parcelas.length > 4 ? 26 : 32;
    fonte(8, true, CINZA); doc.text('PARCELA', x0 + 14, y - 6); doc.text('VENCIMENTO', x0 + 420, y - 6); doc.text('VALOR', x0 + 600, y - 6, { align: 'right' }); doc.text('SITUAÇÃO', x0 + w - 14, y - 6, { align: 'right' });
    dd.parcelas.forEach(p => {
      const cor = p.situacao === 'pago' ? [VERDE_F, VERDE, 'PAGO'] : p.situacao === 'proximo' ? [AMAR_F, AMAR, 'PRÓXIMO PAGAMENTO'] : [AZUL_F, AZUL, 'A PAGAR'];
      doc.setFillColor(...cor[0]);
      if (p.situacao === 'proximo') { doc.setDrawColor(...NAVY); doc.setLineWidth(1.4); doc.roundedRect(x0, y, w, alt, 8, 8, 'FD'); } else doc.roundedRect(x0, y, w, alt, 8, 8, 'F');
      const m = y + alt / 2 + 3.5;
      fonte(10.5, true, NAVY); doc.text(String(p.rotulo).slice(0, 70), x0 + 14, m);
      fonte(10, false, TINTA); doc.text(dataBR(p.vencimento), x0 + 420, m);
      fonte(11, true, TINTA); doc.text(brl(p.valor), x0 + 600, m, { align: 'right' });
      fonte(8.5, true, cor[1]); doc.text(cor[2], x0 + w - 14, m, { align: 'right' });
      y += alt + 6;
    });

    /* Barra pago / a pagar, em degradê magenta → roxo */
    y += 6;
    const fr = dd.total > 0 ? Math.min(1, dd.pago / dd.total) : 0, wb = w, hb = 10;
    doc.setFillColor(226, 230, 238); doc.roundedRect(x0, y, wb, hb, 5, 5, 'F');
    const passos = Math.max(1, Math.round(wb * fr / 2));
    for (let i = 0; i < passos; i++) { const t = i / Math.max(1, passos - 1), c = MAG.map((v, k) => Math.round(v + (ROXO[k] - v) * t)); doc.setFillColor(...c); doc.rect(x0 + i * 2, y, 2.2, hb, 'F'); }
    fonte(9, true, MAG); doc.text(`Pago ${brl(dd.pago)}`, x0, y + 24);
    fonte(9, true, ROXO); doc.text(`A pagar ${brl(dd.aPagar)}`, x0 + wb, y + 24, { align: 'right' });

    /* Dois blocos embaixo */
    const yb = y + 36, hB = A - yb - 52, wl = w * 0.54, wrb = w - wl - 14, xrb = x0 + wl + 14;
    doc.setDrawColor(221, 228, 234); doc.setLineWidth(0.8); doc.roundedRect(x0, yb, wl, hB, 8, 8, 'S');
    let yy = yb + 20;
    const cp = dd.composicao;
    if (cp) {
      fonte(10, true, NAVY); doc.text(`Composição da ${cp.rotulo.toLowerCase()}`, x0 + 14, yy); yy += 16;
      const linha = (a, b, neg) => { fonte(9, !!neg, TINTA); doc.text(a, x0 + 14, yy); doc.text(b, x0 + wl - 14, yy, { align: 'right' }); yy += 13; };
      linha('Parcela do contrato', brl(cp.contrato));
      cp.reajustes.forEach(r => linha(`Reajuste do câmbio de ${dataBR(r.data)} · PTAX ${taxa(r.ptax)}${r.dentro ? ' (na faixa)' : ''}`, (r.valor >= 0 ? '+ ' : '- ') + brl(Math.abs(r.valor))));
      doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.line(x0 + 14, yy - 8, x0 + wl - 14, yy - 8); yy += 2;
      linha('Total da parcela', brl(cp.total), true);
      if (dd.clausula) {
        yy += 2; fonte(8, false, CINZA);
        doc.text(`PTAX de referência ${taxa(dd.clausula.referencia)} · faixa sem reajuste ${taxa(dd.clausula.faixaMin)} a ${taxa(dd.clausula.faixaMax)}${cp.reajustes.length ? ' · variação aplicada ' + cp.reajustes.map(r => (r.variacao >= 0 ? '+' : '') + taxa(r.variacao)).join(' e ') + ' R$/US$' : ''}`, x0 + 14, yy); yy += 12;
        doc.text(doc.splitTextToSize(dd.clausula.texto, wl - 28), x0 + 14, yy);
      }
    } else {
      fonte(10, true, NAVY); doc.text('Parcelas sem reajuste cambial até aqui', x0 + 14, yy); yy += 16;
      if (dd.clausula) { fonte(8.5, false, CINZA); doc.text(doc.splitTextToSize(`PTAX de referência ${taxa(dd.clausula.referencia)} · faixa sem reajuste ${taxa(dd.clausula.faixaMin)} a ${taxa(dd.clausula.faixaMax)}. ${dd.clausula.texto}`, wl - 28), x0 + 14, yy); }
    }
    /* Próximo pagamento e dados para pagar */
    let yr = yb;
    if (dd.proxima) {
      doc.setFillColor(...AMAR_F); doc.roundedRect(xrb, yr, wrb, 70, 8, 8, 'F');
      fonte(8, true, AMAR); doc.text('PRÓXIMO PAGAMENTO', xrb + 14, yr + 18);
      fonte(15, true, NAVY); doc.text(`${dataBR(dd.proxima.vencimento)} · ${brl(dd.proxima.valor)}`, xrb + 14, yr + 38);
      fonte(8.5, false, TINTA); doc.text(doc.splitTextToSize(dd.proxima.libera || '', wrb - 28), xrb + 14, yr + 54);
      yr += 80;
    }
    doc.setDrawColor(221, 228, 234); doc.roundedRect(xrb, yr, wrb, yb + hB - yr, 8, 8, 'S');
    let yp = yr + 18; const pg = dd.pagamento || {};
    fonte(8, true, CINZA); doc.text('DADOS PARA PAGAMENTO', xrb + 14, yp); yp += 15;
    const kv = (k, v) => { fonte(8.5, false, CINZA); doc.text(k, xrb + 14, yp); fonte(9, true, TINTA); doc.text(String(v || '—'), xrb + 112, yp); yp += 13; };
    if (pg.asaas) kv('Boleto e PIX', 'gerados pelo Asaas, enviados ao cliente');
    kv('Favorecido', pg.favorecido); kv('CNPJ', pg.cnpj);
    if (!pg.asaas) { kv('Banco', pg.banco); kv('Agência / conta', [pg.agencia, pg.conta].filter(Boolean).join(' / ')); kv('PIX (chave CNPJ)', pg.pix); }

    /* Rodapé */
    doc.setDrawColor(221, 228, 234); doc.line(36, A - 40, L - 36, A - 40);
    const ct = dd.contato || {};
    fonte(8.5, true, NAVY); doc.text([ct.nome, ct.fone, ct.email].filter(Boolean).join(' · ') || 'WindGate', 36, A - 24);
    fonte(8.5, true, MAG); doc.text('Confirme os dados por telefone antes de qualquer transferência.', L - 36, A - 24, { align: 'right' });

    doc.save(`Desembolso_${String(dd.op).replace(/[^\w.-]+/g, '_')}_${String(dd.atualizado).slice(0, 10)}.pdf`);
    return doc;
  };
})();
