import { ChatSDKError } from '../errors';
import { generateUUID } from '../utils';
import { db } from './client';
import { chat, message } from './schema';
import { and, eq, like } from 'drizzle-orm';

export async function createBriefingChat(userId: string) {
  // Count existing briefing chats for user to determine next number
  const existing = await db
    .select({ count: chat.id })
    .from(chat)
    .where(and(eq(chat.userId, userId), like(chat.title, 'Briefing%')));

  const nextNumber = (existing[0]?.count ?? 0) + 1;
  const title = `Briefing ${nextNumber}`;
  const id = generateUUID();

  try {
    await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility: 'private',
    });

    await db.insert(message).values({
      chatId: id,
      role: 'assistant',
      createdAt: new Date(),
      parts: [{ type: 'text', text: 'Welcome! What day do you want to generate a briefing from?' }],
      attachments: [],
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create briefing');
  }

  return { id };
}
