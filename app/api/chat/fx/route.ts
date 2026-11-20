import { pipeJsonRender } from '@json-render/core';
import { metric } from '@vercel/functions';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type UIMessage,
  type UIMessageChunk,
  validateUIMessages,
} from 'ai';
import type { FxSessionImageBlock, FxSessionPromptInput, FxTextBlock } from 'libfx/node';
import { after, NextResponse } from 'next/server';
import { invalidateVercelGatewayCreditsCache, isUserTokenBillingError } from '@/lib/ai/credits';
import { estimateTokenCostUsd } from '@/lib/ai/models';
import {
  ProviderNotConfiguredError,
  type ProviderOverrideInput,
  resolveFxCredentials,
  resolveLanguageModel,
  type UserVercelAuth,
} from '@/lib/ai/provider';
import { buildFxSystemPrompt } from '@/lib/ai/system-prompt';
import { getServerSession, updateVercelTokens } from '@/lib/auth/session';
import { ensureChat, getChatById, saveMessages, updateChat } from '@/lib/db/queries';
import { createFxFallbackAiTools, runFxTurn } from '@/lib/harnesses/fx';
import { safeExternalFetch } from '@/lib/sandbox/browser-service';
import { getActiveTier, listFiles } from '@/lib/sandbox/manager';
import type { ChatRequestBody, MessageMetadata, SandboxTier } from '@/lib/types';
import { generateId, truncateText } from '@/lib/utils';

export const maxDuration = 300;

const SUPPORTED_FX_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_IMAGE_FETCH_BYTES = 8 * 1024 * 1024; // 8 MB cap per attached image

interface ExtendedFxRequestBody extends ChatRequestBody {
  sandboxTier?: SandboxTier;
  customBaseUrl?: string;
  customApiKey?: string;
  customModel?: string;
  byokApiKey?: string;
}

function mergeProviderOverride(body: ExtendedFxRequestBody): ProviderOverrideInput | undefined {
  const base = body.providerOverride ?? {};
  const merged: ProviderOverrideInput = {
    ...base,
    ...(body.customBaseUrl ? { customBaseUrl: body.customBaseUrl } : {}),
    ...(body.customApiKey ? { customApiKey: body.customApiKey } : {}),
    ...(body.customModel ? { customModel: body.customModel } : {}),
    ...(body.byokApiKey ? { byokApiKey: body.byokApiKey } : {}),
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

async function readResponseBytesBounded(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!response.body) {
    const ab = await response.arrayBuffer();
    return ab.byteLength <= maxBytes ? new Uint8Array(ab) : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function resolveFxImageBlock(
  url: string,
  mediaType: string,
): Promise<FxSessionImageBlock | null> {
  const normalizedMime = mediaType.toLowerCase().split(';')[0].trim();
  if (!SUPPORTED_FX_IMAGE_MIMES.has(normalizedMime)) {
    return null;
  }

  const dataUriMatch = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(url.trim());
  if (dataUriMatch) {
    const b64 = dataUriMatch[2].replace(/\s+/g, '');
    if (b64.length > 0 && b64.length <= Math.ceil((MAX_IMAGE_FETCH_BYTES * 4) / 3)) {
      return {
        type: 'image',
        data: b64,
        mimeType: normalizedMime,
      };
    }
    return null;
  }

  if (url.startsWith('https://') || url.startsWith('http://')) {
    try {
      const { response } = await safeExternalFetch(url, {
        method: 'GET',
        maxRedirects: 3,
        timeoutMs: 8_000,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      const bytes = await readResponseBytesBounded(response, MAX_IMAGE_FETCH_BYTES);
      if (!bytes || bytes.byteLength === 0) {
        return null;
      }
      return {
        type: 'image',
        data: Buffer.from(bytes).toString('base64'),
        mimeType: normalizedMime,
      };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Extracts text AND multimodal image file attachments from the latest user message
 * into native `libfx` `FxSessionPromptInput` blocks.
 */
async function extractUserPromptInput(messages: UIMessage<MessageMetadata>[]): Promise<{
  promptInput: FxSessionPromptInput | null;
  plainText: string;
}> {
  const lastUser = [...messages].reverse().find((msg) => msg.role === 'user');
  if (!lastUser) {
    return { promptInput: null, plainText: '' };
  }

  const blocks: Array<FxTextBlock | FxSessionImageBlock> = [];
  const textSegments: string[] = [];

  for (const part of lastUser.parts) {
    if (part.type === 'text' && part.text.trim()) {
      textSegments.push(part.text);
      blocks.push({ type: 'text', text: part.text });
    } else if (part.type === 'file' && typeof part.url === 'string' && part.mediaType) {
      const imageBlock = await resolveFxImageBlock(part.url, part.mediaType);
      if (imageBlock) {
        blocks.push(imageBlock);
      }
    }
  }

  const plainText = textSegments.join('\n').trim();
  if (blocks.length === 0) {
    return { promptInput: null, plainText: '' };
  }

  const hasImages = blocks.some((block) => block.type === 'image');
  if (!hasImages) {
    return { promptInput: plainText, plainText };
  }

  return {
    promptInput: blocks,
    plainText: plainText || 'Attached image',
  };
}

function parseJsonOrString(raw?: string): unknown {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now();

  try {
    const body = (await request.json().catch(() => null)) as ExtendedFxRequestBody | null;
    if (!body || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: 'Invalid request body: expected "messages" array.' },
        { status: 400 },
      );
    }

    const session = await getServerSession(request.headers);
    const chatId = body.id?.trim() || generateId('chat');

    if (body.id?.trim()) {
      const existing = await getChatById(chatId);
      if (existing && existing.userId !== session.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const override = mergeProviderOverride(body);

    const userVercelAuth: UserVercelAuth | undefined = session.vercelAuth
      ? {
          accessToken: session.vercelAuth.accessToken,
          refreshToken: session.vercelAuth.refreshToken,
          expiresAt: session.vercelAuth.expiresAt,
          providerId: session.vercelAuth.providerId,
          onRefreshed: async (tokens) => {
            await updateVercelTokens(session.userId, {
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              expiresAt: tokens.expiresAt,
              providerId: session.vercelAuth?.providerId,
            });
          },
        }
      : undefined;

    let creds = await resolveFxCredentials({
      modelId: body.modelId,
      override,
      userVercelAuth,
    });

    const chatRecord = await ensureChat({
      id: chatId,
      userId: session.userId,
      modelId: creds.modelId,
      harnessMode: 'fx',
    });

    if (chatRecord.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const validatedMessages = await validateUIMessages<UIMessage<MessageMetadata>>({
      messages: body.messages,
    });

    const { promptInput, plainText: promptText } = await extractUserPromptInput(validatedMessages);
    if (!promptInput) {
      return NextResponse.json(
        { error: 'Cannot run fx harness without a user prompt or image attachment.' },
        { status: 400 },
      );
    }

    const effectiveSandboxTier = body.sandboxTier ?? getActiveTier(chatId);
    const workspaceFiles = (await listFiles(chatId, effectiveSandboxTier).catch(() => [])).map(
      (f) => f.path,
    );

    const latestUserMessage = [...validatedMessages].reverse().find((msg) => msg.role === 'user');

    let finalAssistantMessage: UIMessage<MessageMetadata> | null = null;
    const recordedNativeParts: Array<Record<string, unknown>> = [];
    let activeBillingSource = creds.billingSource;
    let activeModelId = creds.modelId;
    let activeBillingLabel = creds.billingInfo.label;
    let fxTransportLabel = 'libfx-durable';

    const uiStream = createUIMessageStream<UIMessage<MessageMetadata>>({
      originalMessages: validatedMessages,
      execute: async ({ writer }) => {
        let emittedAnyEvent = false;
        let textPartOpen = false;
        let reasoningPartOpen = false;
        let stepCounter = 0;
        let textPartId = 'fx-text-0';
        let reasoningPartId = 'fx-reasoning-0';
        let currentTextBuf = '';
        let currentReasoningBuf = '';
        const recordedToolIndexById = new Map<string, number>();

        const flushTextPart = () => {
          if (textPartOpen) {
            writer.write({ type: 'text-end', id: textPartId });
            if (currentTextBuf) {
              recordedNativeParts.push({ type: 'text', text: currentTextBuf, state: 'done' });
            }
            currentTextBuf = '';
            textPartOpen = false;
          }
        };

        const flushReasoningPart = () => {
          if (reasoningPartOpen) {
            writer.write({ type: 'reasoning-end', id: reasoningPartId });
            if (currentReasoningBuf) {
              recordedNativeParts.push({
                type: 'reasoning',
                text: currentReasoningBuf,
                state: 'done',
              });
            }
            currentReasoningBuf = '';
            reasoningPartOpen = false;
          }
        };

        const runNativeFx = async (activeCreds: typeof creds) => {
          let framingStarted = false;
          const ensureFramingStarted = () => {
            if (framingStarted) return;
            framingStarted = true;
            writer.write({
              type: 'start',
              messageMetadata: {
                createdAt: new Date().toISOString(),
                modelId: activeCreds.modelId,
                harnessMode: 'fx',
                billingSource: activeCreds.billingSource,
                billingLabel: activeCreds.billingInfo.label,
              },
            });
            writer.write({ type: 'start-step' });
          };

          const outcome = await runFxTurn({
            chatId,
            userId: session.userId,
            prompt: promptInput,
            credentials: activeCreds,
            sandboxTier: effectiveSandboxTier,
            workspaceFiles,
            signal: request.signal,
            onEvent: (event) => {
              emittedAnyEvent = true;
              ensureFramingStarted();

              if (event.type === 'reasoning_delta') {
                flushTextPart();
                if (!reasoningPartOpen) {
                  stepCounter += 1;
                  reasoningPartId = `fx-reasoning-${stepCounter}`;
                  currentReasoningBuf = '';
                  writer.write({ type: 'reasoning-start', id: reasoningPartId });
                  reasoningPartOpen = true;
                }
                currentReasoningBuf += event.delta;
                writer.write({
                  type: 'reasoning-delta',
                  id: reasoningPartId,
                  delta: event.delta,
                });
                return;
              }

              if (event.type === 'text_delta') {
                flushReasoningPart();
                if (!textPartOpen) {
                  stepCounter += 1;
                  textPartId = `fx-text-${stepCounter}`;
                  currentTextBuf = '';
                  writer.write({ type: 'text-start', id: textPartId });
                  textPartOpen = true;
                }
                currentTextBuf += event.delta;
                writer.write({
                  type: 'text-delta',
                  id: textPartId,
                  delta: event.delta,
                });
                return;
              }

              if (event.type === 'tool_start') {
                flushReasoningPart();
                flushTextPart();
                const parsedInput = event.inputTruncated
                  ? { preview: event.inputPreview }
                  : (event.input ?? {});

                writer.write({
                  type: 'tool-input-available',
                  toolCallId: event.id,
                  toolName: event.name,
                  input: parsedInput,
                  dynamic: true,
                });

                recordedToolIndexById.set(event.id, recordedNativeParts.length);
                recordedNativeParts.push({
                  type: 'dynamic-tool',
                  toolName: event.name,
                  toolCallId: event.id,
                  state: 'input-available',
                  input: parsedInput,
                });
                return;
              }

              if (event.type === 'tool_end') {
                const idx = recordedToolIndexById.get(event.id);
                if (event.isError) {
                  const errorText = event.content ?? 'Tool execution failed.';
                  writer.write({
                    type: 'tool-output-error',
                    toolCallId: event.id,
                    errorText,
                    dynamic: true,
                  });
                  if (idx !== undefined && recordedNativeParts[idx]) {
                    recordedNativeParts[idx] = {
                      ...recordedNativeParts[idx],
                      state: 'output-error',
                      errorText,
                    };
                  }
                } else {
                  const parsedOutput = parseJsonOrString(event.content);
                  writer.write({
                    type: 'tool-output-available',
                    toolCallId: event.id,
                    output: parsedOutput,
                    dynamic: true,
                  });
                  if (idx !== undefined && recordedNativeParts[idx]) {
                    recordedNativeParts[idx] = {
                      ...recordedNativeParts[idx],
                      state: 'output-available',
                      output: parsedOutput,
                    };
                  }
                }
              }
            },
          });

          fxTransportLabel = outcome.transport;
          ensureFramingStarted();
          flushReasoningPart();
          flushTextPart();
          writer.write({ type: 'finish-step' });

          const inputTokens = outcome.result.usage?.inputTokens ?? 0;
          const outputTokens = outcome.result.usage?.outputTokens ?? 0;
          const totalTokens = inputTokens + outputTokens;

          writer.write({
            type: 'finish',
            finishReason: outcome.result.stopReason === 'error' ? 'error' : 'stop',
            messageMetadata: {
              createdAt: new Date().toISOString(),
              modelId: activeCreds.modelId,
              harnessMode: 'fx',
              billingSource: activeCreds.billingSource,
              billingLabel: activeCreds.billingInfo.label,
              latencyMs: Math.round(performance.now() - startedAt),
              ...(totalTokens > 0
                ? {
                    usage: {
                      inputTokens,
                      outputTokens,
                      totalTokens,
                      reasoningTokens: outcome.result.usage?.reasoningTokens,
                      cacheReadTokens: outcome.result.usage?.cacheReadTokens,
                      estimatedCostUsd: estimateTokenCostUsd(
                        activeCreds.modelId,
                        inputTokens,
                        outputTokens,
                      ),
                    },
                  }
                : {}),
            },
          });
        };

        try {
          await runNativeFx(creds);
        } catch (fxError) {
          // Tier 2 -> Tier 3+ retry if Vercel OAuth token failed before any output.
          if (
            !emittedAnyEvent &&
            creds.billingSource === 'user-vercel-oauth' &&
            userVercelAuth?.accessToken &&
            isUserTokenBillingError(fxError)
          ) {
            invalidateVercelGatewayCreditsCache(userVercelAuth.accessToken);
            creds = await resolveFxCredentials({
              modelId: body.modelId,
              override,
              userVercelAuth,
              skipUserToken: true,
            });
            activeBillingSource = creds.billingSource;
            activeModelId = creds.modelId;
            activeBillingLabel = creds.billingInfo.label;
            try {
              await runNativeFx(creds);
              return;
            } catch {
              // Fall through to AI SDK 7 fx-compatible fallback below.
            }
          }

          if (emittedAnyEvent) {
            throw fxError;
          }

          // Clean fallback: run the exact same fx coding toolset on AI SDK 7 streamText
          // so custom endpoints or environments without libfx native/WASM never fail.
          fxTransportLabel = 'ai-sdk-fx-fallback';
          const fallbackResolved = await resolveLanguageModel({
            modelId: body.modelId,
            override,
            userVercelAuth,
            skipUserToken: creds.billingSource !== 'user-vercel-oauth',
          });
          activeBillingSource = fallbackResolved.billingSource;
          activeModelId = fallbackResolved.modelId;
          activeBillingLabel = fallbackResolved.billingInfo.label;

          const fallbackTools = createFxFallbackAiTools({
            chatId,
            userId: session.userId,
            sandboxTier: effectiveSandboxTier,
          });
          const modelMessages = await convertToModelMessages(validatedMessages, {
            tools: fallbackTools,
            ignoreIncompleteToolCalls: true,
          });

          const fallbackResult = streamText({
            model: fallbackResolved.model,
            instructions: buildFxSystemPrompt(workspaceFiles),
            messages: modelMessages,
            tools: fallbackTools,
            stopWhen: isStepCount(16),
          });

          const fallbackUiStream = pipeJsonRender(
            fallbackResult.toUIMessageStream<UIMessage<MessageMetadata>>({
              originalMessages: validatedMessages,
              sendReasoning: true,
              messageMetadata: ({ part }): MessageMetadata | undefined => {
                if (part.type === 'start' || part.type === 'finish') {
                  return {
                    createdAt: new Date().toISOString(),
                    modelId: fallbackResolved.modelId,
                    harnessMode: 'fx',
                    billingSource: fallbackResolved.billingSource,
                    billingLabel: fallbackResolved.billingInfo.label,
                    ...(part.type === 'finish'
                      ? { latencyMs: Math.round(performance.now() - startedAt) }
                      : {}),
                  };
                }
                return undefined;
              },
            }) as unknown as ReadableStream<UIMessageChunk>,
          );

          writer.merge(fallbackUiStream as unknown as Parameters<typeof writer.merge>[0]);
        }
      },
      onEnd: ({ responseMessage }) => {
        finalAssistantMessage = responseMessage;
      },
    });

    after(async () => {
      try {
        const durationMs = Math.round(performance.now() - startedAt);
        metric('ade.chat.requests', 1, {
          harness: 'fx',
          billing_source: activeBillingSource,
          outcome: 'ok',
        });
        metric('ade.chat.duration_ms', durationMs, { harness: 'fx' });

        const toSave: Parameters<typeof saveMessages>[1] = [];
        if (latestUserMessage) {
          toSave.push({
            id: latestUserMessage.id || generateId('msg'),
            chatId,
            role: 'user',
            parts: latestUserMessage.parts,
            metadata: latestUserMessage.metadata ?? null,
          });
        }

        const assistantParts =
          finalAssistantMessage && finalAssistantMessage.parts.length >= recordedNativeParts.length
            ? finalAssistantMessage.parts
            : recordedNativeParts.length > 0
              ? recordedNativeParts
              : (finalAssistantMessage?.parts ?? []);

        if (assistantParts.length > 0) {
          toSave.push({
            id: finalAssistantMessage?.id || generateId('msg'),
            chatId,
            role: 'assistant',
            parts: assistantParts,
            metadata: {
              ...(finalAssistantMessage?.metadata ?? {}),
              modelId: activeModelId,
              harnessMode: 'fx',
              billingSource: activeBillingSource,
              billingLabel: activeBillingLabel,
              latencyMs: durationMs,
            },
          });
        }

        if (toSave.length > 0) {
          await saveMessages(chatId, toSave);
        }

        const existingChat = await getChatById(chatId);
        if (existingChat && existingChat.title === 'New chat' && promptText) {
          await updateChat(chatId, {
            title: truncateText(promptText.replace(/\s+/g, ' '), 56),
            modelId: activeModelId,
            harnessMode: 'fx',
          });
        }
      } catch {
        // Persistence and telemetry are best-effort in after().
      }
    });

    return createUIMessageStreamResponse({
      stream: uiStream,
      headers: {
        'X-Ade-Chat-Id': chatId,
        'X-Ade-Harness': 'fx',
        'X-Ade-Fx-Transport': fxTransportLabel,
        'X-Ade-Model-Id': activeModelId,
        'X-Ade-Billing-Source': activeBillingSource,
      },
    });
  } catch (error) {
    try {
      metric('ade.chat.requests', 1, {
        harness: 'fx',
        billing_source: 'unconfigured',
        outcome: 'error',
      });
    } catch {
      // Best-effort telemetry.
    }

    if (error instanceof ProviderNotConfiguredError) {
      return NextResponse.json(
        { error: error.message, code: error.code, billingSource: error.billingSource },
        { status: 503 },
      );
    }

    const message = error instanceof Error ? error.message : 'fx harness failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
