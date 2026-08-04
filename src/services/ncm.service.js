/**
 * Serviço de Integração NCM Siscomex Classif API
 * Fonte Oficial: https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json
 */

let ncmCache = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

// Tabela de alíquotas por NCM e Capítulo (TEC / TIPI padrão importação)
const NCM_SPECIFIC = {
  '73089090': { ii: 10.8, ipi: 0, pis: 2.1, cofins: 9.65 },
  '84743100': { ii: 20.0, ipi: 0, pis: 2.1, cofins: 9.65 },
  '84262000': { ii: 20.0, ipi: 0, pis: 2.1, cofins: 9.65 },
  '84279000': { ii: 12.6, ipi: 0, pis: 2.1, cofins: 9.65 },
  '84271019': { ii: 12.6, ipi: 0, pis: 2.1, cofins: 9.65 },
  '84294000': { ii: 12.6, ipi: 0, pis: 2.1, cofins: 9.65 },
  '84295190': { ii: 12.6, ipi: 0, pis: 2.1, cofins: 9.65 },
  '84295900': { ii: 12.6, ipi: 0, pis: 2.1, cofins: 9.65 },
  '85076000': { ii: 14.0, ipi: 3.25, pis: 2.1, cofins: 9.65 },
  '39269090': { ii: 11.2, ipi: 3.25, pis: 2.1, cofins: 9.65 },
  '82055990': { ii: 14.0, ipi: 5.0, pis: 2.1, cofins: 9.65 },
  '95030099': { ii: 18.0, ipi: 6.5, pis: 2.1, cofins: 9.65 }
};

const ALIQUOTAS_PADRAO = {
  '72': { ii: 10.8, ipi: 0, pis: 2.1, cofins: 9.65 },
  '73': { ii: 10.8, ipi: 0, pis: 2.1, cofins: 9.65 },
  '84': { ii: 12.6, ipi: 3.25, pis: 2.1, cofins: 9.65 },
  '85': { ii: 14.0, ipi: 5.0, pis: 2.1, cofins: 9.65 },
  '39': { ii: 11.2, ipi: 3.25, pis: 2.1, cofins: 9.65 },
  '40': { ii: 12.6, ipi: 5.0, pis: 2.1, cofins: 9.65 },
  '82': { ii: 14.0, ipi: 5.0, pis: 2.1, cofins: 9.65 },
  '90': { ii: 12.6, ipi: 3.25, pis: 2.1, cofins: 9.65 },
  '95': { ii: 18.0, ipi: 6.5, pis: 2.1, cofins: 9.65 },
  '68': { ii: 10.8, ipi: 3.25, pis: 2.1, cofins: 9.65 },
  '69': { ii: 12.6, ipi: 5.0, pis: 2.1, cofins: 9.65 },
  '70': { ii: 10.8, ipi: 3.25, pis: 2.1, cofins: 9.65 },
  '_default': { ii: 10.8, ipi: 3.25, pis: 2.1, cofins: 9.65 }
};

/**
 * Carrega a tabela oficial de NCM do Siscomex Classif
 */
async function carregarTabelaNCM() {
  if (ncmCache && (Date.now() - lastFetchTime < CACHE_TTL_MS)) {
    return ncmCache;
  }

  try {
    const res = await fetch('https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    if (data && data.Nomenclaturas) {
      ncmCache = data.Nomenclaturas;
      lastFetchTime = Date.now();
      console.log(`✅ Tabela NCM Siscomex carregada com sucesso: ${ncmCache.length} itens.`);
      return ncmCache;
    }
  } catch (e) {
    console.warn('⚠️ Não foi possível atualizar a tabela NCM do Siscomex online. Usando fallback interno.', e.message);
  }

  return ncmCache || [];
}

/**
 * Busca detalhes de um NCM específico pelo código (com ou sem pontos)
 */
async function buscarNCM(codigoRaw) {
  if (!codigoRaw) return null;
  const cleanCode = String(codigoRaw).replace(/\D/g, '');
  const nomenclaturas = await carregarTabelaNCM();

  // Encontra item na tabela Siscomex
  const itemFound = nomenclaturas.find(n => n.Codigo.replace(/\D/g, '') === cleanCode);
  
  const cap = cleanCode.slice(0, 2);
  const aliquotas = NCM_SPECIFIC[cleanCode] || ALIQUOTAS_PADRAO[cap] || ALIQUOTAS_PADRAO['_default'];

  if (itemFound) {
    return {
      codigo: itemFound.Codigo,
      cleanCodigo: cleanCode,
      descricao: itemFound.Descricao,
      dataInicio: itemFound.Data_Inicio,
      dataFim: itemFound.Data_Fim,
      ato: itemFound.Tipo_Ato_Ini ? `${itemFound.Tipo_Ato_Ini} ${itemFound.Numero_Ato_Ini}/${itemFound.Ano_Ato_Ini}` : '',
      ii: aliquotas.ii,
      ipi: aliquotas.ipi,
      pis: aliquotas.pis,
      cofins: aliquotas.cofins,
      // A API do Siscomex Classif publica só a nomenclatura. A descrição é
      // oficial; as alíquotas vêm da tabela interna deste serviço e podem não
      // corresponder à NCM — chamá-las de oficiais induzia a erro.
      fonte: 'Descrição: Siscomex Classif (oficial) · Alíquotas: tabela interna',
      aliquotasEstimadas: !NCM_SPECIFIC[cleanCode]
    };
  }

  // Se não encontrou código de 8 dígitos exato, retorna dados padrão calculados pela regra TEC
  return {
    codigo: cleanCode.length === 8 ? `${cleanCode.slice(0, 4)}.${cleanCode.slice(4, 6)}.${cleanCode.slice(6, 8)}` : cleanCode,
    cleanCodigo: cleanCode,
    descricao: `Classificação Fiscal NCM ${cleanCode}`,
    ii: aliquotas.ii,
    ipi: aliquotas.ipi,
    pis: aliquotas.pis,
    cofins: aliquotas.cofins,
    fonte: 'Alíquotas estimadas por capítulo — conferir no Simulador Siscomex',
    aliquotasEstimadas: true
  };
}

/**
 * Pesquisa NCMs por termo ou fragmento de código
 */
async function pesquisarNCMs(termo, limit = 20) {
  if (!termo || termo.trim().length < 2) return [];
  const query = termo.toLowerCase().trim();
  const nomenclaturas = await carregarTabelaNCM();
  const cleanQuery = query.replace(/\D/g, '');

  const matches = nomenclaturas.filter(n => {
    const cClean = n.Codigo.replace(/\D/g, '');
    const dLower = n.Descricao.toLowerCase();
    return (cleanQuery && cClean.startsWith(cleanQuery)) || dLower.includes(query);
  });

  return matches.slice(0, limit).map(n => {
    const cleanCode = n.Codigo.replace(/\D/g, '');
    const cap = cleanCode.slice(0, 2);
    const aliquotas = ALIQUOTAS_PADRAO[cap] || ALIQUOTAS_PADRAO['_default'];
    return {
      codigo: n.Codigo,
      descricao: n.Descricao,
      ii: aliquotas.ii,
      ipi: aliquotas.ipi,
      pis: aliquotas.pis,
      cofins: aliquotas.cofins
    };
  });
}

module.exports = {
  carregarTabelaNCM,
  buscarNCM,
  pesquisarNCMs
};
