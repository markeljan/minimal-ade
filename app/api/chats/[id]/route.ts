import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import {
  deleteChat,
  getChatById,
  getMessagesByChatId,
  getVotesByChatId,
  listArtifactsByChatId,
  updateChat,
} from '@/lib/db/queries';

const updateChatSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  visibility: z.enum(['private', 'public']).optional(),
  harnessMode: z.enum(['ai-sdk', 'fx', 'workflow']).optional(),
  modelId: z.string().min(1).max(120).optional(),
  sandboxName: z.string().max(120).nullable().optional(),
  pinned: z.boolean().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(request.headers);
    const chatRecord = await getChatById(id);

    if (!chatRecord) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (chatRecord.visibility !== 'public' && chatRecord.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [messages, votes, artifacts] = await Promise.all([
      getMessagesByChatId(id),
      getVotesByChatId(id),
      listArtifactsByChatId(id),
    ]);

    return NextResponse.json({
      chat: chatRecord,
      messages,
      votes,
      artifacts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(request.headers);
    const existing = await getChatById(id);

    if (!existing) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (existing.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = updateChatSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid chat update payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const updated = await updateChat(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json({ chat: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(request.headers);
    const existing = await getChatById(id);

    if (!existing) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (existing.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const deleted = await deleteChat(id, session.userId);
    return NextResponse.json({ deleted, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
