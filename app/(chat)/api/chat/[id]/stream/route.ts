import { auth } from '@/app/(auth)/auth';
import {
  getChatById,
  getMessagesByChatId,
} from '@/lib/db/queries';
import type { Chat } from '@/lib/db/schema';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';
import { createUIMessageStream, JsonToSseTransformStream } from 'ai';
import { differenceInSeconds } from 'date-fns';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: chatId } = await params;
  const resumeRequestedAt = new Date();

  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  let chat: Chat;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.visibility === 'private' && chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  // Create an empty data stream as fallback
  const emptyDataStream = createUIMessageStream<ChatMessage>({
    execute: () => {},
  });
  
  // Get the most recent message for this chat
  const messages = await getMessagesByChatId({ id: chatId });
  const mostRecentMessage = messages.at(-1);

  if (!mostRecentMessage) {
    return new Response(emptyDataStream.pipeThrough(new JsonToSseTransformStream()), { status: 200 });
  }

  if (mostRecentMessage.role !== 'assistant') {
    return new Response(emptyDataStream.pipeThrough(new JsonToSseTransformStream()), { status: 200 });
  }

  const messageCreatedAt = new Date(mostRecentMessage.createdAt);

  if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
    return new Response(emptyDataStream.pipeThrough(new JsonToSseTransformStream()), { status: 200 });
  }

  // Create a stream with the most recent message
  const restoredStream = createUIMessageStream<ChatMessage>({
    execute: ({ writer }) => {
      writer.write({
        type: 'data-appendMessage',
        data: JSON.stringify(mostRecentMessage),
        transient: true,
      });
    },
  });

  return new Response(
    restoredStream.pipeThrough(new JsonToSseTransformStream()),
    { status: 200 },
  );
}
