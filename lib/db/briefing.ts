import { ChatSDKError } from '../errors';
import { generateUUID } from '../utils';
import { db } from './client';
import { chat, message } from './schema';
import { and, eq, like } from 'drizzle-orm';

export async function createBriefingChat(userId: string) {
  const id = generateUUID();

  try {
    // Get all briefings for this user with titles that start with 'Briefing '
    const existingBriefings = await db
      .select({ title: chat.title })
      .from(chat)
      .where(and(eq(chat.userId, userId), like(chat.title, 'Briefing %')));

    // Extract numbers from existing briefing titles
    const usedNumbers = existingBriefings
      .map(b => {
        const match = b.title.match(/Briefing (\d+)/);
        return match ? Number.parseInt(match[1], 10) : 0;
      })
      .filter(n => !Number.isNaN(n) && n > 0);
    
    // Find the first available number
    let nextNumber = 1;
    if (usedNumbers.length > 0) {
      // Sort the used numbers
      usedNumbers.sort((a, b) => a - b);
      
      // Find the first gap or use the next number after the highest
      for (let i = 0; i < usedNumbers.length; i++) {
        if (usedNumbers[i] !== i + 1) {
          nextNumber = i + 1;
          break;
        }
        
        // If we've checked all numbers and found no gaps
        if (i === usedNumbers.length - 1) {
          nextNumber = usedNumbers[i] + 1;
        }
      }
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
