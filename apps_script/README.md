# Apps Script — Sincronização de status de pagamentos

Este Web App é o "banco" da aplicação. Ele grava uma linha por pessoa + assinatura + mês de cobrança e devolve para o site apenas os pagamentos que estão marcados como pagos.

## Modelo da planilha

Use uma aba chamada `Logs` com cinco colunas, exatamente nesta ordem:

| id_grupo | chave_perfil | chave_servico | mes | pago |
| --- | --- | --- | --- | --- |
| e_tudo_nosso | andre_luiz | disney | 2026-05-10 | TRUE |
| e_tudo_nosso | sarha_pedrosa | max | 2026-05-10 | FALSE |

### Significado das colunas

- `id_grupo`: código do grupo exibido/usado pelo site. Ex.: `e_tudo_nosso`.
- `chave_perfil`: chave do perfil. Ex.: `andre_luiz`, `isabela_lustosa`.
- `chave_servico`: chave da assinatura. Ex.: `disney`, `max`, `spotify`.
- `mes`: data da mensalidade/parcela que está sendo paga, não a data em que o botão foi clicado. O formato recomendado é `YYYY-MM-DD`, por exemplo `2026-05-10`.
- `pago`: `TRUE` quando está pago e `FALSE` quando está pendente.

> Pode zerar a planilha se quiser. Ao publicar o novo `Code.gs`, o script recria o cabeçalho se a aba estiver vazia.

## Como o site conversa com o script

### Marcar como pago

O site envia um `POST` com as mesmas chaves da aba `Logs`:

```json
{
  "action": "salvar_log",
  "id_grupo": "e_tudo_nosso",
  "chave_perfil": "andre_luiz",
  "chave_servico": "disney",
  "mes": "2026-05-10",
  "pago": true
}
```

O script procura a combinação `id_grupo + chave_perfil + chave_servico + mes`. Se já existir, atualiza `pago`; se não existir, adiciona uma linha.

### Desmarcar como pago

O site envia o mesmo conjunto de dados, mas com `pago: false`:

```json
{
  "action": "salvar_log",
  "id_grupo": "e_tudo_nosso",
  "chave_perfil": "andre_luiz",
  "chave_servico": "disney",
  "mes": "2026-05-10",
  "pago": false
}
```

O script marca `pago` como `FALSE`, sem apagar a linha. Assim a planilha mantém o histórico de pendências e pagamentos.

### Ler status pagos

O `GET` padrão devolve as coleções do grupo, incluindo `logs` normalizados:

```json
{
  "success": true,
  "logs": [
    {
      "id_grupo": "e_tudo_nosso",
      "chave_perfil": "andre_luiz",
      "chave_servico": "disney",
      "mes": "2026-05-10",
      "pago": true
    }
  ]
}
```

O site ignora linhas com `pago: false` e considera pagas apenas as linhas verdadeiras.

## Passos para atualizar no Google Apps Script

1. Copie o conteúdo de `apps_script/Backend_Atualizado.js` para o arquivo `Código.gs` do Google Apps Script.
2. Salve o projeto.
3. Publique uma nova versão do Web App em **Deploy > Manage deployments > Edit > New version**.
4. Confirme que o acesso continua como **Anyone** / **Qualquer pessoa** se o site público precisar consultar os dados.
5. Abra a URL `/exec?action=carregar_dados&id_grupo=e_tudo_nosso` e confirme que os `logs` voltam com `mes` em `YYYY-MM-DD` e `pago` como booleano.

## Observação sobre a lógica

O ponto importante é tratar `id_grupo + chave_perfil + chave_servico + mes` como uma chave única: sem isso, a mesma parcela poderia aparecer duplicada. O backend faz essa busca antes de atualizar ou adicionar linhas.
