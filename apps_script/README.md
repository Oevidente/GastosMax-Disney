# Apps Script — Sincronização de status de pagamentos

Este Web App é o "banco" da aplicação. Ele grava uma linha por pessoa + assinatura + mês de cobrança e devolve para o site apenas os pagamentos que estão marcados como pagos.

## Modelo da planilha

Use uma aba chamada `Logs` com quatro colunas, exatamente nesta ordem:

| nome | assinatura | mes | pago |
| --- | --- | --- | --- |
| André Luiz | Disney+ | 2026-05-10 | TRUE |
| Sarha Pedrosa | HBO Max | 2026-05-10 | FALSE |

### Significado das colunas

- `nome`: nome exibido no site. Ex.: `André Luiz`, `Bela Lustosa`, `Ianka Lacerda`, `Sarha Pedrosa`.
- `assinatura`: assinatura paga. Use `Disney+` ou `HBO Max`.
- `mes`: data da mensalidade/parcela que está sendo paga, não a data em que o botão foi clicado. O formato recomendado é `YYYY-MM-DD`, por exemplo `2026-05-10`.
- `pago`: `TRUE` quando está pago e `FALSE` quando está pendente.

> Pode zerar a planilha se quiser. Ao publicar o novo `Code.gs`, o script recria o cabeçalho se a aba estiver vazia.

## Como o site conversa com o script

### Marcar como pago

O site envia um `POST` com os dados novos e alguns campos legados para compatibilidade:

```json
{
  "personKey": "andre",
  "paymentKey": "disney:2026-05-10",
  "nome": "André Luiz",
  "serviceKey": "disney",
  "assinatura": "Disney+",
  "mes": "2026-05-10",
  "pago": true
}
```

O script procura a combinação `nome + assinatura + mes`. Se já existir, atualiza `pago`; se não existir, adiciona uma linha.

### Desmarcar como pago

O site envia o mesmo conjunto de dados, mas com `pago: false` e `remove: true`:

```json
{
  "personKey": "andre",
  "paymentKey": "disney:2026-05-10",
  "nome": "André Luiz",
  "serviceKey": "disney",
  "assinatura": "Disney+",
  "mes": "2026-05-10",
  "pago": false,
  "remove": true
}
```

Neste modelo novo, `remove: true` não precisa apagar a linha: ele marca `pago` como `FALSE`. Assim a planilha mantém o histórico de pendências e pagamentos.

### Ler status pagos

O `GET` padrão devolve o formato que o frontend já usa:

```json
{
  "andre": {
    "disney:2026-05-10": "true"
  }
}
```

Somente linhas com `pago` verdadeiro aparecem nessa resposta. Linhas `FALSE` continuam na planilha, mas são consideradas pendentes no site.

### Ver linhas brutas

Para depurar a planilha, acesse a URL publicada com `?action=rows`. A resposta traz as linhas normalizadas, incluindo `pago: false`.

### Health check

Para conferir se a publicação está apontando para o código novo, acesse a URL publicada com `?action=health`. A resposta esperada inclui:

```json
{
  "success": true,
  "sheetName": "Logs",
  "headers": ["nome", "assinatura", "mes", "pago"]
}
```

## Passos para atualizar no Google Apps Script

1. Copie o conteúdo de `apps_script/Code.gs` para o arquivo `Código.gs` do Google Apps Script.
2. Salve o projeto.
3. Publique uma nova versão do Web App em **Deploy > Manage deployments > Edit > New version**.
4. Confirme que o acesso continua como **Anyone** / **Qualquer pessoa** se o site público precisar consultar os dados.
5. Abra a URL `/exec?action=health` e confirme que os cabeçalhos são `nome`, `assinatura`, `mes`, `pago`.

## Observação sobre a lógica

Sua ideia de gravar `nome`, `assinatura`, `mes` e `pago` é melhor do que guardar apenas `personKey`, `paymentKey` e a data atual do clique, porque a planilha fica legível e o mês pago fica explícito. O ponto importante é tratar `nome + assinatura + mes` como uma chave única: sem isso, a mesma parcela poderia aparecer duplicada. O `Code.gs` faz essa busca antes de atualizar ou adicionar linhas.
