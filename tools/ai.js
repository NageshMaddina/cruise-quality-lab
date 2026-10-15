// Thin wrapper around the Claude API. Every AI feature in this repo has an offline fallback,
// so the pipeline never depends on a model being available.
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';

const enabled = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AI_OFFLINE !== '1';

async function askJson(system, prompt, maxTokens = 2000) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: MODEL, max_tokens: maxTokens, system,
    messages: [{ role: 'user', content: prompt }]
  });
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const json = text.slice(text.indexOf(text.trim().startsWith('[') ? '[' : '{'), Math.max(text.lastIndexOf('}'), text.lastIndexOf(']')) + 1);
  return JSON.parse(json);
}

module.exports = { enabled, askJson, MODEL };
