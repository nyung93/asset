import type {IncomingMessage,ServerResponse} from 'node:http';
import {handleRequest} from '../server/handler';

export default function handler(_request:IncomingMessage,response:ServerResponse) {
  response.setHeader('Cache-Control','no-store');
  response.end(typeof handleRequest==='function' ? 'handler-module-ok' : 'handler-module-failed');
}
