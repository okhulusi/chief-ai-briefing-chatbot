import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db';
import { chat } from '@/lib/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';

// Helper to generate a unique "Briefing N" title
async function generateUniqueBriefingTitle(userId: string) {
  const userChats = await db.select().from(chat).where(eq(chat.userId, userId));
  let n = 1;
  let title = `Briefing ${n}`;
  const titles = userChats.map((c) => c.title);
  while (titles.includes(title)) {
    n++;
    title = `Briefing ${n}`;
  }
  return title;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const title = await generateUniqueBriefingTitle(userId);
  const newChatId = uuidv4();
  await db.insert(chat).values({
    id: newChatId,
    createdAt: new Date(),
    title,
    userId,
    visibility: 'private',
  });
  return NextResponse.json({ chatId: newChatId });
}
