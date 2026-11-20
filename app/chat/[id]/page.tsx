import { notFound } from 'next/navigation';
import { AdeShell } from '@/components/ade/ade-shell';
import type { AdeUIMessage } from '@/components/ade/chat-pane';
import { MODEL_CATALOG } from '@/lib/ai/models';
import { getProviderDiagnostics, type ProviderDiagnostics } from '@/lib/ai/provider';
import { getServerSession } from '@/lib/auth/session';
import {
  type ChatRecord,
  getChatById,
  getMessagesByChatId,
  getVotesByChatId,
  getWorkspaceFilesMap,
  listArtifactsByChatId,
  listChats,
} from '@/lib/db/queries';
import type { ArtifactRecord, WorkspaceFileEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;

  let sessionUser: {
    userId: string;
    name?: string;
    email?: string;
    image?: string;
    isGuest: boolean;
  } | null = null;
  let chats: ChatRecord[] = [];
  let chatRecord: ChatRecord | null = null;
  let initialMessages: AdeUIMessage[] = [];
  let initialVotes: Record<string, boolean> = {};
  let initialArtifacts: ArtifactRecord[] = [];
  let initialWorkspaceFileMap: Record<string, string> = {};
  let initialWorkspaceFiles: WorkspaceFileEntry[] = [];
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

    const [loadedChat, chatList, providerDiag] = await Promise.all([
      getChatById(id).catch(() => null),
      listChats(session.userId, { limit: 50 }).catch(() => [] as ChatRecord[]),
      getProviderDiagnostics(session.vercelAuth ?? null).catch(() => null),
    ]);

    chatRecord = loadedChat;
    chats = chatList;
    diagnostics = providerDiag;

    if (chatRecord && chatRecord.visibility !== 'public' && chatRecord.userId !== session.userId) {
      notFound();
    }

    if (chatRecord) {
      const [storedMessages, storedVotes, artifacts, fileMap] = await Promise.all([
        getMessagesByChatId(id).catch(() => []),
        getVotesByChatId(id).catch(() => []),
        listArtifactsByChatId(id).catch(() => [] as ArtifactRecord[]),
        getWorkspaceFilesMap(id).catch(() => ({}) as Record<string, string>),
      ]);

      initialMessages = storedMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system',
          parts: (Array.isArray(m.parts) ? m.parts : []) as AdeUIMessage['parts'],
          metadata: m.metadata ?? undefined,
        }));

      initialVotes = Object.fromEntries(storedVotes.map((v) => [v.messageId, v.isUpvoted]));
      initialArtifacts = artifacts;
      initialWorkspaceFileMap = fileMap;
      initialWorkspaceFiles = Object.entries(fileMap).map(([path, content]) => ({
        path,
        name: path.split('/').pop() ?? path,
        type: 'file' as const,
        size: content.length,
      }));
    }
  } catch {
    // Degrade gracefully on cold start
  }

  return (
    <AdeShell
      chatId={id}
      isNewChat={!chatRecord}
      initialTitle={chatRecord?.title ?? 'New Chat'}
      initialModelId={chatRecord?.modelId ?? diagnostics?.defaultModelId}
      initialHarnessMode={chatRecord?.harnessMode ?? 'ai-sdk'}
      initialMessages={initialMessages}
      initialVotes={initialVotes}
      initialChats={chats}
      initialArtifacts={initialArtifacts}
      initialWorkspaceFiles={initialWorkspaceFiles}
      initialWorkspaceFileMap={initialWorkspaceFileMap}
      initialDiagnostics={diagnostics}
      models={[...MODEL_CATALOG]}
      sessionUser={sessionUser}
    />
  );
}
