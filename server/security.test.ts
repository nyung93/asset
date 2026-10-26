import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {Readable} from 'node:stream';
import {decryptField,encryptField,hashPassword,normalizeUsername,passwordRule,usernameLookup,verifyPassword} from './security';
import {handleRequest} from './handler';
import api from './vercelEntry';

process.env.FIELD_ENCRYPTION_KEY=randomBytes(32).toString('base64');

test('sensitive fields use authenticated randomized encryption and username blind indexes',()=>{
  const first=encryptField('01012345678'),second=encryptField('01012345678');
  assert.notEqual(first,second);
  assert.equal(decryptField(first),'01012345678');
  assert.equal(decryptField(second),'01012345678');
  assert.throws(()=>decryptField(`${first.slice(0,-2)}aa`));
  assert.equal(normalizeUsername('  Alice_1 '),'alice_1');
  assert.equal(usernameLookup('Alice_1'),usernameLookup('alice_1'));
  assert.doesNotMatch(usernameLookup('alice_1'),/alice/);
});

test('password requirements and one-way scrypt verification',async()=>{
  assert.equal(passwordRule('Abcdefg!'),true);
  for(const password of ['abcdefgh!','ABCDEFGH!','Abcdefgh','Ab!']) assert.equal(passwordRule(password),false);
  const hash=await hashPassword('Abcdefg!');
  assert.doesNotMatch(hash,/Abcdefg!/);
  assert.equal(await verifyPassword('Abcdefg!',hash),true);
  assert.equal(await verifyPassword('Wrong!Password',hash),false);
});

test('API fails closed without Firebase credentials and rejects cross-origin mutations',async()=>{
  const status=await handleRequest(new Request('https://example.com/api/index?action=status'));
  assert.equal(status.status,503);
  const forged=await handleRequest(new Request('https://example.com/api/index?action=register',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'}));
  assert.equal(forged.status,403);
});

test('Vercel Node entry point sends a JSON response without Firebase configuration',async()=>{
  const request=Object.assign(Readable.from([]),{
    method:'GET',url:'/api/index?action=status',headers:{host:'example.com'},
  }) as unknown as IncomingMessage;
  let body='';
  const response={statusCode:200,setHeader:()=>undefined,end:(chunk:Buffer)=>{body=chunk.toString();}} as unknown as ServerResponse;
  await api(request,response);
  assert.equal(response.statusCode,503);
  assert.equal(JSON.parse(body).code,'setup_required');
});
