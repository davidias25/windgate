# Storage: chave de serviço e políticas do bucket

O bucket `windgate-docs` guarda duas coisas:

- os arquivos enviados pelas telas, em `documentos/`;
- os dados do próprio Hub, em `sistema/` (banco central, chat, ponto, atividade e alíquotas).

Os dados em `sistema/` são cifrados.

## O que depende de qual permissão

| Uso | Chamada | Com a chave anon precisa de |
|---|---|---|
| Ler banco, chat, ponto (`sistema/*.enc`) | `download()` | política SELECT |
| Gravar banco e arquivos | `upload(..., { upsert: true })` | INSERT, SELECT e UPDATE |
| Lista de arquivos e conferência diária | `list()` | SELECT (a conferência confere link por link se a lista vier vazia) |
| Abrir um link `…/object/public/…` | navegador | nada: o bucket é público |

Hoje o servidor usa a chave anon. Por isso, tirar a política ampla de SELECT agora deixaria o banco central ilegível. Faça na ordem abaixo.

## Passo a passo

1. **Render, Environment.** Crie `SUPABASE_SERVICE_KEY` com a chave *service_role* (ou *secret*). Ela fica em Supabase, Project Settings, API. A chave não vai para o código, para o banco nem para o chat.
2. **Publique e confira** `https://windgate.onrender.com/api/health`. Precisa mostrar `"storage": { "tipo": "servico", "origem": "SUPABASE_SERVICE_KEY" }`. Se mostrar `anon`, pare aqui.
3. **No Hub, teste** se envia um arquivo, se abre o link e se recarrega a página com os dados.
4. **Supabase, SQL Editor.** Veja as políticas:
   ```sql
   select policyname, cmd, roles, qual from pg_policies
   where schemaname = 'storage' and tablename = 'objects';
   ```
   Remova as que valem para `anon`/`public` no bucket `windgate-docs`: SELECT e também INSERT, UPDATE e DELETE. Com a chave de serviço, o servidor não precisa de nenhuma.
   ```sql
   drop policy "<nome da política>" on storage.objects;
   ```
5. **Repita o passo 3** e rode a conferência (`POST /api/storage/conferir`, logado).

Por que remover também INSERT/UPDATE/DELETE: a chave anon está no código público, e qualquer pessoa com ela pode listar, sobrescrever ou apagar arquivos enquanto essas políticas existirem.

## Bucket privado (avaliação)

O bucket privado resolveria duas coisas que hoje qualquer pessoa consegue:

- abrir um arquivo de cliente só sabendo o link;
- baixar `sistema/db.enc`, que está cifrado mas fica exposto.

Custo estimado: 1 a 2 dias.

- Todo link gravado hoje é `…/object/public/…` e deixaria de abrir.
- Seria preciso uma rota `/api/arquivo?l=<link>` que confere o login e redireciona para um link assinado de poucos minutos (`createSignedUrl`). As telas (Hub e sistema antigo) passariam a abrir os arquivos por ela.
- Os links que saem para fora precisam de um caminho próprio, com prazo: a proposta enviada ao cliente e o XML ou PDF de nota para o contador.

A conferência diária já usa o endereço autenticado quando há chave de serviço e continua valendo com o bucket privado.

Recomendação: fazer os passos 1 a 5 agora, porque tiram o risco maior (listar e apagar com a chave pública). O bucket privado fica como próximo projeto.
