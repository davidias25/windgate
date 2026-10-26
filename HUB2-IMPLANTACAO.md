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
| 3 · Torre por função | Cada pessoa entra na sua Torre: **Samir** (Diretoria: aprovações, caixa, desempenho da equipe e meta do mês), **Davi** (Diretor de Operações · Financeiro: documentos para revisar, pagamentos da semana, caixa, equipe), **Matheus** (Frete, Tracking & Lançamentos: pendências de frete, trânsito, a lançar/conferir; sem DRE, margem nem exclusão), **Ívina** (Documentação & Atendimento: documentos a coletar, clientes a atualizar com mensagem pronta; nenhum acesso financeiro). Cada um personaliza os painéis e a ordem; a diretoria monta a torre de qualquer um; recados fixados por pessoa ou para todos. Perfil trocável por pessoa no campo `perfilHub` do usuário. Novos dados: `hubRecados` (lista, unida por `_id`) e `hubPainel` (por pessoa). Módulos ainda não refeitos (Cotações, CRM, Sourcing, Fretes, Agenda, Gestão do Mês, Ponto, Equipe, Config) abrem no sistema atual pelo próprio menu. |

Testes: `npm test` → 722 verificações (19 em `test/historico.test.js`, 51 em `test/hub2.test.js`: perfis e permissões, ida e volta sem perda, gravação concorrente com o sistema atual, exclusão, gravação parcial que não reverte o que outra pessoa mudou, contas do financeiro conferidas à mão).

Os dois sistemas convivem: `/` continua sendo o sistema atual e `/hub` o novo. Quando a equipe aprovar, `/` passa a abrir o Hub 2.0.

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
