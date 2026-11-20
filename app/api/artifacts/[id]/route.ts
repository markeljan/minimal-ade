import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import {
  deleteArtifact,
  getArtifactVersions,
  getChatById,
  getLatestArtifact,
  saveArtifact,
} from '@/lib/db/queries';

const updateArtifactSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  kind: z.enum(['code', 'document', 'html', 'genui', 'diff']).optional(),
  language: z.string().max(64).nullable().optional(),
  content: z.string().optional(),
  spec: z.record(z.string(), z.unknown()).nullable().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(request.headers);
    const versions = await getArtifactVersions(id);
    const latest = versions.at(-1);

    if (!latest) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    }

    if (latest.chatId) {
      const chatRecord = await getChatById(latest.chatId);
      if (
        chatRecord &&
        chatRecord.visibility !== 'public' &&
        chatRecord.userId !== session.userId
      ) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json({
      artifact: latest,
      versions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch artifact';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(request.headers);
    const latest = await getLatestArtifact(id);

    if (!latest?.chatId) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    }

    const chatRecord = await getChatById(latest.chatId);
    if (!chatRecord || chatRecord.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = updateArtifactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid artifact update payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const nextArtifact = await saveArtifact({
      id: latest.id,
      chatId: latest.chatId,
      userId: session.userId,
      title: parsed.data.title ?? latest.title,
      kind: parsed.data.kind ?? latest.kind,
      language:
        parsed.data.language !== undefined ? parsed.data.language : (latest.language ?? null),
      content: parsed.data.content ?? (parsed.data.spec ? undefined : latest.content),
      spec: parsed.data.spec ?? null,
    });

    return NextResponse.json({ artifact: nextArtifact });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update artifact';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(request.headers);
    const latest = await getLatestArtifact(id);

    if (!latest) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    }

    if (latest.chatId) {
      const chatRecord = await getChatById(latest.chatId);
      if (chatRecord && chatRecord.userId !== session.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const deleted = await deleteArtifact(id, session.userId);
    return NextResponse.json({ deleted, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete artifact';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
