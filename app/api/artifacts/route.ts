import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import {
  ensureChat,
  getChatById,
  getLatestArtifact,
  listArtifactsByChatId,
  saveArtifact,
} from '@/lib/db/queries';

const createArtifactSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  chatId: z.string().min(1).max(128),
  title: z.string().min(1).max(240),
  kind: z.enum(['code', 'document', 'html', 'genui', 'diff']).default('code'),
  language: z.string().max(64).nullable().optional(),
  content: z.string().optional(),
  spec: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId')?.trim();

    if (!chatId) {
      return NextResponse.json({ error: 'Query parameter "chatId" is required' }, { status: 400 });
    }

    const session = await getServerSession(request.headers);
    const chatRecord = await getChatById(chatId);

    if (!chatRecord) {
      return NextResponse.json({ artifacts: [] });
    }

    if (chatRecord.visibility !== 'public' && chatRecord.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const artifacts = await listArtifactsByChatId(chatId);
    return NextResponse.json({ artifacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list artifacts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(request.headers);
    const body: unknown = await request.json().catch(() => null);
    const parsed = createArtifactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid artifact payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const chatRecord = await ensureChat({
      id: parsed.data.chatId,
      userId: session.userId,
      title: parsed.data.title,
    });

    if (chatRecord.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (parsed.data.id) {
      const existingArtifact = await getLatestArtifact(parsed.data.id);
      if (existingArtifact?.chatId && existingArtifact.chatId !== parsed.data.chatId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const artifact = await saveArtifact({
      id: parsed.data.id,
      chatId: parsed.data.chatId,
      userId: session.userId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      language: parsed.data.language ?? null,
      content: parsed.data.content,
      spec: parsed.data.spec ?? null,
    });

    return NextResponse.json({ artifact }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save artifact';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
