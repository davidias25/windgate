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
  const CAMPOS_EDITAVEIS = [['razaoSocial', 'Razão social'], ['cnpj', 'CNPJ ou CPF'], ['endereco', 'Endereço'], ['cep', 'CEP'], ['representante', 'Representante'], ['representanteNacionalidade', 'Nacionalidade do representante'], ['representanteCargo', 'Cargo do representante'], ['cpf', 'CPF do representante'],
    ['ieNumero', 'Inscrição estadual (número)'], ['ieComprovanteEm', 'IE comprovada em'], ['incoterm', 'Incoterm'], ['porto', 'Porto de destino'], ['localEntrega', 'Cidade de entrega'], ['prazo', 'Prazo (dias)'], ['previsaoChegada', 'Previsão de chegada'], ['objeto', 'Objeto (cláusula 1.1)'], ['obsItens', 'Observação do Anexo I (ex.: bateria)']];
  /* Valor por extenso, como nas cláusulas 2.1 e 4.2. */
  const UNI = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function ate999(n) {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100, partes = [];
    if (c) partes.push(CEM[c]);
    if (r < 20) { if (r) partes.push(UNI[r]); } else { partes.push(DEZ[Math.floor(r / 10)]); if (r % 10) partes.push(UNI[r % 10]); }
    return partes.join(' e ');
  }
  function inteiroExtenso(n) {
    if (n === 0) return '';
    const mi = Math.floor(n / 1e6), mil = Math.floor((n % 1e6) / 1000), r = n % 1000, partes = [];
    if (mi) partes.push(mi === 1 ? 'um milhão' : ate999(mi) + ' milhões');
    if (mil) partes.push(mil === 1 ? 'mil' : ate999(mil) + ' mil');
    if (r) partes.push(ate999(r));
    return partes.reduce((a, p, i) => { if (!i) return p; const ult = i === partes.length - 1 && r; return a + (ult && (r < 100 || r % 100 === 0) ? ' e ' : ', ') + p; }, '');
  }
  function valorExtenso(v) {
    const cent = Math.round((+v || 0) * 100), re = Math.floor(cent / 100), ce = cent % 100, out = [];
    if (re) out.push(inteiroExtenso(re) + (re % 1000000 === 0 ? ' de reais' : re === 1 ? ' real' : ' reais'));
    if (ce) out.push(ate999(ce) + (ce === 1 ? ' centavo' : ' centavos'));
    return out.join(' e ') || 'zero real';
  }
  const ESTADOS = { AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins' };
  const taxaTxt = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
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
    /* Na J&T, o DIFAL é reembolsado junto à 3ª parcela, em linha própria: a parcela do contrato é sem ele, e a soma das três dá o preço dos equipamentos. */
    const difalNaTerceira = res && !contribuinte ? res.difal : 0, difalEmbutido = R && R.aReceber != null ? 0 : difalNaTerceira;
    const parcelas = e.parcelas || (res ? res.parcelas.map(p => ({ n: p.n, valor: p.n === 3 ? Math.round((p.valor - difalEmbutido) * 100) / 100 : p.valor })) : []);
    const lancs = (db.fin || []).filter(l => l && l.op === o.id && W.ehReceita(l));
    const dataDa = (p, i) => { const l = lancs.find(x => String(x.desc || '').startsWith((i + 1) + 'º recebimento')); return (i === 2 && o.eta) || (l && W.vencDe(l)) || (res ? res.parcelas[i].previsao : ''); };
    const campos = {
      razaoSocial: v('razaoSocial', c.empresa, o.cliente), cnpj: v('cnpj', c.cnpj), endereco: v('endereco', endereco), cep: v('cep', end.cep), representante: v('representante', c.representante, c.nome), cpf: v('cpf', c.cpfRepresentante),
      ieNumero: contribuinte ? v('ieNumero', c.ie, c.inscricaoEstadual) : 'não se aplica', ieComprovanteEm: contribuinte ? v('ieComprovanteEm', c.ieComprovanteEm) : 'não se aplica',
      incoterm: v('incoterm', f.incoterm), localEntrega: v('localEntrega', f.destino), freteNacional: e.freteNacional != null ? (e.freteNacional ? 'incluso' : 'não incluso') : (R && (R.comp || {}).terrestre > 0 ? 'incluso' : 'não incluso'),
      prazo: v('prazo', f.prazoProposta, '90 a 100'), mercadoria: v('mercadoria', f.mercadoria, o.nome), operacao: o.id, data: W.dataBR ? W.dataBR(W.hojeISO()) : W.hojeISO(), difal: res ? moeda(res.difal) : '', investimento: res ? moeda(res.investimento) : '', total: res ? moeda(res.total) : '' };
    const ct = cfg[estrutura] || {}, grupo = cfg.sf || {}, tab = q ? W.tabelaCambio(q) : null, uf = String(end.uf || f.ufDestino || '').toUpperCase();
    const itens = res ? res.itens : [], datas = parcelas.map(dataDa);
    const composicao = itens.map((i, k) => `(${['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][k] || k + 1}) ${i.q} ${i.d}, R$ ${moeda(i.total)}`).join('; ') + (res && res.desconto > 0 ? `; subtotal de R$ ${moeda(res.investimento + res.desconto)}, com **desconto comercial de R$ ${moeda(res.desconto)}**` : '');
    Object.assign(campos, { contratadaRazao: ct.razao || '', contratadaCnpj: ct.cnpj || '', contratadaEndereco: ct.endereco || '', socioNome: ct.socioNome || '', socioCpf: ct.socioCpf || '', banco: ct.banco || '', agencia: ct.agencia || '', conta: ct.conta || '', pix: ct.pix || '',
      grupoRazao: grupo.razao || '', grupoCnpj: grupo.cnpj || '', docTipo: dig(campos.cnpj).length === 11 ? 'CPF' : 'CNPJ',
      representanteNacionalidade: v('representanteNacionalidade', c.representanteNacionalidade), representanteCargo: v('representanteCargo', c.representanteCargo),
      porto: v('porto', o.destinoPorto ? 'Porto de ' + o.destinoPorto : '', f.portoDestino), previsaoChegada: v('previsaoChegada', datas[2] ? W.dataBR(datas[2]) : ''), objeto: v('objeto', itens.map(i => i.q + ' ' + i.d).join(', ')), obsItens: v('obsItens'),
      composicao, investimentoExtenso: res ? valorExtenso(res.investimento) : '', difalExtenso: res ? valorExtenso(res.difal) : '', estadoDestino: ESTADOS[uf] || '', sefazDestino: uf ? 'SEFAZ-' + uf : '', ano: W.hojeISO().slice(0, 4),
      refDolar: tab ? taxaTxt(tab.referencia) : '', refPiso: tab ? taxaTxt(tab.piso) : '', refTeto: tab ? taxaTxt(tab.teto) : '', refExAlta: tab ? taxaTxt(tab.referencia + 0.10) : '', refExQueda: tab ? taxaTxt(tab.referencia - 0.20) : '' });
    return { op: o, q, R, resumo: res, estrutura, contribuinte, uf: end.uf || W.camposDe(q || {}).ufDestino || '', campos, parcelas, datas, difalNaTerceira, difalEmbutido,
      itens: res ? res.itens.map(i => ({ d: i.d, q: i.q, unit: i.unit, total: i.total })) : [], tabela: q ? W.textoCambio(W.tabelaCambio(q)) : null, tabelaRaw: q ? W.tabelaCambio(q) : null };
  }

  /* ---------- Preenchimento ---------- */
  /** Troca {{campo}} pelo valor. Campo vazio ou desconhecido sai como [PENDENTE], nunca em branco. */
  function preencherTexto(texto, campos, pendentes) {
    return String(texto || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => { const x = campos[k]; if (x == null || String(x).trim() === '') { pendentes.add(k); return PENDENTE; } return String(x); });
  }
  /** Modelo oficial + dados = blocos prontos. Anexos saem dos dados; o texto, só do modelo. */
  function preencherModelo(modelo, dados) {
    const pendentes = new Set(), blocos = [], txt = s => preencherTexto(s, dados.campos, pendentes), rs = v => 'R$ ' + moeda(v);
    const dataTxt = i => { const d = dados.datas && dados.datas[i]; if (!d) { pendentes.add('dataParcela'); return PENDENTE; } return (i === 2 ? 'Em torno de ' : '') + W.dataBR(d); };
    const soma = dados.parcelas.reduce((a, p) => a + (+p.valor || 0), 0);
    const rotulo = (p, b) => (b.pct && soma > 0 ? `${p.n}ª – ${Math.round((+p.valor || 0) / soma * 100)}%` : `${p.n}ª parcela`);
    const cronograma = (b, marca) => dados.parcelas.map((p, i) => [rotulo(p, b), txt((b.fatos || [])[i] || ''), rs(p.valor), dataTxt(i)]);
    const ANEXOS = {
      anexoItens: b => { const res = dados.resumo || {}, linhas = dados.itens.map((i, k) => [String(k + 1), i.d, String(i.q), rs(i.unit), rs(i.total)]); if (res.desconto > 0) linhas.push(['', 'Subtotal', '', '', rs(res.investimento + res.desconto)], ['', 'Desconto comercial', '', '', '- ' + rs(res.desconto)]); linhas.push(['', b.rotuloTotal || 'TOTAL', '', '', rs(res.investimento)]); return { t: 'tabela', larguras: [7, 48, 8, 20, 17], colunas: ['Item', 'Descrição', 'Qtd.', 'Valor unitário (ref.)', 'Valor total'], linhas }; },
      anexoParcelas: () => ({ t: 'tabela', colunas: ['Parcela', 'Valor (R$)'], linhas: dados.parcelas.map(p => [p.n + 'ª', moeda(p.valor)]) }),
      cronograma: b => ({ t: 'tabela', larguras: [15, 44, 19, 22], colunas: ['Parcela', 'Fato gerador', 'Valor', 'Data prevista'], linhas: cronograma(b) }),
      anexoCronograma: b => { const linhas = cronograma(b), d = dados.difalNaTerceira || 0; if (b.difal) { const ult = dados.parcelas[2] ? +dados.parcelas[2].valor || 0 : 0; linhas.push(['DIFAL (estimativa)', 'Reembolso do DIFAL de ICMS' + (dados.uf ? ' – ' + dados.uf : '') + ', junto à 3ª parcela', rs(d), 'Junto à 3ª parcela'], ['', 'TOTAL PREVISTO (equipamentos + DIFAL estimado)', rs(soma + d), ''], ['', 'Valor previsto da 3ª parcela com DIFAL', rs(ult + d), '']); } return { t: 'tabela', larguras: [20, 44, 18, 18], colunas: ['Parcela', 'Fato gerador', 'Valor', 'Data prevista*'], linhas }; },
      anexoCambio: () => { if (!dados.tabela) { pendentes.add('tabelaCambio'); return { t: 'p', texto: PENDENTE }; } return { t: 'tabela', colunas: dados.tabela.colunas, linhas: dados.tabela.linhas }; },
      anexoBanco: () => ({ t: 'tabela', semCabecalho: true, larguras: [31, 69], colunas: [], linhas: [['Favorecido', txt('{{contratadaRazao}}')], ['CNPJ', txt('{{contratadaCnpj}}')], ['Banco', txt('{{banco}}')], ['Agência / Conta corrente', txt('{{agencia}}') + ' / ' + txt('{{conta}}')], ['PIX (chave CNPJ)', txt('{{pix}}')]] }),
      assinaturas: b => ({ t: 'tabela', semCabecalho: true, colunas: [], linhas: b.linhas.map(l => l.map(txt)) })
    };
    (modelo.blocos || []).forEach(b => {
      if (b.seCampo && !String(dados.campos[b.seCampo] || '').trim()) return;
      if (ANEXOS[b.t]) { [].concat(ANEXOS[b.t](b)).forEach(x => blocos.push(x)); return; }
      if (b.t === 'quebra') { blocos.push({ t: 'quebra' }); return; }
      blocos.push(Object.assign({}, b, { texto: txt(b.texto) }));
    });
    return { blocos, pendentes: [...pendentes], texto: blocos.filter(b => b.t !== 'quebra').map(b => b.t === 'tabela' ? [(b.colunas || []).join(' | ')].concat(b.linhas.map(l => l.join(' | '))).join('\n') : b.texto).join('\n') };
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
    [['razaoSocial', 'Razão social'], ['cnpj', 'CNPJ ou CPF'], ['endereco', 'Endereço'], ['cep', 'CEP'], ['representante', 'Representante'], ['cpf', 'CPF do representante']].forEach(([k, l]) => { if (falta(k)) add('bloqueante', l + ' pendente'); });
    if (!falta('cnpj') && !(dig(c.cnpj).length === 11 ? cpfValido(c.cnpj) : cnpjValido(c.cnpj))) add('bloqueante', 'CNPJ ou CPF inválido', c.cnpj);
    if (contrato && contrato.freteBase != null && (c.freteNacional === 'incluso') !== contrato.freteBase) add('bloqueante', `Frete nacional ${c.freteNacional}, e o modelo de ${ESTRUTURAS[dados.estrutura].nome} é ${contrato.freteBase ? 'com o frete incluso' : 'sem o frete'}`, 'As cláusulas 2.3, 2.4 e 7 do modelo oficial não valem para esta combinação: o texto precisa de revisão jurídica. Confira também se a cotação cobre o custo.');
    if (!falta('cpf') && !cpfValido(c.cpf)) add('bloqueante', 'CPF inválido', c.cpf);
    ['contratadaRazao', 'contratadaCnpj', 'contratadaEndereco', 'socioNome', 'socioCpf', 'banco', 'agencia', 'conta', 'pix'].forEach(k => { if (falta(k)) add('bloqueante', 'Dados da contratada pendentes: ' + k, 'Preencha em Contratos > Dados das contratadas.'); });
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
      const f = W.camposDe(q), R = dados.R, cot = [f.desR1, f.desR2, f.desR3].map(x => parseFloat(x) || 0); cot[2] -= dados.difalEmbutido || 0;
      dados.parcelas.forEach((p, i) => { if (Math.abs((+p.valor || 0) - (cot[i] || 0)) > 0.005) add('bloqueante', `Parcela ${p.n} diferente da cotação`, `contrato ${moeda(p.valor)} × cotação ${moeda(cot[i])}`); });
      if (Math.abs(dados.parcelas.reduce((a, p) => a + (+p.valor || 0), 0) + (dados.difalEmbutido || 0) - W.precoDesem(R)) > 0.05) add('bloqueante', 'A soma das parcelas não dá o valor a receber', moeda(W.precoDesem(R)));
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

  return { valorExtenso, PENDENTE, ESTRUTURAS, NIVEIS, CAMPOS_EDITAVEIS, cnpjValido, cpfValido, ieValida, estruturaDe, dadosDoContrato, preencherTexto, preencherModelo, digitalDaCotacao, contratoPadraoDaOp, contratoDesatualizado, contratosDesatualizados, revisarEmCodigo, temBloqueante, liberarContrato };
});
