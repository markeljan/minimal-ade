import { createModelCallToUIChunkTransform, type ModelCallStreamPart } from '@ai-sdk/workflow';
import { pipeJsonRender } from '@json-render/core';
import { createUIMessageStreamResponse } from 'ai';
import { NextResponse } from 'next/server';
import { getRun } from 'workflow/api';

export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ runId: string }>;
}

/**
 * Resume or inspect a durable Vercel Workflow 5 agent run.
 * - `GET /api/workflow/:runId?status=1` returns JSON run status metadata.
 * - `GET /api/workflow/:runId[?startIndex=N]` reconnects to the UI message stream.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;
  if (!runId?.trim()) {
    return NextResponse.json({ error: 'Missing workflow runId.' }, { status: 400 });
  }

  const url = new URL(request.url);
  const wantStatusOnly =
    url.searchParams.get('status') === '1' || url.searchParams.get('format') === 'status';

  try {
    const run = getRun(runId);
    const exists = await run.exists;
    if (!exists) {
      return NextResponse.json({ error: `Workflow run "${runId}" not found.` }, { status: 404 });
    }

    if (wantStatusOnly) {
      const [status, createdAt, startedAt, completedAt] = await Promise.all([
        run.status,
        run.createdAt,
        run.startedAt,
        run.completedAt,
      ]);

      return NextResponse.json({
        runId,
        exists: true,
        status,
        createdAt: createdAt.toISOString(),
        startedAt: startedAt?.toISOString() ?? null,
        completedAt: completedAt?.toISOString() ?? null,
      });
    }

    const startIndexParam = url.searchParams.get('startIndex');
    const parsedStartIndex =
      startIndexParam !== null ? Number.parseInt(startIndexParam, 10) : undefined;
    const uiStartIndex =
      parsedStartIndex !== undefined &&
      Number.isSafeInteger(parsedStartIndex) &&
      parsedStartIndex >= 0
        ? parsedStartIndex
        : undefined;

    const sourceReadable = run.getReadable<ModelCallStreamPart>({ startIndex: 0 });
    const tailIndex = await sourceReadable.getTailIndex();

    const uiStream = pipeJsonRender(
      sourceReadable.pipeThrough(createModelCallToUIChunkTransform({ uiStartIndex })),
    );

    return createUIMessageStreamResponse({
      stream: uiStream,
      headers: {
        'x-workflow-run-id': runId,
        'x-workflow-stream-tail-index': String(tailIndex),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resume workflow run.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Cancel an active durable Workflow 5 agent run.
 */
export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;
  if (!runId?.trim()) {
    return NextResponse.json({ error: 'Missing workflow runId.' }, { status: 400 });
  }

  try {
    const run = getRun(runId);
    const exists = await run.exists;
    if (!exists) {
      return NextResponse.json({ error: `Workflow run "${runId}" not found.` }, { status: 404 });
    }

    await run.cancel({ cancelReason: 'Cancelled by user' });
    return NextResponse.json({ ok: true, runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to cancel workflow run.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
