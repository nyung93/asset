import type {IncomingMessage,ServerResponse} from 'node:http';
import {passwordRule} from '../server/security';

export default function handler(_request:IncomingMessage,response:ServerResponse) {
  response.setHeader('Cache-Control','no-store');
  response.end(passwordRule('Example!1') ? 'security-ok' : 'security-failed');
}
