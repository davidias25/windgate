/**
 * Equipe & Acessos, Configurações e Ponto do Hub 2.0: edição de usuário sem
 * perder campo do sistema atual, permissões, novo usuário, importação de
 * backup só de acréscimo, prazos por etapa e a lógica do botão de ponto.
 */
process.env.SUPABASE_DISABLED = '1';
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/equipe-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const clone = o => JSON.parse(JSON.stringify(o));

(async () => {
  /* Registro exatamente como o sistema atual grava (defaultDB + migrações + opStatus da aba Painel). */
  const legado = () => ({
    users: {
      samir: { nome: 'Samir Fernandes', papel: 'Fundador · Direção Geral', pin: '2012', cor: '#E91E63', fin: true, aprova: true, config: true,
        tabs: ['painel', 'mapa', 'cotacoes', 'crm', 'parceiros', 'checklist', 'frete', 'sourcing', 'agenda', 'gestao', 'fin', 'org', 'config'], opStatus: ['embarcado', 'chegada'] },
      davi: { nome: 'Davi', papel: 'Líder Operacional · Pricing & NF', pin: '2020', cor: '#2563EB', fin: true, aprova: false, config: false,
        tabs: ['painel', 'mapa', 'cotacoes', 'crm', 'parceiros', 'checklist', 'frete', 'sourcing', 'agenda', 'gestao', 'fin', 'org'], opStatus: ['producao'], campoFuturo: { x: 1 } },
      ivina: { nome: 'Ívina', papel: 'Comunicação · Docs & Atendimento', pin: '2026', cor: '#E91E63', fin: false, aprova: false, config: false,
        tabs: ['painel', 'mapa', 'crm', 'parceiros', 'checklist', 'frete', 'sourcing', 'agenda', 'gestao', 'org', 'abaDoFuturo'] },
      matheus: { nome: 'Matheus', papel: 'Estagiário · Frete & Tracking', pin: '2025', cor: '#34C77C', fin: false, aprova: false, config: false,
        tabs: ['painel', 'mapa', 'crm', 'parceiros', 'frete', 'checklist', 'agenda', 'gestao'] },
      oneide: { nome: 'Oneide', papel: 'RH', pin: '1111', cor: '#5B6B8C', perfilHub: 'rh', tabs: ['org'] }
    },
    ops: [{ _id: 'o1', id: 'OP10', status: 'logistica' }],
    settings: { schema: 15, prazosStatus: { producao: 40 } },
    _removidos: { apagado1: 1 }
  });

  console.log('\nRound-trip: usuário editado pelo Hub mantém tudo que o sistema atual gravou:');
  const db = legado();
  const antes = clone(db.users.davi);
  const ref = db.users.davi;
  const r = W.editarUsuario(db.users.davi, { nome: 'Davi Dias', pin: '4321', perfilHub: 'operacoes', tabs: antes.tabs.filter(t => t !== 'sourcing'), fin: true }, { editor: 'samir', chave: 'davi' });
  ok(r.ok && db.users.davi === ref, 'edição no próprio registro (mesmo objeto, sem trocar por cópia)');
  const depois = db.users.davi;
  ok(Object.keys(antes).every(k => k in depois), 'nenhum campo do registro original sumiu');
  ok(JSON.stringify(depois.opStatus) === JSON.stringify(antes.opStatus) && depois.campoFuturo.x === 1, 'campos que o Hub não conhece (opStatus, campoFuturo) intactos');
  ok(depois.nome === 'Davi Dias' && depois.pin === '4321' && depois.perfilHub === 'operacoes' && !depois.tabs.includes('sourcing'), 'mudanças pedidas aplicadas');
  ok(depois.papel === antes.papel && depois.cor === antes.cor && depois.aprova === false && depois.config === false && depois.fin === true, 'o que não foi pedido continua igual');
  ok(typeof depois.pin === 'string' && Array.isArray(depois.tabs) && typeof depois.fin === 'boolean', 'mesmos tipos do sistema atual (pin texto, tabs lista, fin booleano)');
  ok(r.mudou.sort().join(',') === 'nome,perfilHub,pin,tabs', 'lista do que mudou: ' + r.mudou.join(','));
  // O que o Hub envia ao servidor (gravação parcial) leva o registro inteiro do usuário, e a mesclagem do servidor o recebe sem perder nada.
  const base = W.fotografarConteudo(legado());
  const { corpo } = W.diferencas(db, base);
  ok(corpo.users && Object.keys(corpo.users).join() === 'davi' && corpo.users.davi.opStatus.length === 1, 'gravação parcial manda só o usuário editado, com todos os campos');
  const { mesclarDB } = require('../src/services/db-merge.service');
  const srv = mesclarDB(legado(), corpo);
  ok(srv.users.davi.campoFuturo.x === 1 && srv.users.davi.pin === '4321' && srv.users.samir.pin === '2012' && srv.settings.prazosStatus.producao === 40, 'servidor mescla: Davi atualizado, Samir e settings intactos');

  console.log('\nPIN e perfil:');
  const u2 = clone(legado().users.ivina);
  ok(W.editarUsuario(u2, { pin: '' }, { editor: 'samir', chave: 'ivina' }).mudou.length === 0 && u2.pin === '2026', 'PIN vazio mantém o atual');
  ok(!W.editarUsuario(u2, { pin: '12a4' }, { editor: 'samir', chave: 'ivina' }).ok && !W.editarUsuario(u2, { pin: '123' }, { editor: 'samir', chave: 'ivina' }).ok && u2.pin === '2026', 'PIN inválido recusado sem mexer no registro');
  W.editarUsuario(u2, { perfilHub: '' }, { editor: 'samir', chave: 'ivina' });
  ok(!('perfilHub' in u2), 'perfil "automático" não cria campo que não existia');
  const o2 = clone(legado().users.oneide);
  W.editarUsuario(o2, { perfilHub: '' }, { editor: 'samir', chave: 'oneide' });
  ok(o2.perfilHub === '' && W.perfilDe({ users: { oneide: o2 } }, 'oneide').id === 'rh', 'perfil "automático" em quem tinha perfil: campo fica vazio e cai no padrão');
  ok(!W.editarUsuario(clone(legado().users.samir), { perfilHub: 'contador' }, { editor: 'samir', chave: 'samir' }).ok, 'ninguém troca o próprio perfil para um restrito (perderia o acesso)');
  ok(!W.editarUsuario(clone(legado().users.davi), { perfilHub: 'xpto' }, { editor: 'samir', chave: 'davi' }).ok, 'perfil desconhecido recusado');

  console.log('\nFinanceiro, aprovação e Configurações:');
  const m = clone(legado().users.matheus);
  W.editarUsuario(m, { fin: true }, { editor: 'samir', chave: 'matheus' });
  ok(m.fin === true && m.tabs.includes('fin'), 'liga Financeiro e a aba vem junto (igual ao sistema atual)');
  W.editarUsuario(m, { fin: false }, { editor: 'samir', chave: 'matheus' });
  ok(m.fin === false && !m.tabs.includes('fin'), 'desliga Financeiro e a aba sai');
  const s = clone(legado().users.samir);
  W.editarUsuario(s, { fin: false }, { editor: 'samir', chave: 'samir' });
  ok(s.fin === true && s.tabs.includes('fin'), 'Samir não perde o Financeiro');
  ok(!W.editarUsuario(s, { config: false }, { editor: 'samir', chave: 'samir' }).ok, 'acesso do Samir às Configurações não sai');
  const d3 = clone(legado().users.davi);
  ok(!W.editarUsuario(d3, { aprova: true }, { editor: 'davi', chave: 'davi' }).ok && d3.aprova === false, 'só o Samir concede aprovação de margem');
  ok(W.editarUsuario(d3, { aprova: false, config: false, nome: 'Davi' }, { editor: 'davi', chave: 'davi' }).ok, 'quem não é o Samir edita o resto se não mexer nas concessões');
  ok(W.editarUsuario(d3, { config: true }, { editor: 'samir', chave: 'davi' }).ok && d3.config === true, 'Samir concede Configurações');
  const i3 = clone(legado().users.ivina);
  W.editarUsuario(i3, { tabs: ['painel', 'org'] }, { editor: 'samir', chave: 'ivina' });
  ok(i3.tabs.join() === 'painel,org,abaDoFuturo', 'aba que o Hub não conhece fica na lista');

  console.log('\nQuem abre o quê:');
  const dbp = legado();
  ok(W.podeGerirEquipe(dbp, 'samir') && !W.podeGerirEquipe(dbp, 'davi') && !W.podeGerirEquipe(dbp, 'ninguem'), 'Configurações: config ou Samir');
  dbp.users.samir.config = false;
  ok(W.podeGerirEquipe(dbp, 'samir'), 'Samir abre Configurações mesmo sem a marca (regra do menu)');
  ok(W.podeVerEquipe(dbp, 'ivina') && !W.podeVerEquipe(dbp, 'matheus') && W.podeVerEquipe(dbp, 'oneide'), 'Estrutura da equipe: quem tem a aba Equipe');
  dbp.users.matheus.config = true;
  ok(W.podeVerEquipe(dbp, 'matheus'), 'quem administra acessos abre Equipe mesmo sem a aba');
  ok(W.podeRelatorioPonto(dbp, 'oneide', false) && W.podeRelatorioPonto(dbp, 'samir', true) && !W.podeRelatorioPonto(dbp, 'davi', false), 'relatório do ponto: diretoria (servidor) ou RH — mesma regra das rotas');
  ok(W.podeAjustarPrazos(dbp, 'davi') && !W.podeAjustarPrazos(dbp, 'ivina'), 'prazos por etapa: quem tem Financeiro (podeAjustarStatus do sistema atual)');

  console.log('\nNova pessoa:');
  ok(W.chaveDeNome('Ândrea Souza') === 'andrea', 'identificador do nome: sem acento, primeiro nome');
  const n1 = W.novoUsuario(legado(), { nome: 'Ândrea Souza', papel: 'Comercial', pin: '9090', fin: false, tabs: ['painel', 'crm', 'fin'] });
  ok(n1.ok && n1.chave === 'andrea' && n1.usuario.pin === '9090' && !n1.usuario.tabs.includes('fin') && n1.usuario.config === false && n1.usuario.aprova === false && !('perfilHub' in n1.usuario), 'nasce no formato do sistema atual, sem concessões');
  ok(!W.novoUsuario(legado(), { nome: 'Davi', pin: '1234' }).ok, 'identificador repetido recusado');
  ok(!W.novoUsuario(legado(), { nome: 'Zé', pin: '12' }).ok, 'PIN curto recusado');

  console.log('\nBackup: importação só acrescenta:');
  const atual = legado();
  atual.ops.push({ _id: 'o2', id: 'OP11', status: 'producao', obs: 'versão atual' });
  const bk = { users: { samir: { nome: 'Samir velho', pin: '0000' }, novo: { nome: 'Novo', pin: '5555', tabs: ['painel'] } },
    ops: [{ _id: 'o2', id: 'OP11', status: 'cotacao', obs: 'versão velha' }, { _id: 'o3', id: 'OP12', status: 'cotacao' }, { _id: 'apagado1', id: 'OP99' }, { id: 'OP13', status: 'cotacao' }],
    settings: { schema: 1 }, coisaSolta: 1 };
  const prev = W.importarBackup(atual, bk, false);
  ok(prev.total === 3 && prev.colecoes.ops === 2 && prev.objetos.users === 1 && prev.excluidos === 1 && prev.jaExistiam === 2, 'prévia conta: 2 operações novas, 1 usuário novo, 1 excluída de propósito, 2 já existentes');
  ok(atual.ops.length === 2 && !atual.users.novo, 'prévia não altera nada');
  ok(prev.ignorados.includes('settings') && prev.ignorados.includes('coisaSolta'), 'settings e campos soltos ficam fora');
  W.importarBackup(atual, bk, true);
  ok(atual.ops.length === 4 && atual.ops.find(o => o._id === 'o2').obs === 'versão atual' && !atual.ops.some(o => o._id === 'apagado1'), 'acrescenta o que falta; registro existente não é sobrescrito; excluído não volta');
  ok(atual.users.samir.pin === '2012' && atual.users.novo.pin === '5555' && atual.settings.schema === 15, 'usuário existente intacto, novo entra; settings intacto');
  ok(atual.ops.find(o => o.id === 'OP13')._id === W.idDeterministico({ id: 'OP13', status: 'cotacao' }), 'registro sem _id ganha o mesmo id determinístico do servidor');
  ok(W.importarBackup(atual, bk, false).total === 0, 'importar de novo não duplica nada');
  ok(W.importarBackup(atual, [1, 2], false).erro && W.importarBackup(atual, { a: 1 }, false).erro, 'arquivo que não é backup recusado');
  ok(W.nomeBackup('2026-10-29') === 'windgate_backup_2026-10-29.json' && JSON.parse(W.textoBackup(atual)).users.samir.pin === '2012', 'exportação no mesmo formato e nome do sistema atual');

  console.log('\nPrazos por etapa:');
  const pz = W.normalizarPrazos({ producao: '35', embarcado: '', chegada: 'abc', cotacao: '-3', logistica: '4.6' }, '');
  ok(pz.prazosStatus.producao === 35 && pz.prazosStatus.embarcado === 0 && pz.prazosStatus.chegada === 0 && pz.prazosStatus.cotacao === 0 && pz.prazosStatus.logistica === 5, 'mesma conversão do sistema atual (vazio/lixo = sem prazo, arredonda)');
  ok(pz.repeteAtrasoDias === 3 && W.normalizarPrazos({}, '0').repeteAtrasoDias === 3 && W.normalizarPrazos({}, '7').repeteAtrasoDias === 7, 'recobrança: mínimo 1, padrão 3');
  ok(W.prazoAlvo({ settings: { prazosStatus: pz.prazosStatus } }, 'producao') === 35 && W.prazoAlvo({ settings: { prazosStatus: pz.prazosStatus } }, 'embarcado') === null, 'Torre do Hub lê o que foi salvo');

  console.log('\nPonto:');
  ok(W.proximoPonto(null).k === 'entrada' && W.proximoPonto('entrada').k === 'almoco' && W.proximoPonto('almoco').k === 'volta' && W.proximoPonto('volta').k === 'saida' && W.proximoPonto('saida').k === 'entrada', 'sequência do dia: entrada → almoço → volta → saída → entrada');
  ok(W.proximoPonto('ajuste').k === 'entrada' && W.proximoPonto('outro').k === 'entrada' && W.proximoPonto('xyz').k === 'entrada', 'avulso, ajuste e desconhecido voltam para entrada');
  ok(W.alertaPonto({ semLocalizacao: true }) === 'sem localização' && W.alertaPonto({ dentroDoRaio: false }) === 'fora do local' && W.alertaPonto({ dentroDoRaio: true }) === '' && W.alertaPonto({ dentroDoRaio: null }) === '', 'alerta: sem localização ou fora do local');
  ok(W.periodoPonto('2026-10-29').de === '2026-10-01' && W.periodoPonto('2026-10-29').ate === '2026-10-29', 'período padrão: mês corrente até hoje');
  ok(W.horasBR(7.5) === '7,50h' && W.horasBR(null) === '0,00h', 'horas no formato do relatório');
  ok(!W.validarCerca({ lat: '', lon: '-38' }).ok && !W.validarCerca({ lat: '95', lon: '-38' }).ok && !W.validarCerca({ lat: '-3.7', lon: '-38.4', raio: '5' }).ok, 'escritório: sem coordenada, fora do mundo ou raio < 10 recusados');
  const vc = W.validarCerca({ lat: '-3.768320', lon: '-38.486016', raio: '', rotulo: ' Escritório Fortaleza ' });
  ok(vc.ok && vc.corpo.lat === -3.76832 && vc.corpo.raio === 150 && vc.corpo.rotulo === 'Escritório Fortaleza', 'escritório válido vai como número, raio padrão 150 m');
  ok(W.temCerca({ lat: -3.7, lon: -38.4 }) && !W.temCerca({ lat: null, lon: null }) && !W.temCerca({}), 'cerca cadastrada só com lat e lon numéricas (igual ao servidor)');

  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
