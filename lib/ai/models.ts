import type { ModelDefinition, ModelProviderFamily } from '@/lib/types';

export const DEFAULT_MODEL_ID = 'anthropic/claude-sonnet-5.5';
export const DEFAULT_OPENAI_MODEL_ID = 'openai/gpt-6.2-sol';
export const FAST_MODEL_ID = 'anthropic/claude-haiku-5.5';
export const FAST_OPENAI_MODEL_ID = 'openai/gpt-6-luna';

export const IMAGE_GATEWAY_MODEL_ID = 'google/gemini-3.1-flash-image';
export const IMAGE_OPENAI_MODEL_ID = 'openai/gpt-image-2';
export const STT_MODEL_ID = 'openai/gpt-transcribe';
export const TTS_MODEL_ID = 'openai/tts-1';
export const REALTIME_MODEL_ID = 'openai/gpt-realtime-2';
export const REALTIME_OPENAI_DIRECT_MODEL_ID = 'gpt-realtime';

export const GATEWAY_REALTIME_MODEL_IDS = [
  'openai/gpt-realtime-2',
  'openai/gpt-realtime-2.1',
  'openai/gpt-realtime-1.5',
  'openai/gpt-realtime-mini',
  'openai/gpt-live-1',
  'google/gemini-3.8-live',
  'google/gemini-3.8-live-extended-thinking',
  'spacexai/grok-voice-3.0',
  'elevenlabs/eleven-realtime-v1-max',
  'elevenlabs/eleven-realtime-v1-mini',
] as const;

const GATEWAY_REALTIME_MODEL_SET = new Set<string>(GATEWAY_REALTIME_MODEL_IDS);

export const MODEL_CATALOG: readonly ModelDefinition[] = [
  // Anthropic
  {
    id: 'anthropic/claude-sonnet-5.5',
    name: 'Claude Sonnet 5.5',
    provider: 'anthropic',
    description:
      'Balanced frontier reasoning, coding, and agentic tool use. Default ADE workhorse.',
    contextWindow: 1_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'balanced',
    inputCostPerMillion: 2.0,
    outputCostPerMillion: 10.0,
  },
  {
    id: 'anthropic/claude-opus-5.5',
    name: 'Claude Opus 5.5',
    provider: 'anthropic',
    description:
      'Deepest Anthropic architecture and multi-step engineering model with extended reasoning.',
    contextWindow: 1_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'flagship',
    inputCostPerMillion: 4.0,
    outputCostPerMillion: 20.0,
  },
  {
    id: 'anthropic/claude-haiku-5.5',
    name: 'Claude Haiku 5.5',
    provider: 'anthropic',
    description: 'Ultra-low-latency Anthropic model ideal for fast edits, routing, and summaries.',
    contextWindow: 1_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'fast',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.5,
  },

  // OpenAI
  {
    id: 'openai/gpt-6.2-sol',
    openaiDirectId: 'gpt-6.2-sol',
    name: 'GPT-6.2 Sol',
    provider: 'openai',
    description: 'OpenAI flagship balanced model with strong multimodal, tool, and coding craft.',
    contextWindow: 1_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'balanced',
    inputCostPerMillion: 2.0,
    outputCostPerMillion: 10.0,
  },
  {
    id: 'openai/gpt-6.2-astra',
    openaiDirectId: 'gpt-6.2-astra',
    name: 'GPT-6.2 Astra',
    provider: 'openai',
    description:
      'Maximum-capability OpenAI reasoning model for complex systems design and debugging.',
    contextWindow: 1_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'flagship',
    inputCostPerMillion: 8.0,
    outputCostPerMillion: 40.0,
  },
  {
    id: 'openai/gpt-6.1-terra',
    openaiDirectId: 'gpt-6.1-terra',
    name: 'GPT-6.1 Terra',
    provider: 'openai',
    description: 'Cost-efficient everyday OpenAI reasoning and tool-calling model.',
    contextWindow: 1_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'balanced',
    inputCostPerMillion: 1.0,
    outputCostPerMillion: 5.0,
  },
  {
    id: 'openai/gpt-6-luna',
    openaiDirectId: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    provider: 'openai',
    description: 'Blazing-fast lightweight OpenAI model for instant replies, titles, and triage.',
    contextWindow: 1_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'fast',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.5,
  },
  {
    id: 'openai/gpt-5.3-codex',
    openaiDirectId: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    provider: 'openai',
    description: 'Purpose-built OpenAI software engineering model tuned for shell & repo loops.',
    contextWindow: 400_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'coding',
    inputCostPerMillion: 1.5,
    outputCostPerMillion: 6.0,
  },

  // Google
  {
    id: 'google/gemini-4-carbon',
    name: 'Gemini 4 Carbon',
    provider: 'google',
    description: 'Google flagship 2M-context multimodal reasoning and synthesis model.',
    contextWindow: 2_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'flagship',
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
  },
  {
    id: 'google/gemini-4-argon',
    name: 'Gemini 4 Argon',
    provider: 'google',
    description: 'Balanced 2M-context Gemini 4 model for long-repo exploration and UI generation.',
    contextWindow: 2_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'balanced',
    inputCostPerMillion: 2.0,
    outputCostPerMillion: 10.0,
  },
  {
    id: 'google/gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    provider: 'google',
    description:
      'Efficiency-tuned 2M-context Gemini 4 model for fast multi-file analysis and coding.',
    contextWindow: 2_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'balanced',
    inputCostPerMillion: 1.5,
    outputCostPerMillion: 7.5,
  },
  {
    id: 'google/gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'google',
    description:
      'High-speed multimodal Gemini model supporting vision, audio, and dense documents.',
    contextWindow: 1_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning', 'audio'],
    tier: 'fast',
    inputCostPerMillion: 0.75,
    outputCostPerMillion: 3.75,
  },

  // SpaceXAI
  {
    id: 'spacexai/grok-4.7',
    name: 'Grok 4.7',
    provider: 'spacexai',
    description: 'Sharp technical reasoning and tool execution from SpaceXAI.',
    contextWindow: 500_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'balanced',
    inputCostPerMillion: 2.0,
    outputCostPerMillion: 6.0,
  },
  {
    id: 'spacexai/grok-4.20-multi-agent',
    name: 'Grok 4.20 Multi-Agent',
    provider: 'spacexai',
    description:
      '2M-context multi-agent Grok architecture for parallel synthesis and investigation.',
    contextWindow: 2_000_000,
    capabilities: ['text', 'vision', 'file-input', 'tools', 'reasoning'],
    tier: 'flagship',
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 2.5,
  },
] as const;

const MODEL_BY_ID = new Map<string, ModelDefinition>(
  MODEL_CATALOG.map((model) => [model.id, model]),
);

const MODEL_BY_DIRECT_ID = new Map<string, ModelDefinition>(
  MODEL_CATALOG.filter((m) => m.openaiDirectId).map((model) => [
    model.openaiDirectId as string,
    model,
  ]),
);

const DIRECT_OPENAI_PREFIX_RE = /^(gpt-|o[134](?:-|$)|chatgpt-|whisper-|tts-|dall-e-)/i;

/** Look up a curated model definition by Gateway ID or direct OpenAI ID. */
export function getModelDefinition(id?: string | null): ModelDefinition | undefined {
  if (!id) {
    return undefined;
  }
  const normalized = id.trim();
  return MODEL_BY_ID.get(normalized) ?? MODEL_BY_DIRECT_ID.get(normalized);
}

/** Check whether a model ID targets OpenAI (either `openai/...` or unprefixed OpenAI ID). */
export function isOpenAIModelId(modelId: string): boolean {
  const normalized = modelId.trim();
  if (!normalized) {
    return false;
  }
  if (normalized.startsWith('openai/')) {
    return true;
  }
  if (normalized.includes('/')) {
    return false;
  }
  return DIRECT_OPENAI_PREFIX_RE.test(normalized);
}

/** Strip a leading `provider/` prefix from a Gateway model ID. */
export function stripProviderPrefix(modelId: string): string {
  const trimmed = modelId.trim();
  const slashIndex = trimmed.indexOf('/');
  return slashIndex === -1 ? trimmed : trimmed.slice(slashIndex + 1);
}

/**
 * Convert any model ID into a direct OpenAI API model ID when routing via `OPENAI_API_KEY`.
 * - `openai/gpt-6.2-sol` -> `gpt-6.2-sol`
 * - `gpt-5.4` -> `gpt-5.4`
 * - Non-OpenAI models -> gracefully mapped by tier (`gpt-6-luna` for fast, `gpt-6.2-sol` otherwise).
 */
export function toOpenAIDirectModelId(modelId?: string | null): string {
  if (!modelId?.trim()) {
    return stripProviderPrefix(DEFAULT_OPENAI_MODEL_ID);
  }

  const trimmed = modelId.trim();
  const catalogEntry = getModelDefinition(trimmed);

  if (catalogEntry?.openaiDirectId) {
    return catalogEntry.openaiDirectId;
  }

  if (trimmed.startsWith('openai/')) {
    return trimmed.slice('openai/'.length);
  }

  if (!trimmed.includes('/') && DIRECT_OPENAI_PREFIX_RE.test(trimmed)) {
    return trimmed;
  }

  if (catalogEntry?.tier === 'fast' || /haiku|flash|mini|lite|nano/i.test(trimmed)) {
    return stripProviderPrefix(FAST_OPENAI_MODEL_ID);
  }

  if (catalogEntry?.tier === 'coding' || /codex|coder/i.test(trimmed)) {
    return 'gpt-5.3-codex';
  }

  return stripProviderPrefix(DEFAULT_OPENAI_MODEL_ID);
}

/**
 * Coerce any requested model ID to a verified Vercel AI Gateway Realtime model ID.
 * Non-realtime chat models (e.g. `anthropic/claude-sonnet-5.5`, `openai/gpt-6.2-sol`)
 * are always coerced to `openai/gpt-realtime-2`.
 */
export function toGatewayRealtimeModelId(modelId?: string | null): string {
  const trimmed = modelId?.trim();
  if (!trimmed) {
    return REALTIME_MODEL_ID;
  }
  if (GATEWAY_REALTIME_MODEL_SET.has(trimmed)) {
    return trimmed;
  }
  return REALTIME_MODEL_ID;
}

/**
 * Coerce any requested model ID to a verified direct OpenAI Realtime model ID (`gpt-realtime`).
 */
export function toOpenAIDirectRealtimeModelId(modelId?: string | null): string {
  const trimmed = modelId?.trim();
  if (trimmed === REALTIME_OPENAI_DIRECT_MODEL_ID || trimmed === 'openai/gpt-realtime') {
    return REALTIME_OPENAI_DIRECT_MODEL_ID;
  }
  return REALTIME_OPENAI_DIRECT_MODEL_ID;
}

/** Group curated catalog entries by provider family for model picker UIs. */
export function getModelsByProvider(): Record<
  Exclude<ModelProviderFamily, 'custom'>,
  ModelDefinition[]
> {
  const grouped: Record<Exclude<ModelProviderFamily, 'custom'>, ModelDefinition[]> = {
    anthropic: [],
    openai: [],
    google: [],
    spacexai: [],
  };

  for (const model of MODEL_CATALOG) {
    if (model.provider !== 'custom') {
      grouped[model.provider].push(model);
    }
  }

  return grouped;
}

/** Estimate USD cost for token usage if the model has pricing metadata in the catalog. */
export function estimateTokenCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const model = getModelDefinition(modelId);
  if (
    !model ||
    model.inputCostPerMillion === undefined ||
    model.outputCostPerMillion === undefined
  ) {
    return undefined;
  }

  const inputCost = (Math.max(0, inputTokens) / 1_000_000) * model.inputCostPerMillion;
  const outputCost = (Math.max(0, outputTokens) / 1_000_000) * model.outputCostPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}
