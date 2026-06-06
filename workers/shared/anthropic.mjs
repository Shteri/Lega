import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

// Initialise once — shared across all workers in a run
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model strings per operational spec
export const MODELS = {
  opus:   'claude-opus-4-8',            // Content Writer, Innovations
  sonnet: 'claude-sonnet-4-6',          // Classifier, specialists, judgment tasks
  haiku:  'claude-haiku-4-5-20251001'   // Scanner, Fetcher, mechanical tasks
};

/**
 * Call Claude with a system + user prompt.
 * Returns the raw text response.
 */
export async function call({ model, system, user, maxTokens = 2000 }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set. Copy .env.example to .env and add your key.');
  }

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }]
  });

  return response.content[0].text;
}

/**
 * Call Claude and parse the response as JSON.
 * Strips markdown fences if present.
 */
export async function callJSON({ model, system, user, maxTokens = 2000 }) {
  const raw = await call({ model, system, user, maxTokens });
  const clean = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  try {
    return JSON.parse(clean);
  } catch (err) {
    throw new Error(`Claude returned invalid JSON:\n${clean}\n\nParse error: ${err.message}`);
  }
}
