/**
 * DOM mínimo para rodar o código de tela do index.html dentro do Node.
 *
 * A alternativa seria testar uma reimplementação das regras do financeiro, o
 * que não prova nada: o bug do status compartilhado estava justamente no
 * `renderFin` de verdade. Aqui o teste chama a MESMA função que o navegador
 * chama, com um DOM de mentira que só guarda o que foi escrito nele — dá para
 * ler o HTML gerado e conferir linha por linha o que apareceu na tela.
 *
 * Elementos são criados sob demanda: qualquer `getElementById` devolve um nó,
 * e o teste só precisa preencher os poucos que fazem papel de filtro.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function criarElemento(id){
  const el = {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    checked: false,
    disabled: false,
    style: { setProperty(){}, removeProperty(){} },
    dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(){}, insertAdjacentHTML(){}, remove(){}, focus(){}, click(){},
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
    get firstChild(){ return null; },
    get children(){ return []; }
  };
  return el;
}

function criarDocumento(){
  const nos = new Map();
  return {
    getElementById(id){
      if (!nos.has(id)) nos.set(id, criarElemento(id));
      return nos.get(id);
    },
    createElement(tag){ return criarElemento('<' + tag + '>'); },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    addEventListener(){},
    body: criarElemento('body'),
    head: criarElemento('head'),
    documentElement: criarElemento('html'),
    _nos: nos
  };
}

/* Os blocos <script> do index.html, menos o jsPDF embutido — que é enorme,
   não tem nada a ver com o financeiro e só faria o teste demorar. */
function blocosDeScript(html){
  const blocos = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const corpo = m[1];
    // Só a biblioteca embutida sai — reconhecida pelo cabeçalho dela, não por
    // conter a palavra "jsPDF": os blocos do sistema também a citam, e filtrar
    // por isso descartaria metade do código de tela sem avisar.
    if (/^\s*\/\* jsPDF [\d.]+ embutido \*\//.test(corpo)) continue;
    blocos.push(corpo);
  }
  return blocos;
}

/**
 * Carrega o index.html num contexto isolado e devolve o objeto global dele —
 * com `DB`, `USER`, `renderFin`, `saveLanc` e o resto do sistema já definidos.
 */
function carregarApp(){
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const document = criarDocumento();

  const ctx = {
    document,
    console,
    // A sincronização periódica manteria o processo vivo para sempre e
    // tentaria falar com o servidor no meio do teste.
    setInterval(){ return 0; },
    clearInterval(){},
    setTimeout(fn){ return 0; },   // o saveDB adia a gravação; aqui não há para onde gravar
    clearTimeout(){},
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
    indexedDB: undefined,
    crypto: require('crypto').webcrypto,
    location: { href: 'http://localhost/', origin: 'http://localhost', hostname: 'localhost', protocol: 'http:' },
    navigator: { userAgent: 'node', clipboard: { writeText: async () => {} } },
    alert(){}, confirm(){ return true; }, prompt(){ return null; },
    Blob: function(){}, URL: { createObjectURL(){ return ''; }, revokeObjectURL(){} },
    FormData: function(){},
    XMLHttpRequest: function(){},
    performance: { now: () => Date.now() },
    requestAnimationFrame(fn){ return 0; },
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
    matchMedia(){ return { matches: false, addListener(){}, addEventListener(){} }; }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);

  blocosDeScript(html).forEach((codigo, i) => {
    try {
      vm.runInContext(codigo, ctx, { filename: `index.html#script${i}` });
    } catch (e) {
      throw new Error(`Bloco <script> ${i} do index.html não executou: ${e.message}`);
    }
  });

  // `DB`, `finOcorrencias` e companhia são declarados com `let`/`const` no topo
  // dos blocos: isso cria ligação léxica do contexto, não propriedade dele — só
  // as `function` viram propriedade. Do lado do teste a diferença não interessa,
  // então o proxy procura primeiro na propriedade e depois no escopo léxico, e
  // `app.finOcorrencias(...)` funciona igual a `app.renderFin(...)`.
  ctx.avaliar = codigo => vm.runInContext(codigo, ctx, { filename: 'teste' });

  return new Proxy(ctx, {
    get(alvo, prop){
      if (prop in alvo) return alvo[prop];
      if (typeof prop !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(prop)) return undefined;
      try { return vm.runInContext(prop, ctx, { filename: 'teste' }); }
      catch (e) { return undefined; }
    },
    has(alvo, prop){ return true; }
  });
}

module.exports = { carregarApp, criarDocumento };
