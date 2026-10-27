import {afterEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {generateGemini, GeminiRequestError} from './gemini';

const originalFetch = globalThis.fetch;
const oldKey = process.env.GEMINI_API_KEY;
const oldViteKey = process.env.VITE_GEMINI_API_KEY;
const oldModel = process.env.GEMINI_MODEL;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
  if (oldViteKey === undefined) delete process.env.VITE_GEMINI_API_KEY; else process.env.VITE_GEMINI_API_KEY = oldViteKey;
  if (oldModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = oldModel;
});

const input = {systemPrompt:'Only return JSON', prompt:'Find the payment', imageBase64:'abc', json:true};
const answer = (text: string, finishReason = 'STOP') => Response.json({candidates:[{finishReason,content:{parts:[{text}]}}]});

test('server sends key only in a header, constrained instructions and resized image', async () => {
  process.env.GEMINI_API_KEY = 'server-test-key';
  process.env.VITE_GEMINI_API_KEY = 'legacy-test-key';
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /gemini-3\.8-flash:generateContent$/);
    assert.doesNotMatch(String(url), /test-key/);
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'server-test-key');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.systemInstruction.parts[0].text, input.systemPrompt);
    assert.equal(body.contents[0].parts[1].inlineData.data, input.imageBase64);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low');
    return answer('{"amount":1000}');
  };
  assert.equal(await generateGemini(input), '{"amount":1000}');
});

test('missing key and Google status codes get safe, distinct diagnostics', async () => {
  delete process.env.GEMINI_API_KEY; delete process.env.VITE_GEMINI_API_KEY;
  await assert.rejects(generateGemini(input), (error: GeminiRequestError) => error.code === 'gemini_not_configured');
  process.env.GEMINI_API_KEY = 'server-test-key';
  for (const [status, code] of [[401,'gemini_key_invalid'],[403,'gemini_access_denied'],[404,'gemini_model_unavailable'],[429,'gemini_quota'],[503,'gemini_upstream']] as const) {
    globalThis.fetch = async () => Response.json({error:{message:'sensitive provider details'}},{status});
    await assert.rejects(generateGemini(input), (error: GeminiRequestError) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /sensitive|server-test-key/);
      return true;
    });
  }
});

test('network failure, missing candidate and truncated answer have distinct errors', async () => {
  process.env.GEMINI_API_KEY = 'server-test-key';
  globalThis.fetch = async () => {throw new TypeError('Failed to fetch');};
  await assert.rejects(generateGemini(input), (error: GeminiRequestError) => error.code === 'gemini_network');
  globalThis.fetch = async () => Response.json({candidates:[]});
  await assert.rejects(generateGemini(input), (error: GeminiRequestError) => error.code === 'gemini_incomplete');
  globalThis.fetch = async () => answer('some text','MAX_TOKENS');
  await assert.rejects(generateGemini(input), (error: GeminiRequestError) => error.code === 'gemini_incomplete');
});

test('default Flash-Lite uses minimal thinking for quick text and image extraction', async () => {
  process.env.GEMINI_API_KEY = 'server-test-key';
  delete process.env.GEMINI_MODEL;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(JSON.parse(String(init?.body)).generationConfig.thinkingConfig.thinkingLevel, 'minimal');
    return answer('👵🏻 이번 달은 좋구나\n💸 식비를 살펴보렴\n📈 투자도 차근차근');
  };
  assert.match(await generateGemini({systemPrompt:'three lines',prompt:'summary'}), /식비/);
});

test('timeout distinguishes a reachable model endpoint from a blocked Google connection', async () => {
  process.env.GEMINI_API_KEY = 'server-test-key';
  delete process.env.GEMINI_MODEL;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Promise(() => {});
    return Response.json({name:'models/gemini-3.5-flash-lite'});
  };
  await assert.rejects(generateGemini({...input,timeoutMs:10}), (error: GeminiRequestError) => error.code === 'gemini_generation_timeout');
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Promise(() => {});
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(generateGemini({...input,timeoutMs:10}), (error: GeminiRequestError) => error.code === 'gemini_network_timeout');
});
