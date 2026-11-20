import { AdeShell } from '@/components/ade/ade-shell';
import { MODEL_CATALOG } from '@/lib/ai/models';
import { getProviderDiagnostics, type ProviderDiagnostics } from '@/lib/ai/provider';
import { getServerSession } from '@/lib/auth/session';
import { type ChatRecord, listChats } from '@/lib/db/queries';
import { generateId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const newChatId = generateId('chat', 12);

  let sessionUser: {
    userId: string;
    name?: string;
    email?: string;
    image?: string;
    isGuest: boolean;
  } | null = null;
  let chats: ChatRecord[] = [];
  let diagnostics: ProviderDiagnostics | null = null;

  try {
    const session = await getServerSession();
    sessionUser = {
      userId: session.userId,
      name: session.name,
      email: session.email,
      image: session.image,
      isGuest: session.isGuest,
    };

    const [chatList, providerDiag] = await Promise.all([
      listChats(session.userId, { limit: 50 }).catch(() => [] as ChatRecord[]),
      getProviderDiagnostics(session.vercelAuth ?? null).catch(() => null),
    ]);

    chats = chatList;
    diagnostics = providerDiag;
  } catch {
    // Graceful cold-start empty state if DB or auth isn't ready yet
  }

  return (
    <AdeShell
      chatId={newChatId}
      isNewChat
      initialTitle="New Chat"
      initialModelId={diagnostics?.defaultModelId}
      initialChats={chats}
      initialDiagnostics={diagnostics}
      models={[...MODEL_CATALOG]}
      sessionUser={sessionUser}
    />
  );
}
