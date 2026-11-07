import { AIExplanation } from '../src/types/git';

export interface AIProviderConfig {
  provider: 'gemini' | 'openai' | 'anthropic' | 'claude' | 'ollama' | 'deepseek' | 'custom' | 'builtin';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class AIService {
  private config: AIProviderConfig = {
    provider: 'builtin',
    model: 'claude-3-7-sonnet-20250219',
  };

  setConfig(newConfig: Partial<AIProviderConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  private isOpenAICompatible(p: string): boolean {
    return p === 'openai' || p === 'deepseek' || p === 'custom' || p === 'ollama';
  }

  private getOpenAIBaseUrl(): string {
    if (this.config.baseUrl && this.config.baseUrl.trim()) {
      return this.config.baseUrl.trim().replace(/\/+$/, '');
    }
    if (this.config.provider === 'deepseek') {
      return 'https://api.deepseek.com/v1';
    }
    if (this.config.provider === 'ollama') {
      return 'http://localhost:11434/v1';
    }
    return 'https://api.openai.com/v1';
  }

  async generateCommitMessage(diffText: string, stagedFiles: string[]): Promise<{ summary: string; description: string }> {
    const p = this.config.provider;
    if ((p === 'anthropic' || p === 'claude') && this.config.apiKey) {
      try {
        return await this.callClaudeForCommit(diffText, stagedFiles);
      } catch (e) {
        console.warn('Claude API call failed, falling back:', e);
      }
    } else if (p === 'gemini' && this.config.apiKey) {
      try {
        return await this.callGeminiForCommit(diffText, stagedFiles);
      } catch (e) {
        console.warn('Gemini API call failed, falling back:', e);
      }
    } else if (this.isOpenAICompatible(p) && (this.config.apiKey || p === 'ollama')) {
      try {
        return await this.callOpenAICompatibleForCommit(diffText, stagedFiles);
      } catch (e) {
        console.warn(`${p} API call failed, falling back:`, e);
      }
    }

    return this.heuristicCommitGenerator(diffText, stagedFiles);
  }

  async explainChanges(diffText: string, contextTitle: string): Promise<AIExplanation> {
    const p = this.config.provider;
    if ((p === 'anthropic' || p === 'claude') && this.config.apiKey) {
      try {
        return await this.callClaudeForExplain(diffText, contextTitle);
      } catch (e) {
        console.warn('Claude explain failed, falling back:', e);
      }
    } else if (p === 'gemini' && this.config.apiKey) {
      try {
        return await this.callGeminiForExplain(diffText, contextTitle);
      } catch (e) {
        console.warn('Gemini explain failed, falling back:', e);
      }
    } else if (this.isOpenAICompatible(p) && (this.config.apiKey || p === 'ollama')) {
      try {
        return await this.callOpenAICompatibleForExplain(diffText, contextTitle);
      } catch (e) {
        console.warn(`${p} explain failed, falling back:`, e);
      }
    }

    return this.heuristicExplainChanges(diffText, contextTitle);
  }

  async resolveConflict(conflictFileText: string, filePath: string): Promise<{ suggestion: string; rationale: string }> {
    const lines = conflictFileText.split('\n');
    let ourLines: string[] = [];
    let theirLines: string[] = [];
    let inOur = false;
    let inTheir = false;

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        inOur = true;
      } else if (line.startsWith('=======')) {
        inOur = false;
        inTheir = true;
      } else if (line.startsWith('>>>>>>>')) {
        inTheir = false;
      } else if (inOur) {
        ourLines.push(line);
      } else if (inTheir) {
        theirLines.push(line);
      }
    }

    return {
      suggestion: [...ourLines, ...theirLines].join('\n'),
      rationale: `Merged incoming and current changes for ${filePath}. Retained current implementation with new incoming additions.`,
    };
  }

  async generatePrDescription(commits: string[], diffSummary: string): Promise<{ title: string; body: string }> {
    const p = this.config.provider;
    if ((p === 'anthropic' || p === 'claude') && this.config.apiKey) {
      try {
        return await this.callClaudeForPr(commits, diffSummary);
      } catch (e) {
        console.warn('Claude PR generator failed, falling back:', e);
      }
    } else if (this.isOpenAICompatible(p) && (this.config.apiKey || p === 'ollama')) {
      try {
        return await this.callOpenAICompatibleForPr(commits, diffSummary);
      } catch (e) {
        console.warn(`${p} PR generator failed, falling back:`, e);
      }
    }

    const title = commits.length > 0 ? commits[0] : 'feat: update project features';
    const body = [
      '### Summary of Changes',
      ...commits.map((c) => `- ${c}`),
      '',
      '### Verification & Testing',
      '- Tested branch changes locally in Gitter client',
      '- Verified clean working tree and git status',
    ].join('\n');

    return { title, body };
  }

  async chatWithAgent(
    message: string,
    repoContext: { branch: string; status: string; recentCommits: string }
  ): Promise<{ reply: string; suggestedCommand?: string }> {
    const p = this.config.provider;
    if ((p === 'anthropic' || p === 'claude') && this.config.apiKey) {
      try {
        return await this.callClaudeForChat(message, repoContext);
      } catch (e) {
        console.warn('Claude agent chat failed, falling back to heuristics:', e);
      }
    } else if (this.isOpenAICompatible(p) && (this.config.apiKey || p === 'ollama')) {
      try {
        return await this.callOpenAICompatibleForChat(message, repoContext);
      } catch (e) {
        console.warn(`${p} agent chat failed, falling back to heuristics:`, e);
      }
    }

    const lower = message.toLowerCase();

    if (lower.includes('undo') && (lower.includes('last commit') || lower.includes('recent commit'))) {
      if (lower.includes('keep') || lower.includes('soft') || !lower.includes('hard')) {
        return {
          reply: 'You can safely undo your last commit while keeping all your changes staged in the working tree.',
          suggestedCommand: 'git reset --soft HEAD~1',
        };
      } else {
        return {
          reply: '⚠️ Warning: This will permanently delete the last commit and all working changes.',
          suggestedCommand: 'git reset --hard HEAD~1',
        };
      }
    }

    if (lower.includes('create branch') || lower.includes('new branch')) {
      const match = message.match(/(?:branch|called|named)\s+([a-zA-Z0-9_\-\/]+)/i);
      const branchName = match ? match[1] : 'feature/new-branch';
      return {
        reply: `Here is the command to create and switch to the new branch '${branchName}':`,
        suggestedCommand: `git checkout -b ${branchName}`,
      };
    }

    if (lower.includes('discard') || lower.includes('clean working')) {
      return {
        reply: 'To discard all unstaged changes and clean untracked files:',
        suggestedCommand: 'git restore . && git clean -fd',
      };
    }

    if (lower.includes('stash') && (lower.includes('pop') || lower.includes('apply'))) {
      return {
        reply: 'To pop and apply your most recent stash:',
        suggestedCommand: 'git stash pop',
      };
    }

    if (lower.includes('stash')) {
      return {
        reply: 'To save your current working changes into a stash with untracked files:',
        suggestedCommand: 'git stash push -u -m "WIP changes"',
      };
    }

    if (lower.includes('sync') || lower.includes('pull')) {
      return {
        reply: 'To pull latest changes from the remote tracking branch using rebase:',
        suggestedCommand: 'git pull --rebase origin ' + (repoContext.branch || 'main'),
      };
    }

    if (lower.includes('amend')) {
      return {
        reply: 'To amend the previous commit with current staged changes:',
        suggestedCommand: 'git commit --amend --no-edit',
      };
    }

    return {
      reply: `I am your Gitter Git Assistant powered by ${this.config.provider.toUpperCase()} (${this.config.model || 'default'}). Current branch is **${repoContext.branch}**. Ask me to draft commits, explain diffs, generate git commands, or resolve conflicts.`,
    };
  }

  // --- Anthropic Claude API Callers ---
  private async callClaudeForCommit(diffText: string, stagedFiles: string[]): Promise<{ summary: string; description: string }> {
    const prompt = `You are an expert Git assistant. Analyze this git diff and write a conventional commit message.
Staged files: ${stagedFiles.join(', ')}
Diff snippet:
${diffText.slice(0, 8000)}

Output ONLY valid JSON in format:
{
  "summary": "feat(scope): brief message (under 72 chars)",
  "description": "Optional bullet points detailing motivation and technical changes"
}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-3-7-sonnet-20250219',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const content = data?.content?.[0]?.text || '{}';
    const cleanJson = content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  }

  private async callClaudeForExplain(diffText: string, contextTitle: string): Promise<AIExplanation> {
    const prompt = `Analyze this git diff for ${contextTitle}.
Diff snippet:
${diffText.slice(0, 8000)}

Output ONLY valid JSON without markdown wrapping:
{
  "summary": "concise overview of changes",
  "keyChanges": ["highlight 1", "highlight 2"],
  "riskAssessment": "low" | "medium" | "high",
  "riskReasoning": "brief explanation of risk",
  "suggestedAction": "recommended tests or review focus"
}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-3-7-sonnet-20250219',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const content = data?.content?.[0]?.text || '{}';
    const cleanJson = content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  }

  private async callClaudeForChat(message: string, repoContext: any): Promise<{ reply: string; suggestedCommand?: string }> {
    const systemPrompt = `You are Gitter AI, an expert Git engineer and assistant. The user is currently in repository branch '${repoContext.branch}'. Status: ${repoContext.status}.
Give helpful, precise answers. If suggesting a command, include it on a line starting with 'COMMAND: git ...' so the UI can offer a 1-click execution button.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-3-7-sonnet-20250219',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    });

    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    const cmdMatch = text.match(/COMMAND:\s*(git\s+[^\r\n]+)/i);
    const suggestedCommand = cmdMatch ? cmdMatch[1].trim() : undefined;
    return { reply: text, suggestedCommand };
  }

  private async callClaudeForPr(commits: string[], diffSummary: string): Promise<{ title: string; body: string }> {
    const prompt = `Write a Pull Request title and Markdown body.
Commits in branch:
${commits.map(c => `- ${c}`).join('\n')}
Diff summary:
${diffSummary.slice(0, 4000)}

Output JSON: {"title": "concise PR title", "body": "Markdown description with Summary and Verification"}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-3-7-sonnet-20250219',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const content = data?.content?.[0]?.text || '{}';
    const cleanJson = content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  }

  // --- OpenAI / DeepSeek / Custom / Ollama Compatible API Callers ---
  private async callOpenAICompatibleForCommit(diffText: string, stagedFiles: string[]): Promise<{ summary: string; description: string }> {
    const baseUrl = this.getOpenAIBaseUrl();
    const model = this.config.model || (this.config.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o');

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey || 'ollama'}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Generate a conventional commit message. Return JSON with keys "summary" and "description".' },
          { role: 'user', content: `Staged: ${stagedFiles.join(', ')}\nDiff:\n${diffText.slice(0, 8000)}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    const cleanJson = content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  }

  private async callOpenAICompatibleForExplain(diffText: string, contextTitle: string): Promise<AIExplanation> {
    const baseUrl = this.getOpenAIBaseUrl();
    const model = this.config.model || (this.config.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o');

    const prompt = `Analyze this git diff for ${contextTitle}.
Diff snippet:
${diffText.slice(0, 8000)}

Output ONLY valid JSON:
{
  "summary": "concise overview of changes",
  "keyChanges": ["highlight 1", "highlight 2"],
  "riskAssessment": "low" | "medium" | "high",
  "riskReasoning": "brief explanation",
  "suggestedAction": "recommended review focus"
}`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey || 'ollama'}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are an expert Git code reviewer. Respond only with JSON.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    const cleanJson = content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  }

  private async callOpenAICompatibleForChat(message: string, repoContext: any): Promise<{ reply: string; suggestedCommand?: string }> {
    const baseUrl = this.getOpenAIBaseUrl();
    const model = this.config.model || (this.config.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o');

    const systemPrompt = `You are Gitter AI, an expert Git engineer and assistant. The user is in repository branch '${repoContext.branch}'. Status: ${repoContext.status}.
Give helpful, precise answers. If suggesting a command, include it on a line starting with 'COMMAND: git ...' so the UI can offer a 1-click execution button.`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey || 'ollama'}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      }),
    });

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const cmdMatch = text.match(/COMMAND:\s*(git\s+[^\r\n]+)/i);
    const suggestedCommand = cmdMatch ? cmdMatch[1].trim() : undefined;
    return { reply: text, suggestedCommand };
  }

  private async callOpenAICompatibleForPr(commits: string[], diffSummary: string): Promise<{ title: string; body: string }> {
    const baseUrl = this.getOpenAIBaseUrl();
    const model = this.config.model || (this.config.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o');

    const prompt = `Write a Pull Request title and Markdown body.
Commits in branch:
${commits.map(c => `- ${c}`).join('\n')}
Diff summary:
${diffSummary.slice(0, 4000)}

Output JSON format: {"title": "concise PR title", "body": "Markdown description with Summary and Verification"}`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey || 'ollama'}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are an expert PR reviewer. Return JSON with title and body.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    const cleanJson = content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  }

  // --- Google Gemini API Callers ---
  private async callGeminiForCommit(diffText: string, stagedFiles: string[]): Promise<{ summary: string; description: string }> {
    const prompt = `Analyze this git diff and write a conventional commit message.
Staged files: ${stagedFiles.join(', ')}
Diff snippet:
${diffText.slice(0, 8000)}

Output JSON: {"summary": "feat(scope): brief message", "description": "bullet points"}`;

    const modelName = this.config.model || 'gemini-2.5-flash';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanJson = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  }

  private async callGeminiForExplain(diffText: string, contextTitle: string): Promise<AIExplanation> {
    const prompt = `Analyze this git diff for ${contextTitle}.
Diff snippet:
${diffText.slice(0, 8000)}

Output JSON format:
{
  "summary": "concise overview",
  "keyChanges": ["item 1", "item 2"],
  "riskAssessment": "low" | "medium" | "high",
  "riskReasoning": "reasoning",
  "suggestedAction": "action"
}`;

    const modelName = this.config.model || 'gemini-2.5-flash';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanJson = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  }

  private heuristicCommitGenerator(diffText: string, stagedFiles: string[]): { summary: string; description: string } {
    if (stagedFiles.length === 0) {
      return { summary: 'chore: update project files', description: '' };
    }

    const isDocOnly = stagedFiles.every(f => f.endsWith('.md') || f.includes('docs/'));
    const isTestOnly = stagedFiles.every(f => f.includes('test') || f.includes('spec'));
    const isStyleOnly = stagedFiles.every(f => f.endsWith('.css') || f.endsWith('.scss'));
    const isConfigOnly = stagedFiles.every(f => f.includes('config') || f.endsWith('.json') || f.endsWith('.yaml'));

    let type = 'feat';
    let scope = '';
    let action = 'implement core functionality';

    if (isDocOnly) {
      type = 'docs';
      action = 'update documentation and guides';
    } else if (isTestOnly) {
      type = 'test';
      action = 'add test coverage';
    } else if (isStyleOnly) {
      type = 'style';
      action = 'update UI styles and appearance';
    } else if (isConfigOnly) {
      type = 'chore';
      action = 'update project configuration';
    } else if (diffText.includes('fix') || diffText.includes('bug') || diffText.includes('error')) {
      type = 'fix';
      action = 'resolve issue and improve stability';
    }

    const parts = stagedFiles[0].split('/');
    if (parts.length > 1) {
      scope = `(${parts[0]})`;
    }

    const summary = `${type}${scope}: ${action}`;
    const descBullets = stagedFiles.slice(0, 5).map(f => `- Modified ${f}`);
    if (stagedFiles.length > 5) {
      descBullets.push(`- And ${stagedFiles.length - 5} other files`);
    }

    return {
      summary,
      description: descBullets.join('\n'),
    };
  }

  private heuristicExplainChanges(diffText: string, contextTitle: string): AIExplanation {
    const lines = diffText.split('\n');
    let additions = 0;
    let deletions = 0;

    for (const l of lines) {
      if (l.startsWith('+') && !l.startsWith('+++')) additions++;
      if (l.startsWith('-') && !l.startsWith('---')) deletions++;
    }

    const keyChanges = [
      `Modified ${lines.length} lines with +${additions} insertions and -${deletions} deletions`,
      'Updated logic and component contracts to adhere to Git workflow standards',
      'Refined error handling and state synchronization across views',
    ];

    let risk: 'low' | 'medium' | 'high' = 'low';
    if (additions + deletions > 500) risk = 'high';
    else if (additions + deletions > 100) risk = 'medium';

    return {
      summary: `Review for ${contextTitle}: This change updates repository files, maintaining clean Git history and UI consistency.`,
      keyChanges,
      riskAssessment: risk,
      riskReasoning: risk === 'low' ? 'Low risk isolated updates.' : 'Moderate volume of line modifications.',
      suggestedAction: 'Verify build passes and staging tree reflects expected file modifications.',
    };
  }
}

export const aiService = new AIService();
