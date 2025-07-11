import { auth } from '@/app/(auth)/auth';
import { getUserGoogleTokens } from '@/lib/db/queries';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// This is a debug endpoint to check the user's Google tokens
export async function GET(request: NextRequest) {
  try {
    // Get the current session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the tokens from the database
    const dbTokens = await getUserGoogleTokens(session.user.id);
    
    // Get the tokens from the session
    const sessionTokens = {
      accessToken: session.accessToken ? 'exists' : 'missing',
    };

    return NextResponse.json({
      userId: session.user.id,
      email: session.user.email,
      dbTokens: {
        accessToken: dbTokens?.accessToken ? 'exists' : 'missing',
        refreshToken: dbTokens?.refreshToken ? 'exists' : 'missing',
        tokenExpiry: dbTokens?.tokenExpiry,
      },
      sessionTokens,
    });
  } catch (error) {
    console.error('Error fetching user tokens:', error);
    return NextResponse.json({ error: 'Failed to fetch user tokens' }, { status: 500 });
  }
}
