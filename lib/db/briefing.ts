import { ChatSDKError } from '../errors';
import { generateUUID } from '../utils';
import { db } from './client';
import { chat, message } from './schema';
import { and, eq, like } from 'drizzle-orm';

export async function createBriefingChat(userId: string) {
  const id = generateUUID();

  try {
    // Get all existing briefing titles for this user
    const existingBriefings = await db
      .select({ title: chat.title })
      .from(chat)
      .where(and(eq(chat.userId, userId), like(chat.title, 'Briefing%')));
    
    // Extract numbers from existing briefing titles
    const usedNumbers = existingBriefings
      .map(b => {
        const match = b.title.match(/Briefing (\d+)/);
        return match ? Number.parseInt(match[1], 10) : null;
      })
      .filter((num): num is number => num !== null && !Number.isNaN(num))
      .sort((a, b) => a - b);
    
    // Find the first available number (filling gaps)
    let nextNumber = 1;
    for (const num of usedNumbers) {
      if (num > nextNumber) {
        break; // Found a gap
      }
      nextNumber = num + 1;
    }
    
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
          text: "Welcome to your AI Briefing Assistant! I create detailed government-style briefing books based on your calendar events. Simply tell me which day you want a briefing for (e.g., 'today', 'tomorrow', 'July 15th'), and I'll generate a comprehensive briefing with memos for each event. After receiving your briefing, you can ask questions about specific events or request additional information.",
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
