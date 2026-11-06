# Modelos oficiais do contrato

`modelo-jt.json` (J&T Import, cliente não contribuinte, gen.py) e `modelo-sf.json` (SF Trading, cliente contribuinte, gen2.py).
É o texto oficial, com os dados trocados por campos. O sistema não escreve cláusula; para mudar o contrato, mude aqui.

Cada bloco é um destes: `titulo`, `centro`, `clausula`, `p` (com `{{campo}}` e `**negrito**`), `quebra`, ou as tabelas `cronograma`, `anexoItens`, `anexoCronograma`, `anexoCambio`, `anexoBanco`, `assinaturas`.
`freteIncluso` diz para que situação o texto foi escrito. Combinação diferente gera alerta bloqueante na revisão.

Sem dados reais aqui: o repositório é público. Dados das contratadas, CPF do sócio e contas ficam no banco, em Contratos > Dados das contratadas.
