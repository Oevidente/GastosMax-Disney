# Apps Script — Remoção correta de pagamentos

Passos rápidos:

- Abra https://script.google.com e crie um novo projeto.
- Cole o conteúdo de `apps_script/Code.gs` no editor.
- Substitua `SPREADSHEET_ID` pelo ID da sua planilha (parte do URL).
- Ajuste `SHEET_NAME` se a aba tiver outro nome (ex: "payments").
- Salve e vá em "Deploy" → "Nova implantação" → selecione "Aplicativo da Web".
- Em "Executar como": escolha sua conta. Em "Quem tem acesso": selecione "Qualquer pessoa (mesmo anônima)".
- Copie a URL do aplicativo (a que termina em `/exec`) e cole como `API_URL` em `app.js`.

Testes:

- Para testar via curl (substitua a URL e os campos):

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"personKey":"andre","paymentKey":"disney:2026-05-10","remove":true}' \
  'https://script.google.com/macros/s/SEU_ID/exec'
```

Observações:
- O Apps Script procura por linhas onde `col1 == personKey` e `col2 == paymentKey` e as remove.
- Se preferir não permitir chamadas anônimas, será necessário adicionar autenticação no cliente.
- Faça um backup da planilha antes de rodar a remoção em produção.
