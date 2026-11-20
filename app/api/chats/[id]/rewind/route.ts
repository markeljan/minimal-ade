import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import { deleteMessagesAfter, getChatById } from '@/lib/db/queries';

const rewindSchema = z.object({
  messageId: z.string().min(1).max(128),
  inclusive: z.boolean().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(request.headers);
    const chatRecord = await getChatById(id);

    if (!chatRecord) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (chatRecord.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = rewindSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid rewind payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const deletedCount = await deleteMessagesAfter(id, parsed.data.messageId, {
      inclusive: parsed.data.inclusive,
    });

    return NextResponse.json({
      rewound: true,
      chatId: id,
      messageId: parsed.data.messageId,
      deletedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rewind chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
