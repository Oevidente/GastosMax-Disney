# Apps Script — Sincronização de status de pagamentos

Este Web App é o "banco" da aplicação. Ele guarda apenas os pagamentos que foram marcados como pagos e devolve esses dados para o app sincronizar a tela.


## Por que existe uma pasta `apps_script` neste repositório?

A aplicação **não executa** `apps_script/Code.gs` localmente no navegador nem no Vite. Esse arquivo é apenas a cópia versionada do código que precisa ser colado e publicado no Google Apps Script.

O fluxo real é:

1. O navegador roda `app.js`.
2. `app.js` chama a URL publicada em `API_URL`.
3. Essa URL executa a versão implantada do `Code.gs` dentro do Google Apps Script.
4. O Apps Script lê/escreve na planilha Google Sheets.

Mantemos `apps_script/Code.gs` no repositório para ter histórico, revisão e backup do backend do Google Apps Script. Sem essa cópia local, qualquer ajuste feito direto no editor do Google ficaria fora do Git e seria fácil perder ou esquecer qual versão está em produção.

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

## Solução de erro de sintaxe no Apps Script

Se aparecer um erro como `SyntaxError: Unexpected token '*'`, normalmente o editor recebeu um trecho copiado com comentário quebrado, Markdown ou alguma linha extra fora do código. Para evitar isso, o `Code.gs` deste repositório usa apenas comentários de linha (`//`) no cabeçalho e sintaxe compatível com Apps Script.

Ao copiar para o Google Apps Script:

1. Abra `apps_script/Code.gs` como arquivo bruto no editor/repositório.
2. Copie **somente** o conteúdo do arquivo, começando em `// Code.gs`.
3. No Google Apps Script, selecione tudo no arquivo `Código.gs`, apague e cole o conteúdo novo.
4. Confirme que não ficaram linhas com ``` ou textos de Markdown antes/depois do código.
5. Salve e faça uma nova implantação do Web App.

## Observações importantes

- O `doGet` precisa devolver o objeto de pagamentos. Se ele devolver somente `{ "ok": true }`, o app não consegue sincronizar status.
- O app usa `POST` com `no-cors`; por isso, ele atualiza a tela de forma otimista e confirma os dados na próxima leitura via `GET`.
- Faça backup da planilha antes de trocar o script em produção.
