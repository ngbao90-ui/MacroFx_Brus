// Provider-agnostic LLM caller.
// Select provider via env LLM_PROVIDER: "anthropic" | "deepseek" | "openrouter" | "openai_compatible"
// Each provider needs its own API key secret. Model name can be overridden per-provider.
//
// Usage:
//   import { callLLM } from './lib/llm-provider.mjs';
//   const text = await callLLM({ system, user, maxTokens: 8000 });

const PROVIDERS = {
  anthropic: {
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-6',
    async call({ apiKey, model, system, user, maxTokens, useWebSearch }) {
      const body = {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      };
      // Server-executed web search: Anthropic runs the search and returns
      // results inline in the same response, no extra round-trip needed.
      // Used sparingly (weekly, for COT + narrative research) to keep cost down.
      if (useWebSearch) {
        body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }];
      }
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.content.map(b => b.text || '').join('\n');
    },
  },
  deepseek: {
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    async call(args) { return openAICompatibleCall({ ...args, baseUrl: 'https://api.deepseek.com/v1' }); },
  },
  openrouter: {
    // Use this for GLM (zhipu/glm-4-plus), OpenAI Codex/GPT models, Qwen, etc.
    // Set OPENROUTER_MODEL, e.g. "z-ai/glm-4.6" or "openai/gpt-5-codex".
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'z-ai/glm-4.6',
    async call(args) {
      return openAICompatibleCall({
        ...args,
        baseUrl: 'https://openrouter.ai/api/v1',
        extraHeaders: {
          'HTTP-Referer': 'https://github.com',
          'X-Title': 'FX Macro Dashboard',
        },
      });
    },
  },
  openai_compatible: {
    // Any custom OpenAI-compatible endpoint (self-hosted, Azure OpenAI gateway, etc.)
    envKey: 'OPENAI_COMPATIBLE_API_KEY',
    defaultModel: process.env.OPENAI_COMPATIBLE_MODEL || 'gpt-4o-mini',
    async call(args) {
      return openAICompatibleCall({ ...args, baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL });
    },
  },
};

async function openAICompatibleCall({ apiKey, model, system, user, maxTokens, baseUrl, extraHeaders = {} }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${baseUrl} API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

export async function callLLM({ system, user, maxTokens = 8000, providerOverride, modelOverride, useWebSearch = false }) {
  const providerName = providerOverride || process.env.LLM_PROVIDER || 'anthropic';
  const provider = PROVIDERS[providerName];
  if (!provider) throw new Error(`Unknown LLM_PROVIDER "${providerName}". Valid: ${Object.keys(PROVIDERS).join(', ')}`);
  const apiKey = process.env[provider.envKey];
  if (!apiKey) throw new Error(`Missing secret ${provider.envKey} for provider "${providerName}"`);
  const model = modelOverride || process.env.LLM_MODEL || provider.defaultModel;
  if (useWebSearch && providerName !== 'anthropic') {
    console.log(`[llm-provider] useWebSearch requested but provider "${providerName}" doesn't support it here — ignoring.`);
  }
  console.log(`[llm-provider] provider=${providerName} model=${model} webSearch=${useWebSearch && providerName === 'anthropic'}`);
  return provider.call({ apiKey, model, system, user, maxTokens, useWebSearch: useWebSearch && providerName === 'anthropic' });
}
