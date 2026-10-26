import { defineConfig, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

// Local development relay. Accepts only a ticker, never an arbitrary destination URL.
// The static build continues to use the public AllOrigins CORS endpoint directly.
function installFinanceRelay(server: Pick<ViteDevServer, 'middlewares'>) {
  server.middlewares.use('/api/finance/chart', async (request, response) => {
    const ticker = (request.url ?? '').split('?')[0].slice(1);
    if (request.method !== 'GET' || !/^[A-Z0-9^][A-Z0-9.^=\-]{0,29}$/.test(ticker)) {
      response.statusCode = 400;response.end('Invalid ticker');return;
    }
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    try {
      const upstream = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`, {signal: AbortSignal.timeout(7_000)});
      if (!upstream.ok) throw new Error('Upstream unavailable');
      const body = await upstream.text();
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(body);
    } catch {
      response.statusCode = 502;
      response.end(JSON.stringify({error: 'Quote temporarily unavailable'}));
    }
  });
}
export default defineConfig({plugins: [react(), {name: 'local-finance-relay', configureServer: installFinanceRelay}]});
