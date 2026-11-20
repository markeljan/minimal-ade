import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import { createChat, listChats } from '@/lib/db/queries';

const createChatSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  title: z.string().max(200).optional(),
  modelId: z.string().min(1).max(120).optional(),
  harnessMode: z.enum(['ai-sdk', 'fx', 'workflow']).optional(),
  visibility: z.enum(['private', 'public']).optional(),
  sandboxName: z.string().max(120).nullable().optional(),
  pinned: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await getServerSession(request.headers);
    const { searchParams } = new URL(request.url);

    const rawLimit = Number(searchParams.get('limit') ?? '50');
    const rawOffset = Number(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search') ?? undefined;

    const chats = await listChats(session.userId, {
      limit: Number.isFinite(rawLimit) ? rawLimit : 50,
      offset: Number.isFinite(rawOffset) ? rawOffset : 0,
      search,
    });

    return NextResponse.json({
      chats,
      total: chats.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list chats';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(request.headers);
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = createChatSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid chat payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const chat = await createChat({
      ...parsed.data,
      userId: session.userId,
    });

    return NextResponse.json({ chat }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
