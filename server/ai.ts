// AI assistance: commit messages, change explanations, conflict resolution, PR
// descriptions and chat, through whichever provider the user set up.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { AI_PROVIDERS, type AiProvider, type AiSettings } from '../shared/aiProviders';
import { git } from './git';
import { consoleArgs, CONSOLE_SUBCOMMANDS } from './gitConsole';
import { inRepo, UserError } from './http';
import { readUserConfig, writeUserConfig } from './userConfig';

interface StoredAiConfig {
  provider: AiProvider | null;
  model: string;
  baseUrl: string;
  apiKey: string;
}

const NO_CONFIG: StoredAiConfig = { provider: null, model: '', baseUrl: '', apiKey: '' };
const REQUEST_TIMEOUT_MS = 120_000;
/** Inputs beyond this are cut, and the model is told so. */
const MAX_INPUT_CHARS = 200_000;

function clip(text: string): string {
  return text.length <= MAX_INPUT_CHARS ? text : `${text.slice(0, MAX_INPUT_CHARS)}\n\n[cut: ${text.length - MAX_INPUT_CHARS} more characters not shown]`;
}

async function config(): Promise<StoredAiConfig & { provider: AiProvider }> {
  const stored = await readUserConfig('ai', NO_CONFIG);
  if (!stored.provider) throw new UserError('Set up an AI provider in Settings → AI first.');
  if (AI_PROVIDERS[stored.provider].needsKey && !stored.apiKey) {
    throw new UserError(`Add your ${AI_PROVIDERS[stored.provider].label} API key in Settings → AI.`);
  }
  return stored as StoredAiConfig & { provider: AiProvider };
}

interface Task<T> {
  system: string;
  /** Present when the task returns JSON; checked against every provider's answer. */
  schema?: z.ZodType<T>;
  effort: 'low' | 'medium' | 'high';
}

async function ask<T>(task: Task<T>, prompt: string): Promise<T> {
  const cfg = await config();
  const info = AI_PROVIDERS[cfg.provider];
  const model = cfg.model || info.defaultModel;
  if (!model) throw new UserError('Choose a model in Settings → AI.');
  const answer =
    info.protocol === 'anthropic'
      ? await askAnthropic(cfg, model, task, prompt)
      : info.protocol === 'gemini'
        ? await askGemini(cfg, model, task, prompt)
        : await askOpenAiCompatible(cfg, model, task, prompt);
  if (!task.schema) return answer as T;
  const parsed = task.schema.safeParse(typeof answer === 'string' ? parseJson(answer) : answer);
  if (!parsed.success) throw new UserError(`The model's answer was not in the expected format: ${parsed.error.message}`);
  return parsed.data;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new UserError('The model did not answer with JSON.');
  }
}

async function askAnthropic<T>(cfg: StoredAiConfig, model: string, task: Task<T>, prompt: string): Promise<T | string> {
  const client = new Anthropic({ apiKey: cfg.apiKey, timeout: REQUEST_TIMEOUT_MS });
  const request = {
    model,
    max_tokens: 16000,
    // If the model declines, the API retries on a fallback model in the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default' as const,
    system: task.system,
    messages: [{ role: 'user' as const, content: prompt }],
  };
  if (task.schema) {
    const response = await client.beta.messages.parse({
      ...request,
      output_config: { effort: task.effort, format: betaZodOutputFormat(task.schema) },
    });
    if (response.stop_reason === 'refusal') throw new UserError('The model declined this request.');
    if (response.parsed_output == null) throw new UserError('The model did not return the expected answer.');
    return response.parsed_output;
  }
  const response = await client.beta.messages.create({ ...request, output_config: { effort: task.effort } });
  if (response.stop_reason === 'refusal') throw new UserError('The model declined this request.');
  return response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new UserError(`AI request failed (${res.status}): ${data?.error?.message ?? res.statusText}`);
  return data;
}

async function askOpenAiCompatible(cfg: StoredAiConfig & { provider: AiProvider }, model: string, task: Task<unknown>, prompt: string): Promise<string> {
  const baseUrl = (cfg.baseUrl || AI_PROVIDERS[cfg.provider].defaultBaseUrl || '').replace(/\/+$/, '');
  if (!baseUrl) throw new UserError('Set the endpoint URL in Settings → AI.');
  const data = await postJson(`${baseUrl}/chat/completions`, cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}, {
    model,
    messages: [
      { role: 'system', content: task.system },
      { role: 'user', content: prompt },
    ],
    ...(task.schema ? { response_format: { type: 'json_object' } } : {}),
  });
  return data?.choices?.[0]?.message?.content ?? '';
}

async function askGemini(cfg: StoredAiConfig, model: string, task: Task<unknown>, prompt: string): Promise<string> {
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': cfg.apiKey },
    {
      systemInstruction: { parts: [{ text: task.system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(task.schema ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    }
  );
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
}

const commitMessageTask: Task<{ summary: string; description: string }> = {
  system:
    'You write git commit messages in the Conventional Commits style. Answer with JSON: ' +
    '{"summary": "type(scope): what changed, under 72 characters", "description": "why, as short bullet points, or empty"}.',
  schema: z.object({ summary: z.string(), description: z.string() }),
  effort: 'low',
};

const explainTask: Task<{ summary: string; keyChanges: string[]; riskAssessment: 'low' | 'medium' | 'high'; riskReasoning: string; suggestedAction: string }> = {
  system:
    'You review git changes. Answer with JSON: {"summary": "what the change does", "keyChanges": ["..."], ' +
    '"riskAssessment": "low" | "medium" | "high", "riskReasoning": "why", "suggestedAction": "what to test or check"}.',
  schema: z.object({
    summary: z.string(),
    keyChanges: z.array(z.string()),
    riskAssessment: z.enum(['low', 'medium', 'high']),
    riskReasoning: z.string(),
    suggestedAction: z.string(),
  }),
  effort: 'medium',
};

const conflictTask: Task<{ resolved: string; rationale: string }> = {
  system:
    'You resolve git merge conflicts. Given a file containing conflict markers, return the whole file with every ' +
    'conflict resolved and no markers left, keeping the intent of both sides where they are compatible. ' +
    'Answer with JSON: {"resolved": "the complete file", "rationale": "how each conflict was resolved"}.',
  schema: z.object({ resolved: z.string(), rationale: z.string() }),
  effort: 'medium',
};

const prTask: Task<{ title: string; body: string }> = {
  system: 'You write pull request descriptions. Answer with JSON: {"title": "short title", "body": "Markdown with a summary and how it was verified"}.',
  schema: z.object({ title: z.string(), body: z.string() }),
  effort: 'low',
};

const chatTask: Task<string> = {
  system:
    `You are Gitter's git assistant. The message includes the state of the user's repository and the conversation so far. ` +
    `Answer from that state; say so when it does not show what the user asks about. To suggest a command the user can run ` +
    `with one click, put it on its own line as "COMMAND: git <subcommand> ...". Only these subcommands can run that way: ` +
    `${CONSOLE_SUBCOMMANDS.join(', ')}. For anything else (reset, clean, force push), explain which of Gitter's own actions to use instead.`,
  effort: 'medium',
};

/** Earlier turns sent along with a chat message; the newest ones count. */
const MAX_HISTORY = 12;
/** The uncommitted diff is cut to this, so the conversation keeps most of the room. */
const MAX_CONTEXT_DIFF = 60_000;

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** What the assistant is told about the repository: branch, status, recent commits and the uncommitted diff. */
async function repositoryState(repo: string): Promise<string> {
  const [branch, status, log, diff] = await Promise.all([
    git(repo, ['branch', '--show-current']).then((s) => s.trim() || 'detached HEAD', () => 'unknown'),
    git(repo, ['status', '--short', '--branch']).catch(() => ''),
    git(repo, ['log', '-15', '--oneline', '--decorate']).catch(() => '(no commits yet)'),
    git(repo, ['diff', 'HEAD']).catch(() => git(repo, ['diff', '--cached']).catch(() => '')),
  ]);
  const shownDiff = diff.length > MAX_CONTEXT_DIFF ? `${diff.slice(0, MAX_CONTEXT_DIFF)}\n[diff cut]` : diff;
  return [
    `Branch: ${branch}`,
    `Status (git status --short):\n${status.trim() || '(clean)'}`,
    `Recent commits:\n${log.trim()}`,
    `Uncommitted changes to tracked files (git diff HEAD):\n${shownDiff.trim() || '(none)'}`,
  ].join('\n\n');
}

export const aiHandlers = {
  aiSettings: async (): Promise<AiSettings> => {
    const { apiKey, ...rest } = await readUserConfig('ai', NO_CONFIG);
    return { ...rest, hasKey: Boolean(apiKey) };
  },

  /** `apiKey`: a new key, '' to remove it, or omitted to keep the current one. */
  saveAiSettings: async ({ provider, model, baseUrl, apiKey }: { provider: AiProvider | null; model: string; baseUrl: string; apiKey?: string }) => {
    const stored = await readUserConfig('ai', NO_CONFIG);
    await writeUserConfig('ai', { provider, model: model.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey === undefined ? stored.apiKey : apiKey.trim() });
  },

  testAiProvider: async () => {
    const reply = await ask<string>({ system: 'Reply with the single word OK.', effort: 'low' }, 'Are you there?');
    return reply.trim();
  },

  commitMessage: ({ diff, files }: { diff: string; files: string[] }) =>
    ask(commitMessageTask, `Staged files: ${files.join(', ')}\n\nDiff:\n${clip(diff)}`),

  explainChanges: ({ diff, title }: { diff: string; title: string }) => ask(explainTask, `Changes: ${title}\n\nDiff:\n${clip(diff)}`),

  resolveConflict: ({ file, content }: { file: string; content: string }) => ask(conflictTask, `File: ${file}\n\n${clip(content)}`),

  prDescription: ({ commits, diffSummary }: { commits: string[]; diffSummary: string }) =>
    ask(prTask, `Commits:\n${commits.map((c) => `- ${c}`).join('\n')}\n\nChanged files:\n${clip(diffSummary)}`),

  /** `context`: more for the assistant to see with this message, such as an agent's diff. */
  chat: inRepo(async (repo, { message, history = [], context }: { message: string; history?: ChatTurn[]; context?: string }) => {
    const turns = history.slice(-MAX_HISTORY).map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`);
    const prompt = [
      `Repository state:\n${await repositoryState(repo)}`,
      context ? `Also shown for this question:\n${context}` : '',
      turns.length ? `Conversation so far:\n${turns.join('\n\n')}` : '',
      `User: ${message}`,
    ]
      .filter(Boolean)
      .join('\n\n---\n\n');
    const reply = await ask(chatTask, clip(prompt));
    const command = reply.match(/^COMMAND:\s*(git\s+.+)$/im)?.[1].trim();
    return { reply, suggestedCommand: command && isRunnable(command) ? command : undefined };
  }),
};

/** Whether the git console accepts the command; only those are offered as one click. */
function isRunnable(command: string): boolean {
  try {
    consoleArgs(command);
    return true;
  } catch {
    return false;
  }
}
