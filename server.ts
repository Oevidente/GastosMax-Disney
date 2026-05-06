import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz-KQhp22IdLWLF8L9nyuWIn4BC2HaWBYPYewQRbwz_8LX7NZDERSFjZjga5mDlIG-S/exec';

  // Proxy para Sincronização (Resolve problemas de CORS e bloqueadores de rastreio no navegador)
  app.get("/api/sync-paid", async (req, res) => {
    try {
      const response = await fetch(`${GOOGLE_SCRIPT_URL}?t=${Date.now()}`, {
        method: 'GET',
        redirect: 'follow'
      });
      
      const text = await response.text();
      
      if (!response.ok) {
        console.error('Erro no GAS:', text);
        return res.status(response.status).json({ error: 'Erro no Google Script' });
      }
      
      try {
        const data = JSON.parse(text);
        res.json(data);
      } catch (parseError) {
        console.error('Falha ao processar JSON do Google:', text);
        res.status(500).json({ error: 'Resposta do Google não é um JSON válido' });
      }
    } catch (error) {
      console.error('Erro no proxy de sync:', error);
      res.status(500).json({ error: 'Falha na comunicação com o Google' });
    }
  });

  app.post("/api/sync-paid", async (req, res) => {
    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(req.body)
      });
      
      // POST para GAS geralmente retorna status de sucesso mesmo sem corpo legível se for no-cors,
      // mas aqui no servidor podemos ler o resultado se o GAS permitir.
      res.status(200).send('OK');
    } catch (error) {
      console.error('Erro no proxy de POST:', error);
      res.status(500).json({ error: 'Falha ao salvar no Google' });
    }
  });

  // Configuração do Vite para desenvolvimento
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Proxy configurado para: ${GOOGLE_SCRIPT_URL}`);
  });
}

startServer();