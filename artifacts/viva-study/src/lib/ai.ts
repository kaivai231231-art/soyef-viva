import type { AIAccount, AIProvider, FollowUpAnswer } from './db';

export type KnowledgeCardDraft = {
  shortAnswer: string;
  detailedAnswer: string;
  keyPoints: string[];
  simpleExplanation: string;
  vivaAnswer: string;
  followUps: string[];
};

export type KnowledgeSection = keyof KnowledgeCardDraft;
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export function detectProviderFromKey(rawKey: string): { provider: AIProvider; baseUrl: string; model: string } {
  const key = rawKey.trim();
  // Google AI Studio now creates AQ.* authorization keys. Older AI Studio
  // keys commonly started with AIza. Both belong to Gemini.
  if (/^(?:AIza|AQ\.)/.test(key)) {
    return { provider: 'Gemini', baseUrl: '', model: 'gemini-2.5-flash' };
  }
  if (/^gsk_/.test(key)) {
    return { provider: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b' };
  }
  if (/^sk-or-/.test(key)) {
    return { provider: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/free' };
  }
  if (/^xai-/.test(key)) {
    return { provider: 'Grok', baseUrl: 'https://api.x.ai/v1', model: 'grok-2-latest' };
  }
  if (/^sk-proj-|^sk-/.test(key)) {
    return { provider: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };
  }
  return { provider: 'OpenAI-compatible', baseUrl: '', model: 'gpt-4o-mini' };
}

const basePrompt = (question: string, subject = '', topic = '') => `
তুমি Viva Study-এর জন্য একজন নির্ভুল, সহজ ভাষার viva প্রস্তুতি সহকারী।
প্রশ্ন: ${question}
${subject ? `বিষয়: ${subject}` : ''}
${topic ? `টপিক: ${topic}` : ''}

সহজ, স্বাভাবিক বাংলায় উত্তর দাও। textbook কপি করার মতো ভাষা নয়।
তথ্য নিশ্চিত না হলে বানিয়ে বলবে না; অনিশ্চয়তা থাকলে স্পষ্ট করবে।
উত্তর যেন পরীক্ষকের সামনে নিজের ভাষায় বলা যায়।
শুধু একটি পূর্ণ JSON object দাও। JSON-এর বাইরে কোনো লেখা বা markdown ব্যবহার করবে না।
সব string পূর্ণ বাক্য হবে। keyPoints ও followUps array হবে।
{
  "shortAnswer": "এক বা দুই বাক্যের সরাসরি উত্তর",
  "detailedAnswer": "ধারণাটি বোঝানো বিস্তারিত ব্যাখ্যা",
  "keyPoints": ["গুরুত্বপূর্ণ পয়েন্ট ১", "গুরুত্বপূর্ণ পয়েন্ট ২"],
  "simpleExplanation": "খুব সহজ ভাষায় ধারণাটি",
  "vivaAnswer": "স্বাভাবিকভাবে মুখে বলার মতো উত্তর",
  "followUps": ["সম্ভাব্য পাল্টা প্রশ্ন ১", "সম্ভাব্য পাল্টা প্রশ্ন ২"]
}
`;

function cleanJsonCandidate(text: string): string {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('AI সম্পূর্ণ JSON object ফেরত দেয়নি (সম্ভবত response কেটে গেছে)।');
  }
  return cleaned.slice(start, end + 1);
}

function parseCard(text: string): KnowledgeCardDraft {
  let parsed: Partial<KnowledgeCardDraft>;
  try {
    parsed = JSON.parse(cleanJsonCandidate(text)) as Partial<KnowledgeCardDraft>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`AI response valid JSON নয়: ${detail}`);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('AI response JSON object নয়।');
  const card = {
    shortAnswer: String(parsed.shortAnswer ?? ''),
    detailedAnswer: String(parsed.detailedAnswer ?? ''),
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String).filter(Boolean) : [],
    simpleExplanation: String(parsed.simpleExplanation ?? ''),
    vivaAnswer: String(parsed.vivaAnswer ?? ''),
    followUps: Array.isArray(parsed.followUps) ? parsed.followUps.map(String).filter(Boolean) : [],
  } satisfies KnowledgeCardDraft;
  if (!card.shortAnswer || !card.vivaAnswer) throw new Error('AI response JSON হলেও প্রয়োজনীয় answer fields খালি।');
  return card;
}

function parseSection(text: string, section: KnowledgeSection): string | string[] {
  const parsed = JSON.parse(cleanJsonCandidate(text)) as Partial<KnowledgeCardDraft>;
  const value = parsed[section];
  if (section === 'keyPoints' || section === 'followUps') {
    if (!Array.isArray(value)) throw new Error(`AI response-এ ${section} array পাওয়া যায়নি।`);
    return value.map(String).filter(Boolean);
  }
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`AI response-এ ${section} খালি।`);
  return result;
}

function followUpPrompt(question: string, followUp: string, subject = '', topic = ''): string {
  return `তুমি Viva Study-এর দ্বিতীয় স্তরের viva সহকারী। মূল প্রশ্ন: ${question}
${subject ? `বিষয়: ${subject}` : ''}
${topic ? `টপিক: ${topic}` : ''}
সম্ভাব্য পাল্টা প্রশ্ন: ${followUp}

এই পাল্টা প্রশ্নের এমন একটি নির্ভুল, সংক্ষিপ্ত কিন্তু যথেষ্ট উত্তর দাও যা viva-তে নিজের ভাষায় বলা যায়। মূল প্রশ্নের প্রসঙ্গ ধরে উত্তর দেবে। তথ্য নিশ্চিত না হলে বানিয়ে বলবে না। শুধু এই JSON দাও:
{"answer":"পূর্ণ উত্তর"}`;
}

function parseFollowUpAnswer(text: string): string {
  const parsed = JSON.parse(cleanJsonCandidate(text)) as { answer?: unknown };
  const answer = String(parsed.answer ?? '').trim();
  if (!answer) throw new Error('AI response-এ follow-up answer খালি।');
  return answer;
}


const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

// These are current Groq model IDs. Older llama-3.1/3.3 IDs were deprecated
// on August 16, 2026.
const GROQ_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
];

const OR_MODELS = ['openrouter/free'];
const GROK_MODELS = ['grok-2-latest', 'grok-2-mini'];

function buildMessages(prompt: string, systemPrompt: string): ChatMessage[] {
  return [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    { role: 'user' as const, content: prompt },
  ];
}

function compactErrorBody(text: string): string {
  const value = text.trim();
  if (!value) return 'empty response body';
  try {
    const json = JSON.parse(value) as { error?: { message?: string; code?: string; status?: string } };
    if (json.error) {
      return [json.error.code, json.error.status, json.error.message].filter(Boolean).join(' · ').slice(0, 700);
    }
  } catch {
    // Some providers return plain text or HTML on gateway errors.
  }
  return value.replace(/\s+/g, ' ').slice(0, 700);
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 700) : String(error).slice(0, 700);
}

async function tryGemini(apiKey: string, prompt: string, systemPrompt: string, models: string[], log: string[]): Promise<string | null> {
  if (!apiKey) return null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      };
      if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = compactErrorBody(await res.text());
        log.push(`Gemini/${model}:${res.status} ${detail}`);
        continue;
      }
      const data = (await res.json()) as {
        candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
      };
      const candidate = data.candidates?.[0];
      const reply = candidate?.content?.parts?.map(p => p.text ?? '').join('').trim() ?? '';
      if (reply) {
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
          log.push(`Gemini/${model}:finish=${candidate.finishReason}`);
        }
        return reply;
      }
      log.push(`Gemini/${model}:empty response`);
    } catch (error) {
      log.push(`Gemini/${model}:network ${safeMessage(error)}`);
    }
  }
  return null;
}

async function tryOpenAIChat(
  apiKey: string,
  baseUrl: string,
  prompt: string,
  systemPrompt: string,
  models: string[],
  providerLabel: string,
  extraHeaders: Record<string, string>,
  log: string[],
): Promise<string | null> {
  if (!apiKey) return null;
  const root = baseUrl.replace(/\/$/, '');
  for (const model of models) {
    try {
      const res = await fetch(`${root}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extraHeaders },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          temperature: 0.25,
          response_format: { type: 'json_object' },
          messages: buildMessages(prompt, systemPrompt),
        }),
      });
      if (!res.ok) {
        const detail = compactErrorBody(await res.text());
        log.push(`${providerLabel}/${model}:${res.status} ${detail}`);
        continue;
      }
      const json = (await res.json()) as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
      };
      const choice = json.choices?.[0];
      const reply = choice?.message?.content?.trim() ?? '';
      if (reply) {
        if (choice?.finish_reason && choice.finish_reason !== 'stop') log.push(`${providerLabel}/${model}:finish=${choice.finish_reason}`);
        return reply;
      }
      log.push(`${providerLabel}/${model}:empty response`);
    } catch (error) {
      log.push(`${providerLabel}/${model}:network ${safeMessage(error)}`);
    }
  }
  return null;
}

function modelsForAccount(account: AIAccount): string[] {
  const known = account.provider === 'Gemini' ? GEMINI_MODELS
    : account.provider === 'OpenRouter' ? OR_MODELS
    : account.provider === 'Groq' ? GROQ_MODELS
    : account.provider === 'Grok' ? GROK_MODELS
    : [];
  const custom = account.model?.trim();
  if (!custom) return known.length ? known : ['gpt-4o-mini'];
  return [custom, ...known.filter(m => m !== custom)];
}

async function tryAccount(account: AIAccount, prompt: string, systemPrompt: string, log: string[]): Promise<string | null> {
  const models = modelsForAccount(account);
  if (account.provider === 'Gemini') return tryGemini(account.apiKey, prompt, systemPrompt, models, log);
  if (account.provider === 'OpenRouter') return tryOpenAIChat(account.apiKey, account.baseUrl || 'https://openrouter.ai/api/v1', prompt, systemPrompt, models, 'OpenRouter', {
    'HTTP-Referer': window.location.origin,
    'X-Title': 'Viva Study AI',
  }, log);
  if (account.provider === 'Groq') return tryOpenAIChat(account.apiKey, account.baseUrl || 'https://api.groq.com/openai/v1', prompt, systemPrompt, models, 'Groq', {}, log);
  if (account.provider === 'Grok') return tryOpenAIChat(account.apiKey, account.baseUrl || 'https://api.x.ai/v1', prompt, systemPrompt, models, 'Grok', {}, log);
  return tryOpenAIChat(account.apiKey, account.baseUrl || 'https://api.openai.com/v1', prompt, systemPrompt, models, account.provider, {}, log);
}

function activeAccounts(accounts: AIAccount[]) {
  return accounts.filter(account => account.enabled && account.apiKey.trim() && account.status !== 'disabled').sort((a, b) => a.priority - b.priority);
}

const PROVIDER_ORDER: AIProvider[] = ['Gemini', 'Groq', 'OpenAI', 'Grok', 'OpenRouter', 'OpenAI-compatible'];

async function runWithFallback(
  accounts: AIAccount[],
  prompt: string,
  systemPrompt: string,
  validate?: (text: string) => void,
  preferredAccountId?: number,
): Promise<{ text: string; account: AIAccount; log: string[] }> {
  let candidates = activeAccounts(accounts);
  // For follow-up answers, try a different configured AI account first. If no
  // second account is available, fall back to the original account so the
  // feature still works for users with only one key.
  if (preferredAccountId !== undefined && candidates.length > 1) {
    const primary = candidates.find(a => a.id === preferredAccountId);
    if (primary) {
      candidates = [
        ...candidates.filter(a => a.id !== preferredAccountId && a.provider !== primary.provider),
        ...candidates.filter(a => a.id !== preferredAccountId && a.provider === primary.provider),
        primary,
      ];
    }
  }
  if (!candidates.length) throw new Error('কোনো সক্রিয় AI account পাওয়া যায়নি। AI settings থেকে একটি account যোগ করুন।');

  const byProvider = new Map<AIProvider, AIAccount[]>();
  for (const account of candidates) {
    const list = byProvider.get(account.provider) ?? [];
    list.push(account);
    byProvider.set(account.provider, list);
  }

  const log: string[] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const provider of PROVIDER_ORDER) {
      for (const account of byProvider.get(provider) ?? []) {
        const reply = await tryAccount(account, prompt, systemPrompt, log);
        if (!reply) continue;
        if (validate) {
          try {
            validate(reply);
          } catch (error) {
            log.push(`${account.provider}/${account.model || 'auto'}:invalid_response ${safeMessage(error)}`);
            continue;
          }
        }
        return { text: reply, account, log };
      }
    }
  }
  throw new Error(`কোনো active API দিয়ে request সম্পন্ন করা যায়নি।\n\nমূল কারণ/চেষ্টা: ${log.slice(-18).join('\n')}`);
}

export async function generateKnowledgeCard(
  accounts: AIAccount[],
  question: string,
  subject?: string,
  topic?: string,
): Promise<{ card: KnowledgeCardDraft; account: AIAccount; failures: string[] }> {
  const { text, account, log } = await runWithFallback(
    accounts,
    basePrompt(question, subject, topic),
    'তুমি একজন নির্ভুল viva প্রস্তুতি সহকারী। শুধু valid JSON দাও।',
    candidate => { parseCard(candidate); },
  );
  return { card: parseCard(text), account, failures: log };
}

export async function regenerateKnowledgeSection(
  accounts: AIAccount[],
  section: KnowledgeSection,
  question: string,
  subject?: string,
  topic?: string,
): Promise<{ value: string | string[]; account: AIAccount }> {
  const prompt = `${basePrompt(question, subject, topic)}\nএবার শুধু "${section}" property সহ একটি valid JSON object দাও।\n`;
  const { text, account } = await runWithFallback(
    accounts,
    prompt,
    'তুমি একজন নির্ভুল viva প্রস্তুতি সহকারী। শুধু valid JSON দাও।',
    candidate => { parseSection(candidate, section); },
  );
  return { value: parseSection(text, section), account };
}

export async function generateFollowUpAnswers(
  accounts: AIAccount[],
  primaryAccount: AIAccount | undefined,
  question: string,
  followUps: string[],
  subject?: string,
  topic?: string,
): Promise<{ answers: FollowUpAnswer[]; accountsUsed: AIAccount[]; failures: string[] }> {
  const answers: FollowUpAnswer[] = [];
  const accountsUsed: AIAccount[] = [];
  const failures: string[] = [];
  for (const followUp of followUps.slice(0, 6)) {
    try {
      const { text, account, log } = await runWithFallback(
        accounts,
        followUpPrompt(question, followUp, subject, topic),
        'তুমি একজন নির্ভুল viva সহকারী। শুধু valid JSON দাও।',
        candidate => { parseFollowUpAnswer(candidate); },
        primaryAccount?.id,
      );
      answers.push({ question: followUp, answer: parseFollowUpAnswer(text) });
      if (!accountsUsed.some(a => a.id === account.id)) accountsUsed.push(account);
      failures.push(...log);
    } catch (error) {
      failures.push(`Follow-up "${followUp}": ${safeMessage(error)}`);
    }
  }
  return { answers, accountsUsed, failures };
}

export async function testAIAccount(account: AIAccount) {
  const log: string[] = [];
  const reply = await tryAccount(account, 'Reply with exactly this JSON and nothing else: {"ok":true}', '', log);
  if (!reply) throw new Error(log.slice(-8).join('\n') || 'No response');
  try {
    const parsed = JSON.parse(cleanJsonCandidate(reply)) as { ok?: boolean };
    if (parsed.ok === true) return true;
    throw new Error('Provider response JSON-এ ok:true পাওয়া যায়নি।');
  } catch (error) {
    throw new Error(`${account.provider} test response invalid: ${safeMessage(error)}\n${log.slice(-8).join('\n')}`);
  }
}
