'use server';

import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { createBriefingChat } from '@/lib/db/briefing';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await createBriefingChat(session.user.id);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json({ error: 'Unable to create briefing' }, { status: 500 });
  }
}
