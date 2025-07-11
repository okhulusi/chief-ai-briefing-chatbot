import { ChatSDKError } from '../errors';
import { generateUUID } from '../utils';
import { db } from './client';
import { chat, message } from './schema';
import { and, eq, like } from 'drizzle-orm';

export async function createBriefingChat(userId: string) {
  const id = generateUUID();

  try {
    // Count existing briefing chats for user to determine next number
    const existing = await db
      .select({ count: chat.id })
      .from(chat)
      .where(and(eq(chat.userId, userId), like(chat.title, 'Briefing%')));

    const nextNumber = (existing[0]?.count ?? 0) + 1;
    const title = `Briefing ${nextNumber}`;

    // Create the chat row first
    await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility: 'private',
    });
  } catch (error) {
    // Any failure here prevents a usable chat – surface the error
    // eslint-disable-next-line no-console
    console.error('createBriefingChat chat insert error', error);
    throw new ChatSDKError('bad_request:database', 'Failed to create briefing');
  }

  // Try to insert the welcome message; if it fails just log
  try {
    await db.insert(message).values({
      id: generateUUID(),
      chatId: id,
      role: 'assistant',
      createdAt: new Date(),
      parts: [
        {
          type: 'text',
          text: 'Welcome! What day do you want to generate a briefing from?',
        },
      ],
      attachments: [],
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('createBriefingChat message insert error', error);
  }

  return { id };
}
