import { defineConfig, loadEnv, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import {handleRequest} from './server/handler';

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
    const serverEnv=loadEnv(mode,process.cwd(),['FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','GOOGLE_APPLICATION_CREDENTIALS','FIELD_ENCRYPTION_KEY','GEMINI_API_KEY','GEMINI_MODEL','VITE_GEMINI_API_KEY','VITE_GEMINI_MODEL']);
    for (const key of ['FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','GOOGLE_APPLICATION_CREDENTIALS','FIELD_ENCRYPTION_KEY','GEMINI_API_KEY','GEMINI_MODEL','VITE_GEMINI_API_KEY','VITE_GEMINI_MODEL'] as const) {
      if (!process.env[key] && serverEnv[key]) process.env[key]=serverEnv[key];
    }
  }
  return {plugins: [react(), {name:'local-account-api',configureServer:installAccountApi}]};
});
