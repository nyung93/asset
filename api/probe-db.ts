import type {IncomingMessage,ServerResponse} from 'node:http';
import {ensureSchema} from '../server/db';

export default function handler(_request:IncomingMessage,response:ServerResponse) {
  response.setHeader('Cache-Control','no-store');
  response.end(typeof ensureSchema==='function' ? 'db-module-ok' : 'db-module-failed');
}
