// The AI providers Gitter can use. Settings lists these; the backend sends each
// request through the matching protocol.
export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'ollama' | 'custom';

export interface AiProviderInfo {
  label: string;
  /** Which request format the provider speaks. */
  protocol: 'anthropic' | 'openai' | 'gemini';
  defaultModel: string;
  /** For OpenAI-compatible providers: where their API lives unless Settings overrides it. */
  defaultBaseUrl?: string;
  needsKey: boolean;
}

export const AI_PROVIDERS: Record<AiProvider, AiProviderInfo> = {
  anthropic: { label: 'Anthropic Claude', protocol: 'anthropic', defaultModel: 'claude-opus-5-5', needsKey: true },
  openai: { label: 'OpenAI', protocol: 'openai', defaultModel: 'gpt-4o', defaultBaseUrl: 'https://api.openai.com/v1', needsKey: true },
  gemini: { label: 'Google Gemini', protocol: 'gemini', defaultModel: 'gemini-2.5-flash', needsKey: true },
  deepseek: { label: 'DeepSeek', protocol: 'openai', defaultModel: 'deepseek-chat', defaultBaseUrl: 'https://api.deepseek.com/v1', needsKey: true },
  ollama: { label: 'Ollama (local)', protocol: 'openai', defaultModel: 'llama3.1', defaultBaseUrl: 'http://localhost:11434/v1', needsKey: false },
  custom: { label: 'OpenAI-compatible endpoint', protocol: 'openai', defaultModel: '', needsKey: false },
};

/** What the UI may see of the AI settings: never the key itself. */
export interface AiSettings {
  provider: AiProvider | null;
  model: string;
  baseUrl: string;
  hasKey: boolean;
}
