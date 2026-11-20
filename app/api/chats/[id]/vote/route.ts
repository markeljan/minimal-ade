import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/session';
import { getChatById, getVotesByChatId, voteMessage } from '@/lib/db/queries';

const votePayloadSchema = z
  .object({
    messageId: z.string().min(1).max(128),
    isUpvoted: z.boolean().optional(),
    type: z.enum(['up', 'down']).optional(),
  })
  .refine((data) => data.isUpvoted !== undefined || data.type !== undefined, {
    message: 'Either isUpvoted or type ("up" | "down") is required',
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

    const votes = await getVotesByChatId(id);
    return NextResponse.json({ votes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch votes';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleVote(request: Request, context: RouteContext) {
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
    const parsed = votePayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid vote payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const isUpvoted = parsed.data.isUpvoted ?? parsed.data.type === 'up';
    const vote = await voteMessage(id, parsed.data.messageId, isUpvoted);
    return NextResponse.json({ vote });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record vote';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleVote(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return handleVote(request, context);
}
