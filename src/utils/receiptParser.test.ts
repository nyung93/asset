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
const reply = (text: string) => Response.json(parseReceiptResponse(text));

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
test('invalid file types, size, empty files and corrupt images make no network call', async () => {
  let calls = 0;
  globalThis.fetch = async () => {calls++;throw new Error('must not fetch');};
  assert.ok(receiptFileError(new Blob(['x'], {type:'text/html'})));
  assert.ok(receiptFileError(new Blob([], {type:'image/png'})));
  assert.ok(receiptFileError(new Blob([new Uint8Array(MAX_RECEIPT_BYTES + 1)], {type:'image/png'})));
  assert.match((await parseReceiptImage(new Blob(['fake'], {type:'image/png'}))).errorMessage!, /원본/);
  assert.equal(calls, 0);
});
test('client sends resized JPEG to same-origin API and receives validated receipt', async () => {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), '/api/index?action=ai-receipt');
    assert.equal(init?.credentials, 'same-origin');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body), ['imageBase64']);
    assert.equal(body.imageBase64, 'cmVzaXplZA==');
    return reply(JSON.stringify(complete));
  };
  assert.deepEqual(await parseReceiptImage(receipt), {status:'SUCCESS',data:complete});
  assert.equal(calls, 1);
});
test('malformed and empty server outputs fail without partial writes', async () => {
  for (const response of [reply('{}'), reply('bad JSON'), Response.json({promptFeedback:{blockReason:'SAFETY'}})]) {
    globalThis.fetch = async () => response;
    const result = await parseReceiptImage(receipt);
    assert.equal(result.status, 'FAILED');assert.equal(result.data, undefined);
  }
});
test('server diagnostics and network errors have friendly messages', async () => {
  globalThis.fetch = async () => Response.json({error:'Gemini 무료 사용량이 잠시 부족해요.'}, {status:429});
  assert.match((await parseReceiptImage(receipt)).errorMessage!, /사용량/);
  globalThis.fetch = async () => Response.json({error:'Gemini 키 상태를 확인해 주세요.'}, {status:503});
  assert.match((await parseReceiptImage(receipt)).errorMessage!, /키 상태/);
  globalThis.fetch = async () => {throw new TypeError('Failed to fetch');};
  assert.match((await parseReceiptImage(receipt)).errorMessage!, /네트워크/);
});
test('timeout and user cancellation return promptly even if transport never settles', async () => {
  globalThis.fetch = () => new Promise(() => {});
  assert.match((await parseReceiptImage(receipt, {timeoutMs:15})).errorMessage!, /시간/);
  const controller = new AbortController();
  const pending = parseReceiptImage(receipt, {signal:controller.signal});
  controller.abort();
  assert.match((await pending).errorMessage!, /취소/);
  assert.match((await parseReceiptImage(receipt, {signal:controller.signal})).errorMessage!, /취소/);
});
