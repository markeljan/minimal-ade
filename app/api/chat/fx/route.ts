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
import { getActiveTier, listFiles } from '@/lib/sandbox/manager';
import type { ChatRequestBody, MessageMetadata, SandboxTier } from '@/lib/types';
import { generateId, truncateText } from '@/lib/utils';

export const maxDuration = 300;

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

function extractUserPromptText(messages: UIMessage<MessageMetadata>[]): string {
  const lastUser = [...messages].reverse().find((msg) => msg.role === 'user');
  if (!lastUser) {
    return '';
  }
  return lastUser.parts
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
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

    const promptText = extractUserPromptText(validatedMessages);
    if (!promptText) {
      return NextResponse.json(
        { error: 'Cannot run fx harness without a user prompt.' },
        { status: 400 },
      );
    }

    const effectiveSandboxTier = body.sandboxTier ?? getActiveTier(chatId);
    const workspaceFiles = (await listFiles(chatId, effectiveSandboxTier).catch(() => [])).map(
      (f) => f.path,
    );

    const latestUserMessage = [...validatedMessages].reverse().find((msg) => msg.role === 'user');

    let finalAssistantMessage: UIMessage<MessageMetadata> | null = null;
    let activeBillingSource = creds.billingSource;
    let activeModelId = creds.modelId;
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

        const closeOpenText = () => {
          if (textPartOpen) {
            writer.write({ type: 'text-end', id: textPartId });
            textPartOpen = false;
          }
        };

        const closeOpenReasoning = () => {
          if (reasoningPartOpen) {
            writer.write({ type: 'reasoning-end', id: reasoningPartId });
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
            prompt: promptText,
            credentials: activeCreds,
            sandboxTier: effectiveSandboxTier,
            workspaceFiles,
            signal: request.signal,
            onEvent: (event) => {
              emittedAnyEvent = true;
              ensureFramingStarted();

              if (event.type === 'reasoning_delta') {
                closeOpenText();
                if (!reasoningPartOpen) {
                  stepCounter += 1;
                  reasoningPartId = `fx-reasoning-${stepCounter}`;
                  writer.write({ type: 'reasoning-start', id: reasoningPartId });
                  reasoningPartOpen = true;
                }
                writer.write({
                  type: 'reasoning-delta',
                  id: reasoningPartId,
                  delta: event.delta,
                });
                return;
              }

              if (event.type === 'text_delta') {
                closeOpenReasoning();
                if (!textPartOpen) {
                  stepCounter += 1;
                  textPartId = `fx-text-${stepCounter}`;
                  writer.write({ type: 'text-start', id: textPartId });
                  textPartOpen = true;
                }
                writer.write({
                  type: 'text-delta',
                  id: textPartId,
                  delta: event.delta,
                });
                return;
              }

              if (event.type === 'tool_start') {
                closeOpenReasoning();
                closeOpenText();
                writer.write({
                  type: 'tool-input-available',
                  toolCallId: event.id,
                  toolName: event.name,
                  input: event.inputTruncated
                    ? { preview: event.inputPreview }
                    : (event.input ?? {}),
                  dynamic: true,
                });
                return;
              }

              if (event.type === 'tool_end') {
                if (event.isError) {
                  writer.write({
                    type: 'tool-output-error',
                    toolCallId: event.id,
                    errorText: event.content ?? 'Tool execution failed.',
                    dynamic: true,
                  });
                } else {
                  writer.write({
                    type: 'tool-output-available',
                    toolCallId: event.id,
                    output: parseJsonOrString(event.content),
                    dynamic: true,
                  });
                }
              }
            },
          });

          fxTransportLabel = outcome.transport;
          ensureFramingStarted();
          closeOpenReasoning();
          closeOpenText();
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

          const modelMessages = await convertToModelMessages(validatedMessages, {
            ignoreIncompleteToolCalls: true,
          });
          const fallbackTools = createFxFallbackAiTools({
            chatId,
            userId: session.userId,
            sandboxTier: effectiveSandboxTier,
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
        if (finalAssistantMessage && finalAssistantMessage.parts.length > 0) {
          toSave.push({
            id: finalAssistantMessage.id || generateId('msg'),
            chatId,
            role: 'assistant',
            parts: finalAssistantMessage.parts,
            metadata: {
              ...(finalAssistantMessage.metadata ?? {}),
              modelId: activeModelId,
              harnessMode: 'fx',
              billingSource: activeBillingSource,
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
