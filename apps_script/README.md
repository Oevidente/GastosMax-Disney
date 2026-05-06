# Apps Script — Sincronização de status de pagamentos

Este Web App é o "banco" da aplicação. Ele guarda apenas os pagamentos que foram marcados como pagos e devolve esses dados para o app sincronizar a tela.

## Modelo simplificado da planilha

Use uma aba chamada `Logs` com três colunas:

| personKey | paymentKey | paidAt |
| --- | --- | --- |
| andre | disney:2026-05-10 | 2026-05-06T12:00:00.000Z |

Regras:

- **Linha existente = pagamento pago**.
- **Linha inexistente = pagamento pendente**.
- `personKey` identifica a pessoa.
- `paymentKey` identifica a parcela no formato usado pelo app: `servico:AAAA-MM-DD`.
- `paidAt` registra quando o pagamento foi marcado como pago.

Com esse modelo, não é necessário salvar status como `pago`/`pendente`, valor, mês, nome da pessoa ou nome do serviço na planilha. Essas informações já existem no `app.js`, e duplicar esses dados aumenta a chance de divergência.

## Instalação

1. Abra https://script.google.com e crie um novo projeto.
2. Cole o conteúdo de `apps_script/Code.gs` no editor.
3. Substitua `SPREADSHEET_ID` pelo ID da sua planilha, que é a parte do URL entre `/d/` e `/edit`.
4. Ajuste `SHEET_NAME` se a aba tiver outro nome.
5. Salve e vá em **Deploy** → **Nova implantação** → selecione **Aplicativo da Web**.
6. Em **Executar como**, escolha sua conta.
7. Em **Quem tem acesso**, selecione **Qualquer pessoa** ou **Qualquer pessoa, mesmo anônima**.
8. Copie a URL que termina em `/exec` e cole como `API_URL` em `app.js`.
9. Depois de qualquer alteração no Apps Script, crie uma **nova versão/implantação**. Só salvar o arquivo no editor não atualiza o Web App publicado.

## Endpoints

### Listar pagamentos pagos

```bash
curl 'https://script.google.com/macros/s/SEU_ID/exec'
```

Resposta esperada:

```json
{
  "andre": {
    "disney:2026-05-10": "2026-05-06T12:00:00.000Z"
  }
}
```

### Marcar como pago

```bash
curl -X POST -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"personKey":"andre","paymentKey":"disney:2026-05-10","paidAt":"2026-05-06T12:00:00.000Z"}' \
  'https://script.google.com/macros/s/SEU_ID/exec'
```

### Desmarcar pagamento

```bash
curl -X POST -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"personKey":"andre","paymentKey":"disney:2026-05-10","remove":true}' \
  'https://script.google.com/macros/s/SEU_ID/exec'
```

### Diagnóstico rápido

```bash
curl 'https://script.google.com/macros/s/SEU_ID/exec?action=health'
```

## Observações importantes

- O `doGet` precisa devolver o objeto de pagamentos. Se ele devolver somente `{ "ok": true }`, o app não consegue sincronizar status.
- O app usa `POST` com `no-cors`; por isso, ele atualiza a tela de forma otimista e confirma os dados na próxima leitura via `GET`.
- Faça backup da planilha antes de trocar o script em produção.
