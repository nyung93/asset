import type {IncomingMessage, ServerResponse} from 'node:http';
import {handleRequest} from './handler';

// Bundled to api/index.mjs for Vercel's standard Node function signature.
export default async function handler(request:IncomingMessage,response:ServerResponse) {
  try {
    const protocol=process.env.VERCEL==='1' || request.headers['x-forwarded-proto']==='https' ? 'https' : 'http';
    const host=request.headers.host ?? 'localhost';
    const url=new URL(request.url ?? '/',`${protocol}://${host}`);
    const headers=new Headers();
    for(const [key,value] of Object.entries(request.headers)) {
      if(Array.isArray(value)) value.forEach(item=>headers.append(key,item));
      else if(value !== undefined) headers.set(key,value);
    }
    const chunks:Buffer[]=[];
    if(request.method !== 'GET' && request.method !== 'HEAD') {
      for await(const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const webRequest=new Request(url,{method:request.method,headers,
      body:request.method === 'GET' || request.method === 'HEAD' ? undefined : Buffer.concat(chunks)});
    const result=await handleRequest(webRequest);
    response.statusCode=result.status;
    result.headers.forEach((value,key)=>{if(key !== 'set-cookie') response.setHeader(key,value);});
    const cookies=result.headers.getSetCookie();
    if(cookies.length) response.setHeader('Set-Cookie',cookies);
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch(error) {
    console.error('Account API function failed',error);
    response.statusCode=503;
    response.setHeader('Cache-Control','no-store');
    response.setHeader('Content-Type','application/json; charset=utf-8');
    response.end(JSON.stringify({error:'서버 연결을 준비하고 있어요.',code:'api_unavailable'}));
  }
}
