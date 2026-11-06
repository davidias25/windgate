# Modelos oficiais do contrato

Aqui ficam `modelo-jt.json` (J&T Import, cliente não contribuinte, gen.py) e `modelo-sf.json` (SF Trading, cliente contribuinte, gen2.py).
O sistema não escreve cláusula: sem o arquivo, a geração fica travada.

Formato: `{ "versao": "1", "blocos": [ ... ] }`. Cada bloco é um destes:

- `{ "t": "titulo" | "clausula" | "p", "texto": "..." }`, com `{{campo}}` no lugar dos dados.
- `{ "t": "anexoItens" }`, `{ "t": "anexoParcelas" }`, `{ "t": "anexoCambio" }`: tabelas geradas pelo sistema.

Campos: razaoSocial, cnpj, endereco, cep, representante, cpf, ieNumero, ieComprovanteEm, incoterm, localEntrega, freteNacional, prazo, mercadoria, operacao, data, difal, investimento, total, contratadaRazao, contratadaCnpj, contratadaEndereco, banco, agencia, conta, pix.

Dados bancários e das contratadas ficam no banco (Contratos > Dados das contratadas), não aqui: o repositório é público.
