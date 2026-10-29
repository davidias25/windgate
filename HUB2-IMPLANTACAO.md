# WindGate Hub 2.0 — como colocar no ar sem perder nenhum dado

Ramo: `hub-2.0`. Nada aqui altera a estrutura dos dados: o banco continua o mesmo
(`sistema/db.enc`, esquema 15). O que muda é a segurança das gravações e a aparência.

## O que entrou

| Fase | O que faz |
|---|---|
| 0 · Histórico | Toda gravação deixa uma fotografia cifrada em `sistema/historico/`: a última versão de cada hora (24 posições) e uma por dia (sem apagar). Exclusões geram uma fotografia **antes** de serem aplicadas. |
| 0 · Trava | Se a nuvem não respondeu no boot, o servidor recusa (503) a cópia de um navegador em vez de deixá-la virar o banco. |
| 0 · Conferência | `npm run conferir:migracao -- antes.json depois.json` lista qualquer registro que sumiu. |
| 1 · Layout | Tema claro com as cores da logo, menu lateral por área, logo nova no sistema atual. Funções de dados, cálculos e PDFs intocados. |
| 2 · Hub 2.0 (`/hub`) | Sistema NOVO, no padrão GTM das tradings, lendo e gravando o MESMO banco: Torre de Controle (indicadores, funil por etapa com atraso, grade de operações, alertas), Operações + histórico, Ficha da operação (etapas com linha do tempo, logística e contêineres, documentos/checklist, financeiro da operação), Mapa & Tracking, Documentos por operação, Financeiro (painel do mês, DRE gerencial, fluxo 8 semanas, contas a pagar/receber com autorização do Samir, lançamentos, resultado por operação). Sem ClickUp. |
| 3 · Torre por função | Cada pessoa entra na sua Torre: **Samir** (Diretoria: aprovações, caixa, desempenho da equipe e meta do mês), **Davi** (Diretor de Operações · Financeiro: documentos para revisar, pagamentos da semana, caixa, equipe), **Matheus** (Frete, Tracking & Lançamentos: pendências de frete, trânsito, a lançar/conferir; sem DRE, margem nem exclusão), **Ívina** (Documentação & Atendimento: documentos a coletar, clientes a atualizar com mensagem pronta; nenhum acesso financeiro). Cada um personaliza os painéis e a ordem; a diretoria monta a torre de qualquer um; recados fixados por pessoa ou para todos. Perfil trocável por pessoa no campo `perfilHub` do usuário. Novos dados: `hubRecados` (lista, unida por `_id`) e `hubPainel` (por pessoa). |
| 4 · Comercial e gestão | **CRM & Funil** novo (fases Lead → Qualificação → Estudo/Cotação → Proposta → Negociação → Ganho/Perdido, arrastar e soltar, follow-up automático por fase, negócio parado na Torre, score do lead, previsão ponderada, conversão, ciclo, perdas por motivo, cliente 360; ganho vira operação com checklist e recebimentos previstos). Usa os mesmos `crm`/`crmOps` do sistema atual (campo `etapa` mantido em sincronia). **Entrada de pedidos** (texto ou print → IA ou regras → cotação direta x estudo → negócio + tarefas por pessoa; `hubPedidos`). **Documentos (GED)**: tipo, versão, dupla conferência, rejeição com motivo, envio de arquivo, completude por etapa, checklist marcado sozinho. **Desembolso & Cobrança** com a regra de proteção. **Produtividade & Ranking** (0–100: prazo, qualidade, função, evolução, cultura; `hubErros`). Câmbio, Portal do Cliente e Tracking ao vivo aparecem no menu com o que falta para ligar (a NF-e ganhou emissão de verdade: ver a seção abaixo). Rota nova `/api/ia/pedido` (usa `ANTHROPIC_API_KEY`; sem ela, cai na leitura por regras). Módulos ainda não refeitos (Cotações, CRM, Sourcing, Fretes, Agenda, Gestão do Mês, Ponto, Equipe, Config) abrem no sistema atual pelo próprio menu. |

Testes: `npm test` → 1.154 verificações (19 em `test/historico.test.js`, 111 em `test/nfe.test.js` com a Focus simulada, 21 em `test/cotacoes.test.js`, 124 em `test/hub2.test.js`: CRM, pedidos, GED, desembolso, produtividade, leitura por IA simulada, perfis e permissões, ida e volta sem perda, gravação concorrente com o sistema atual, exclusão, gravação parcial que não reverte o que outra pessoa mudou, contas do financeiro conferidas à mão).

## Hub 2.0 como sistema principal

`/` abre o Hub 2.0. O sistema anterior continua inteiro em **`/antigo`**, lendo e gravando o mesmo banco, como reserva. Link antigo com `/?aba=<aba>` cai na tela equivalente do Hub.

As 7 telas que ainda abriam no sistema anterior foram refeitas no Hub, com os mesmos dados e o mesmo formato (nada renomeado, nada apagado):

| Tela | Como ficou |
|---|---|
| Cotações & Propostas | Motor de cálculo sem tela (`cotacao-regras.js`) conferido contra o `calc()` original em 400 cotações (centavo a centavo, direta e triangular). O motor triangular e o gerador da proposta em PDF são cópia fiel do index.html, gerada por `npm run gerar:cotacao-hub`; o teste acusa se divergirem. O PDF sai traço a traço igual. "Excluir" virou **Arquivar**: sai da lista, a cotação fica guardada. |
| Fretes & Benchmark | Mesmos registros e regras de PTAX por agente; a PTAX informada à mão fica em `hubPainel._fretes`. |
| Agenda & Tarefas · Gestão do Mês | Mesmos `agendaTasks` e `gestao`; abrir um mês não cria registro. |
| Ponto | Mesmas rotas do servidor; relatório com período e pessoa. |
| Equipe & Acessos · Configurações | Usuários, perfis do Hub e abas. Importar backup **só acrescenta** (substituir tudo continua só no `/antigo`). Prazos por etapa ficaram aqui. |

`settings` passou a ser mesclado por chave (servidor e Hub): gravar os prazos não apaga o resto.

**PIN não sai mais do servidor.** Nenhum navegador recebe o PIN de ninguém (só se a pessoa tem PIN), e o `/api/db` não aceita PIN — o sistema antigo, que preenche o PIN padrão quando não recebe o real, não consegue mais gravá-lo por cima. Trocar PIN: no Hub, em Equipe & Acessos (a própria pessoa troca o seu; quem administra acessos troca o de qualquer um), pela rota `POST /api/usuarios/:chave/pin`. Os PINs atuais continuam valendo; como apareceram num slide do treinamento, troque todos.


## Emissão de NF-e (Focus NFe)

Tela **NF-e (emissão)** no Hub, mais o bloco "Notas fiscais da operação" na ficha. Só **Davi e Pedro** emitem (`nfe.emitir`); o Samir acompanha; Matheus, Ívina e Oneide não veem. Coleção nova `hubNFe` (nada existente foi renomeado). A nota é montada no servidor: o contador não recebe operações, cotações nem CRM.

- **Cenários A a G** em `public/hub/js/nfe-regras.js`, editáveis pela diretoria em Cenários fiscais. São **sugestões a validar** pelo Pedro e pela Gil: a tela mostra "a validar" e, em produção, nota de cenário não conferido não sai.
- **Variáveis no Render:** `FOCUS_NFE_TOKEN_SF`, `FOCUS_NFE_TOKEN_JET` (sem elas vale `FOCUS_NFE_TOKEN`), `FOCUS_NFE_AMBIENTE=homologacao` e `FOCUS_WEBHOOK_TOKEN` (um texto longo qualquer). Na Focus, cadastrar o gatilho `nfe` de cada CNPJ para `https://<servidor>/api/webhooks/focus/<FOCUS_WEBHOOK_TOKEN>`. Sem o gatilho, o sistema consulta a cada 2 minutos.
- **Antes de emitir:** em NF-e › Configuração, cadastrar os dados da JeT (destinatária na triangular) e conferir o ICMS interno por UF. No CRM, completar o endereço, o código IBGE e a IE dos clientes.
- **Ordem do teste:** em homologação, uma nota de cada cenário com uma operação real (OP20), XML e DANFE conferidos com o Pedro, um cancelamento e uma carta de correção. Só então `FOCUS_NFE_AMBIENTE=producao`, e só então cancelar o Maino.

## Passo a passo (Davi)

1. **Backup antes de tudo:** no sistema atual, Config → Backup & dados → Exportar backup completo. Guardar como `backup-antes.json`.
2. **Ambiente de teste no Render** (serviço novo, mesmo repositório, ramo `hub-2.0`), com as MESMAS variáveis da produção, mais estas duas:
   - `WINDGATE_DB_OBJECT=sistema/db-teste.enc`
   - `WINDGATE_HISTORICO_PASTA=sistema/historico-teste`
3. **Copiar o banco real para o teste** (só lê a produção):
   `WINDGATE_DB_OBJECT_TESTE=sistema/db-teste.enc node scripts/copiar-para-teste.js`
4. **Usar o teste por alguns dias** com a equipe. Conferir `/api/health` → campo `historico.ok: true`.
5. **Conferir que nada se perdeu:** exportar o backup no ambiente de teste e rodar
   `npm run conferir:migracao -- backup-antes.json backup-teste.json` → tem que sair `✅ Nenhum registro perdido`.
6. **Publicar:** fazer o merge de `hub-2.0` no ramo da produção. Exportar um backup logo depois e rodar a conferência de novo.
7. **Se algo der errado:** voltar o deploy anterior no Render (um clique). Para recuperar dados:
   `npm run historico -- listar` e `npm run historico -- baixar <caminho> saida.json`, conferir e só então `node scripts/restaurar-banco.js saida.json` com o servidor parado.

## Pontos de segurança para resolver (fora deste ramo)

1. **O repositório está público.** O código não tem senhas, mas mostra a estrutura toda. Tornar privado em Settings → General → Danger Zone.
2. **O bucket `windgate-docs` é público** e a chave anon está no código. Qualquer pessoa com o link abre invoices e comprovantes, e a chave anon pode permitir sobrescrever `sistema/db.enc` (está cifrado, mas pode ser apagado). Recomendado: bucket privado, servidor usando a chave `service_role` (variável `SUPABASE_KEY` no Render, nunca no código) e links assinados com validade para os documentos.
3. **Rotas sem login:** `/api/aliquotas/atualizar`, `/api/integrations/clickup/*` e `/api/ncm/*` aceitam chamadas de qualquer um. Exigir token.
4. **Plano do Render e do Supabase:** confirmar que o serviço não dorme por inatividade e que o Supabase tem backup diário do projeto.
