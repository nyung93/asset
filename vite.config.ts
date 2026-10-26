import { defineConfig, loadEnv, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import {handleRequest} from './server/handler';

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
function installAccountApi(server: Pick<ViteDevServer, 'middlewares'>) {
  server.middlewares.use(async (request,response,next) => {
    if (!request.url?.startsWith('/api/index')) {next();return;}
    try {
      const origin = `http://${request.headers.host ?? '127.0.0.1:5173'}`;
      const url = new URL(request.url,origin);
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const webRequest = new Request(url,{method:request.method,headers:request.headers as HeadersInit,
        body:request.method === 'GET' ? undefined : Buffer.concat(chunks)});
      const result = await handleRequest(webRequest);
      response.statusCode = result.status;
      result.headers.forEach((value,key) => {if (key !== 'set-cookie') response.setHeader(key,value);});
      const cookies = result.headers.getSetCookie();
      if (cookies.length) response.setHeader('Set-Cookie',cookies);
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {response.statusCode=500;response.end(JSON.stringify({error:'요청을 처리하지 못했어요.'}));}
  });
}
export default defineConfig(({command,mode})=>{
  if (command==='serve') {
    // Vite does not copy unprefixed .env.local values into process.env for Node middleware.
    const serverEnv=loadEnv(mode,process.cwd(),['DATABASE_URL','FIELD_ENCRYPTION_KEY']);
    for (const key of ['DATABASE_URL','FIELD_ENCRYPTION_KEY'] as const) {
      if (!process.env[key] && serverEnv[key]) process.env[key]=serverEnv[key];
    }
  }
  return {plugins: [react(), {name: 'local-finance-relay', configureServer: installFinanceRelay}, {name:'local-account-api',configureServer:installAccountApi}]};
});
