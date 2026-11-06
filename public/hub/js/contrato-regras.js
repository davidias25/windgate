/* =====================================================================
   WindGate Hub 2.0 — contrato padrão da operação (sem tela).

   Sempre importação por conta própria. Quem contrata sai da estrutura fiscal:
   não contribuinte, J&T Import; contribuinte, SF Trading.

   O texto das cláusulas vem do modelo oficial (src/contratos/modelo-*.json) e
   nunca é escrito aqui. Este módulo só preenche, marca o que falta como
   [PENDENTE], confere os números e aponta os alertas. Nada aqui altera o texto,
   e quem libera é o Samir.
   ===================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(Object.assign({}, require('./regras.js'), require('./comex.js'), require('./cotacao-regras.js'), require('./cambio-regras.js')));
  else Object.assign(raiz.WG, fabrica(raiz.WG));
})(typeof self !== 'undefined' ? self : this, function (W) {
  const PENDENTE = '[PENDENTE]';
  const ESTRUTURAS = { jt: { nome: 'J&T Import', rotulo: 'Não contribuinte · J&T Import' }, sf: { nome: 'SF Trading', rotulo: 'Contribuinte · SF Trading' } };
  const NIVEIS = ['bloqueante', 'atencao', 'informativo'];
  const CAMPOS_EDITAVEIS = [['razaoSocial', 'Razão social'], ['cnpj', 'CNPJ'], ['endereco', 'Endereço'], ['cep', 'CEP'], ['representante', 'Representante'], ['cpf', 'CPF do representante'],
    ['ieNumero', 'Inscrição estadual (número)'], ['ieComprovanteEm', 'IE comprovada em'], ['incoterm', 'Incoterm'], ['localEntrega', 'Local de entrega'], ['prazo', 'Prazo (dias)']];
  const dig = v => String(v == null ? '' : v).replace(/\D/g, '');

  /* ---------- Documentos ---------- */
  function cnpjValido(v) {
    const d = dig(v); if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const dv = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +d[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === +d[12] && dv(13) === +d[13];
  }
  function cpfValido(v) {
    const d = dig(v); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === +d[9] && dv(10) === +d[10];
  }
  /** true, false ou null (não dá para afirmar: só o Ceará tem dígito conferido aqui). */
  function ieValida(numero, uf) {
    const d = dig(numero); if (!d || d.length < 8 || d.length > 14) return false;
    if (String(uf || '').toUpperCase() !== 'CE') return null;
    if (d.length !== 9) return false;
    let s = 0; for (let i = 0; i < 8; i++) s += +d[i] * (9 - i);
    const r = 11 - (s % 11);
    return (r >= 10 ? 0 : r) === +d[8];
  }

  /* ---------- Dados do contrato ---------- */
  const moeda = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const estruturaDe = (o, q) => (o && o.estruturaFiscal) || (W.camposDe(q || {}).tipoOp === 'triangular' ? 'jt' : 'sf');
  function clienteDaOp(db, o, nome) {
    if (W.clienteDoCrm) return W.clienteDoCrm(db, nome || o.cliente);
    return (db.crm || []).find(c => c && (c.empresa === o.cliente || c.nome === o.cliente)) || null;
  }
  const calculoDe = q => { if (q._RCliente) return q._RCliente; const R = W.calcular(q); if (Math.abs((R.preco || 0) - (+q.preco || 0)) > 0.01) { const b = W.calcular(q, { modo: 'brl' }); if (Math.abs((b.preco || 0) - (+q.preco || 0)) <= 0.01) return b; } return R; };
  /** Tudo o que o contrato usa: puxa da cotação e do cadastro; o editado antes de gerar vence. */
  function dadosDoContrato(db, opId, editados) {
    const o = (db.ops || []).find(x => x && x.id === opId); if (!o) return null;
    const q = W.cotacaoDaOp(db, o), e = editados || {}, f = q ? W.camposDe(q) : {}, R = q ? calculoDe(q) : null;
    const c = clienteDaOp(db, o, o.cliente) || {}, end = c.end || {}, estrutura = estruturaDe(o, q);
    const contribuinte = estrutura === 'sf', cfg = ((db.hubPainel || {})._contrato || {});
    const v = (k, ...alt) => { const x = e[k] != null && e[k] !== '' ? e[k] : alt.find(y => y != null && y !== ''); return x == null ? '' : String(x); };
    const endereco = [end.logradouro, end.numero, end.bairro, end.cidade, end.uf].filter(Boolean).join(', ');
    const res = q && R ? W.resumoProposta(q, R) : null;
    const parcelas = e.parcelas || (res ? res.parcelas.map(p => ({ n: p.n, valor: p.valor })) : []);
    const campos = {
      razaoSocial: v('razaoSocial', c.empresa, o.cliente), cnpj: v('cnpj', c.cnpj), endereco: v('endereco', endereco), cep: v('cep', end.cep), representante: v('representante', c.representante, c.nome), cpf: v('cpf', c.cpfRepresentante),
      ieNumero: contribuinte ? v('ieNumero', c.ie, c.inscricaoEstadual) : 'não se aplica', ieComprovanteEm: contribuinte ? v('ieComprovanteEm', c.ieComprovanteEm) : 'não se aplica',
      incoterm: v('incoterm', f.incoterm), localEntrega: v('localEntrega', f.destino), freteNacional: e.freteNacional != null ? (e.freteNacional ? 'incluso' : 'não incluso') : (R && (R.comp || {}).terrestre > 0 ? 'incluso' : 'não incluso'),
      prazo: v('prazo', f.prazoProposta, '90 a 100'), mercadoria: v('mercadoria', f.mercadoria, o.nome), operacao: o.id, data: W.dataBR ? W.dataBR(W.hojeISO()) : W.hojeISO(), difal: res ? moeda(res.difal) : '', investimento: res ? moeda(res.investimento) : '', total: res ? moeda(res.total) : '' };
    const ct = cfg[estrutura] || {};
    Object.assign(campos, { contratadaRazao: ct.razao || '', contratadaCnpj: ct.cnpj || '', contratadaEndereco: ct.endereco || '', banco: ct.banco || '', agencia: ct.agencia || '', conta: ct.conta || '', pix: ct.pix || '' });
    return { op: o, q, R, resumo: res, estrutura, contribuinte, uf: end.uf || W.camposDe(q || {}).ufDestino || '', campos, parcelas,
      itens: res ? res.itens.map(i => ({ d: i.d, q: i.q, unit: i.unit, total: i.total })) : [], tabela: q ? W.textoCambio(W.tabelaCambio(q)) : null, tabelaRaw: q ? W.tabelaCambio(q) : null };
  }

  /* ---------- Preenchimento ---------- */
  /** Troca {{campo}} pelo valor. Campo vazio ou desconhecido sai como [PENDENTE], nunca em branco. */
  function preencherTexto(texto, campos, pendentes) {
    return String(texto || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => { const x = campos[k]; if (x == null || String(x).trim() === '') { pendentes.add(k); return PENDENTE; } return String(x); });
  }
  /** Modelo oficial + dados = blocos prontos. Anexos saem dos dados; o texto, só do modelo. */
  function preencherModelo(modelo, dados) {
    const pendentes = new Set(), blocos = [];
    const ANEXOS = {
      anexoItens: () => ({ t: 'tabela', colunas: ['Item', 'Qtd', 'Preço unitário (R$)', 'Total (R$)'], linhas: dados.itens.map(i => [i.d, String(i.q), moeda(i.unit), moeda(i.total)]) }),
      anexoParcelas: () => ({ t: 'tabela', colunas: ['Parcela', 'Valor (R$)'], linhas: dados.parcelas.map(p => [p.n + 'ª', moeda(p.valor)]) }),
      anexoCambio: () => { if (!dados.tabela) { pendentes.add('tabelaCambio'); return { t: 'p', texto: PENDENTE }; } return [{ t: 'p', texto: dados.tabela.referencia }, { t: 'tabela', colunas: dados.tabela.colunas, linhas: dados.tabela.linhas }, { t: 'p', texto: dados.tabela.regra }]; }
    };
    (modelo.blocos || []).forEach(b => {
      if (ANEXOS[b.t]) { [].concat(ANEXOS[b.t]()).forEach(x => blocos.push(x)); return; }
      blocos.push(Object.assign({}, b, { texto: preencherTexto(b.texto, dados.campos, pendentes) }));
    });
    return { blocos, pendentes: [...pendentes], texto: blocos.map(b => b.t === 'tabela' ? [b.colunas.join(' | ')].concat(b.linhas.map(l => l.join(' | '))).join('\n') : b.texto).join('\n') };
  }

  /* ---------- Desatualizado ---------- */
  /** O que, mudando na cotação, torna o contrato velho. */
  function digitalDaCotacao(q) {
    if (!q) return '';
    const R = calculoDe(q), f = W.camposDe(q);
    return JSON.stringify({ p: +(R.preco || 0).toFixed(2), r: [f.desR1, f.desR2, f.desR3].map(x => +(parseFloat(x) || 0).toFixed(2)), i: (q.items || []).map(i => [i.d, +i.q, +i.u, +i.pf || 0]), c: f.cliente, t: q.cambioProposta ? q.cambioProposta.referencia : 0, inc: f.incoterm, d: f.destino });
  }
  const contratoPadraoDaOp = (db, opId) => (db.hubContratos || []).filter(c => c && c.padrao && c.op === opId && c.status !== 'cancelado').sort((a, b) => (+b.versao || 0) - (+a.versao || 0))[0] || null;
  function contratoDesatualizado(db, contrato) {
    if (!contrato || !contrato.digital) return false;
    const o = (db.ops || []).find(x => x && x.id === contrato.op); if (!o) return false;
    const q = W.cotacaoDaOp(db, o); if (!q) return false;
    return digitalDaCotacao(q) !== contrato.digital;
  }
  function contratosDesatualizados(db) { return (db.ops || []).filter(o => o && o.id).map(o => contratoPadraoDaOp(db, o.id)).filter(c => c && contratoDesatualizado(db, c)); }

  /* ---------- Revisão em código: regras fixas ---------- */
  function revisarEmCodigo(db, contrato, dados, hoje) {
    const out = [], add = (nivel, titulo, detalhe) => out.push({ nivel, titulo, detalhe: detalhe || '', origem: 'regra' });
    const h = hoje || W.hojeISO(), c = dados.campos, q = dados.q;
    const falta = k => !String(c[k] || '').trim();
    if (!q) add('bloqueante', 'Operação sem cotação', 'O contrato precisa dos valores da cotação aprovada.');
    [['razaoSocial', 'Razão social'], ['cnpj', 'CNPJ'], ['endereco', 'Endereço'], ['cep', 'CEP'], ['representante', 'Representante'], ['cpf', 'CPF do representante']].forEach(([k, l]) => { if (falta(k)) add('bloqueante', l + ' pendente'); });
    if (!falta('cnpj') && !cnpjValido(c.cnpj)) add('bloqueante', 'CNPJ inválido', c.cnpj);
    if (!falta('cpf') && !cpfValido(c.cpf)) add('bloqueante', 'CPF inválido', c.cpf);
    ['contratadaRazao', 'contratadaCnpj', 'banco', 'conta'].forEach(k => { if (falta(k)) add('bloqueante', 'Dados da contratada pendentes: ' + k, 'Preencha em Contratos > Dados das contratadas.'); });
    (contrato && contrato.pendentes || []).forEach(k => add('bloqueante', 'Campo do modelo sem valor: ' + k, 'Saiu como [PENDENTE] no contrato.'));
    if (dados.contribuinte) {
      const ie = ieValida(c.ieNumero, dados.uf);
      if (falta('ieNumero')) add('bloqueante', 'Contribuinte sem inscrição estadual', 'Sem ela, a WindGate recalcula o preço ou rescinde.');
      else if (ie === false) add('bloqueante', 'Inscrição estadual inválida', c.ieNumero);
      else if (ie === null) add('atencao', 'Conferir a inscrição estadual', 'O dígito é conferido só para o Ceará.');
      if (falta('ieComprovanteEm')) add(dados.op.eta ? 'bloqueante' : 'atencao', 'Contribuinte sem IE comprovada', 'O comprovante é exigido 5 dias úteis antes da chegada prevista.');
    } else if (!(dados.resumo && dados.resumo.difal > 0)) add('bloqueante', 'Não contribuinte sem DIFAL calculado');
    /* Iguais à proposta e à cotação. */
    if (q) {
      const f = W.camposDe(q), R = dados.R, cot = [f.desR1, f.desR2, f.desR3].map(x => parseFloat(x) || 0);
      dados.parcelas.forEach((p, i) => { if (Math.abs((+p.valor || 0) - (cot[i] || 0)) > 0.005) add('bloqueante', `Parcela ${p.n} diferente da cotação`, `contrato ${moeda(p.valor)} × cotação ${moeda(cot[i])}`); });
      if (Math.abs(dados.parcelas.reduce((a, p) => a + (+p.valor || 0), 0) - W.precoDesem(R)) > 0.05) add('bloqueante', 'A soma das parcelas não dá o valor a receber', moeda(W.precoDesem(R)));
      const proposta = W.textoCambio(W.tabelaCambio(q));
      if (!dados.tabelaRaw) add('bloqueante', 'Sem tabela de câmbio', 'A aprovação da cotação fixa a referência.');
      else {
        if (JSON.stringify(proposta) !== JSON.stringify(dados.tabela)) add('bloqueante', 'Tabela de câmbio diferente da proposta');
        if (dados.tabelaRaw.parcelas.filter(p => !p.fixa).some(p => !(p.por010 > 0))) add('bloqueante', 'Tabela de câmbio zerada');
        if (!dados.tabelaRaw.parcelas[0].fixa || dados.tabelaRaw.tolerancia !== 0.01 || dados.tabelaRaw.repasseQueda !== 0.7) add('bloqueante', 'Tabela de câmbio fora do padrão');
      }
      if (contratoDesatualizado(db, contrato)) add('bloqueante', 'A cotação mudou depois de gerar o contrato', 'Gere de novo.');
      /* Risco financeiro que dá para medir. */
      const des = W.desemErros(q, R); des.forEach(e => add('atencao', 'Pagamento à fábrica antes do recebimento', e));
      if (dados.tabelaRaw) { const s = W.simulacaoCambio(q, dados.tabelaRaw.referencia - 0.05); const pior = s && s.cenarios.reduce((a, b) => (b.lucro < a.lucro ? b : a)); if (pior && pior.lucro < 0) add('atencao', 'Margem negativa no pior cenário do dólar', `dólar ${pior.dolar.toLocaleString('pt-BR')}: ${moeda(pior.lucro)}`); }
    }
    /* Prazo × ETA e free time. */
    const nums = String(c.prazo || '').match(/\d+/g), maior = nums ? Math.max(...nums.map(Number)) : 0, eta = dados.op.eta;
    if (!maior) add('bloqueante', 'Prazo pendente');
    else if (W.ehISO(eta)) {
      const dias = W.diasEntre(h, eta);
      if (dias > maior) add('atencao', 'Prazo incompatível com a ETA', `prazo de ${maior} dias, e a chegada prevista é em ${dias} dias.`);
      if (dados.contribuinte && falta('ieComprovanteEm') === false && W.ehISO(c.ieComprovanteEm) && W.diasEntre(c.ieComprovanteEm, eta) < 7) add('atencao', 'IE comprovada muito perto da chegada', 'O prazo é de 5 dias úteis antes da chegada prevista.');
    }
    return out;
  }
  const temBloqueante = alertas => (alertas || []).some(a => a.nivel === 'bloqueante');
  /** Quem libera é o Samir: exige revisão feita e nenhum alerta bloqueante. Não toca no texto. */
  function liberarContrato(db, contrato, por, agora) {
    if (!contrato) return { ok: false, msg: 'Contrato não encontrado.' };
    if (!contrato.revisao) return { ok: false, msg: 'Rode a revisão antes de liberar.' };
    if (temBloqueante(contrato.revisao.alertas)) return { ok: false, msg: 'Há alertas bloqueantes.' };
    if (contratoDesatualizado(db, contrato)) return { ok: false, msg: 'A cotação mudou depois de gerar o contrato. Gere de novo.' };
    Object.assign(contrato, { status: 'liberado', liberadoPor: por || '', liberadoEm: agora || new Date().toISOString() });
    return { ok: true };
  }

  return { PENDENTE, ESTRUTURAS, NIVEIS, CAMPOS_EDITAVEIS, cnpjValido, cpfValido, ieValida, estruturaDe, dadosDoContrato, preencherTexto, preencherModelo, digitalDaCotacao, contratoPadraoDaOp, contratoDesatualizado, contratosDesatualizados, revisarEmCodigo, temBloqueante, liberarContrato };
});
