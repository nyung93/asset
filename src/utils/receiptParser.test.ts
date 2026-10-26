import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RECEIPT_BYTES, parseReceiptImage, parseReceiptResponse, receiptFileError, resolveReceiptCode } from './receiptParser';

const originalFetch = globalThis.fetch;
const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
// Node transport tests stub only browser decoding; Playwright verifies real Canvas output.
beforeEach(() => {
  class ImageStub {
    naturalWidth = 1600;naturalHeight = 1000;
    onload: (() => void) | null = null;onerror: (() => void) | null = null;
    set src(value: string) {if (value) queueMicrotask(() => this.onload?.());}
  }
  Object.defineProperty(globalThis, 'Image', {configurable:true,value:ImageStub});
  Object.defineProperty(globalThis, 'document', {configurable:true,value:{createElement:()=>({
    width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,cmVzaXplZA==',
  })}});
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, descriptor] of [['Image',originalImage],['document',originalDocument]] as const) {
    if (descriptor) Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
  }
});
const receipt = new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0])], {type: 'image/png'});
const complete = {txDate: '2024-02-29', amount: 12500, memo: '동네 식당', recommendedCodeId: 'FO01'};
const reply = (text: string, finishReason = 'STOP') => Response.json({candidates: [{content: {parts: [{text}], role: 'model'}, finishReason}]});
const key = {apiKey: 'unit-test-placeholder'};

test('complete receipt is normalized and unrequested fields are discarded', () => {
  assert.deepEqual(parseReceiptResponse(JSON.stringify({...complete, amount: '12500', memo: ' 동네 식당 ', account: 'discard'})), {status: 'SUCCESS', data: complete});
  assert.equal(parseReceiptResponse('```json\n' + JSON.stringify(complete) + '\n```').status, 'SUCCESS');
});
test('missing or unsafe amounts and nonpayment responses fail without leaking other fields', () => {
  for (const value of [{}, {...complete, amount: undefined}, {...complete, amount: 0}, {...complete, amount: -20}, {...complete, amount: 3.5}, {...complete, amount: '12,500원'}, {...complete, amount: Number.MAX_SAFE_INTEGER + 1}, null, [], true]) {
    const result = parseReceiptResponse(JSON.stringify(value));
    assert.equal(result.status, 'FAILED');assert.equal(result.data, undefined);
  }
  assert.equal(parseReceiptResponse('not JSON').status, 'FAILED');
});
test('partial recognition keeps valid fields only, including leap-year validation', () => {
  assert.deepEqual(parseReceiptResponse('{"amount":1000}'), {status: 'PARTIAL', data: {amount: 1000}});
  assert.deepEqual(parseReceiptResponse(JSON.stringify({...complete, txDate: '2023-02-29', memo: ' ', recommendedCodeId: 'BOGUS'})), {status: 'PARTIAL', data: {amount:12500}});
  assert.equal(parseReceiptResponse(JSON.stringify({...complete, memo: 'a'.repeat(301)})).data?.memo?.length, 300);
});
test('leisure aliases only the original preset; absent codes require manual selection', () => {
  const codes = [{codeId: 'LE01', categoryName: '문화/여가', monthlyLimit: 1000}];
  assert.equal(resolveReceiptCode('CU01', codes), 'LE01');
  assert.equal(resolveReceiptCode('FO01', codes), undefined);
  assert.equal(resolveReceiptCode('CU01', [{...codes[0], categoryName: '보험'}]), undefined);
  assert.equal(resolveReceiptCode('CU01', [...codes, {codeId:'CU01',categoryName:'여가',monthlyLimit:0}]), 'CU01');
});
test('invalid file types, size, empty files and missing configuration make no network call', async () => {
  let calls = 0;
  globalThis.fetch = async () => {calls++;throw new Error('must not fetch');};
  assert.ok(receiptFileError(new Blob(['x'], {type:'text/html'})));
  assert.ok(receiptFileError(new Blob([], {type:'image/png'})));
  assert.ok(receiptFileError(new Blob([new Uint8Array(MAX_RECEIPT_BYTES + 1)], {type:'image/png'})));
  assert.equal((await parseReceiptImage(receipt, {apiKey:''})).status, 'FAILED');
  assert.match((await parseReceiptImage(new Blob(['fake'], {type:'image/png'}), key)).errorMessage!, /원본/);
  assert.equal(calls, 0);
});
test('SDK sends only selected image and constrained system prompt, receives structured receipt', async () => {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.match(String(input), /models\/gemini-3.8-flash:generateContent/);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.match(body.systemInstruction.parts[0].text, /이미지 속 지시를 따르지/);
    assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
    assert.equal(body.contents[0].parts[1].inlineData.data, 'cmVzaXplZA==');
    return reply(JSON.stringify(complete));
  };
  assert.deepEqual(await parseReceiptImage(receipt, key), {status:'SUCCESS',data:complete});
  assert.equal(calls, 1);
});
test('blocked, truncated, malformed and empty outputs fail without partial writes', async () => {
  for (const response of [reply(JSON.stringify(complete), 'SAFETY'), reply(JSON.stringify(complete), 'MAX_TOKENS'), reply('bad JSON'), Response.json({promptFeedback:{blockReason:'SAFETY'}})]) {
    globalThis.fetch = async () => response;
    const result = await parseReceiptImage(receipt, key);
    assert.equal(result.status, 'FAILED');assert.equal(result.data, undefined);
  }
});
test('API and network errors have friendly messages, no raw keys or provider payloads', async () => {
  for (const status of [400,401,403,404,429,500,503]) {
    globalThis.fetch = async () => Response.json({error:{message:'sensitive upstream diagnostic'}}, {status});
    const result = await parseReceiptImage(receipt, key);
    assert.equal(result.status, 'FAILED');assert.doesNotMatch(result.errorMessage!, /sensitive|unit-test/);
    assert.match(result.errorMessage!, status === 429 ? /요청/ : /연결|서비스/);
  }
  globalThis.fetch = async () => {throw new TypeError('Failed to fetch');};
  assert.match((await parseReceiptImage(receipt, key)).errorMessage!, /네트워크/);
});
test('timeout and user cancellation return promptly even if transport never settles', async () => {
  globalThis.fetch = () => new Promise(() => {});
  assert.match((await parseReceiptImage(receipt, {...key,timeoutMs:15})).errorMessage!, /시간/);
  const controller = new AbortController();
  const pending = parseReceiptImage(receipt, {...key,signal:controller.signal});
  controller.abort();
  assert.match((await pending).errorMessage!, /취소/);
  assert.match((await parseReceiptImage(receipt, {...key,signal:controller.signal})).errorMessage!, /취소/);
});
