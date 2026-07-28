# WindGate · Sistema de Gestão (Back-end)

Este é o servidor Back-end em Node.js (Express) do sistema WindGate, responsável por:
1. Armazenamento e persistência de **Cotações** e **Operações**.
2. **Upload e Armazenamento de Arquivos** (PDFs de propostas, comprovantes, BLs, NFs).
3. Conectividade com a **API do ClickUp** (criação automática de tarefas).
4. Conectividade com a **API do Google Drive** (armazenamento automático na nuvem).

---

## 📁 Estrutura de Pastas

```text
windgate-backend/
├── public/                     # Pasta para colocar o seu index.html (Front-end)
│   └── index.html
├── src/
│   ├── config/                 # Arquivos de conexão e configurações
│   ├── controllers/            # Lógica das cotações, operações e financeiro
│   │   └── cotacoes.controller.js
│   ├── integrations/           # Conectores com APIs Externas (ClickUp e Google Drive)
│   │   ├── clickup.service.js
│   │   └── drive.service.js
│   ├── middlewares/            # Middlewares (Ex: upload com Multer)
│   │   └── upload.middleware.js
│   ├── routes/                 # Rotas HTTP REST
│   │   └── cotacoes.routes.js
│   └── server.js               # Ponto de entrada do servidor Node.js/Express
├── uploads/                    # Armazenamento local dos PDFs e comprovantes recebidos
├── .env.example                # Exemplo das variáveis de ambiente
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Como Executar

### 1. Instalar as dependências
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env` e preencha as chaves da API do ClickUp e Google Drive:
```bash
cp .env.example .env
```

### 3. Rodar o servidor em Modo de Desenvolvimento
```bash
npm run dev
# Ou modo produção:
npm start
```

O servidor estará rodando em `http://localhost:3000`.
