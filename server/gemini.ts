/** The Gemini key stays in the Vercel function. No provider response is forwarded to browsers. */
export class GeminiRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {super(message);}
}

interface GeminiCandidate {
  finishReason?: string;
  content?: {parts?: Array<{text?: string}>};
}

export async function generateGemini(input: {
  systemPrompt: string;
  prompt: string;
  imageBase64?: string;
  json?: boolean;
}): Promise<string> {
  // The old VITE_ variable is accepted during migration, but a server-only key takes priority.
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.VITE_GEMINI_API_KEY?.trim();
  if (!apiKey) throw new GeminiRequestError(503, 'gemini_not_configured', 'AI 서버 키가 아직 설정되지 않았어요. 관리자에게 알려 주세요.');
  const model = process.env.GEMINI_MODEL?.trim() || process.env.VITE_GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
  if (!/^gemini-[a-z0-9.-]{1,60}$/i.test(model)) throw new GeminiRequestError(503, 'gemini_model_invalid', 'AI 모델 설정을 확인해 주세요.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 32_000);
  try {
    const parts: Array<{text: string} | {inlineData: {mimeType: string; data: string}}> = [{text: input.prompt}];
    if (input.imageBase64) parts.push({inlineData: {mimeType: 'image/jpeg', data: input.imageBase64}});
    const payload = {
      systemInstruction: {parts: [{text: input.systemPrompt}]},
      contents: [{role: 'user', parts}],
      generationConfig: {
        maxOutputTokens: input.json ? 1024 : 2048,
        ...(input.json ? {responseMimeType: 'application/json'} : {}),
        ...(model.startsWith('gemini-3.') ? {thinkingConfig: {thinkingLevel: 'LOW'}} : {}),
      },
    };
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      if (upstream.status === 401) throw new GeminiRequestError(503, 'gemini_key_invalid', 'Gemini API 키가 유효하지 않아요. Google AI Studio에서 확인해 주세요.');
      if (upstream.status === 402 || upstream.status === 403) throw new GeminiRequestError(503, 'gemini_access_denied', 'Gemini 프로젝트의 키 상태와 무료 사용 자격을 Google AI Studio에서 확인해 주세요.');
      if (upstream.status === 404) throw new GeminiRequestError(503, 'gemini_model_unavailable', '설정된 Gemini 모델을 사용할 수 없어요. 모델 설정을 확인해 주세요.');
      if (upstream.status === 429) throw new GeminiRequestError(429, 'gemini_quota', 'Gemini 무료 사용량이 잠시 부족해요. 조금 뒤 다시 시도해 주세요.');
      if (upstream.status === 400) throw new GeminiRequestError(502, 'gemini_bad_request', '이미지나 AI 요청을 처리하지 못했어요. 다시 시도해 주세요.');
      throw new GeminiRequestError(502, 'gemini_upstream', 'Gemini 서비스 응답이 불안정해요. 잠시 뒤 다시 시도해 주세요.');
    }
    const data = await upstream.json() as {candidates?: GeminiCandidate[]};
    const candidate = data.candidates?.[0];
    if (!candidate || candidate.finishReason !== 'STOP') throw new GeminiRequestError(502, 'gemini_incomplete', '할미가 답변을 마치지 못했어요. 다시 시도해 주세요.');
    const result = candidate.content?.parts?.map(part => part.text ?? '').join('').trim();
    if (!result) throw new GeminiRequestError(502, 'gemini_empty', 'AI 답변이 비어 있어요. 다시 시도해 주세요.');
    return result;
  } catch (error) {
    if (error instanceof GeminiRequestError) throw error;
    if (controller.signal.aborted) throw new GeminiRequestError(504, 'gemini_timeout', 'AI 응답이 늦어지고 있어요. 잠시 뒤 다시 시도해 주세요.');
    throw new GeminiRequestError(502, 'gemini_network', '서버에서 Gemini에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  } finally {
    clearTimeout(timeout);
  }
}
