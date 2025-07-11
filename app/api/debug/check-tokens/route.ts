import { auth } from '@/app/(auth)/auth';
import { getUserGoogleTokens } from '@/lib/db/queries';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// This is a debug endpoint to check if Google tokens are properly saved
export async function GET(request: NextRequest) {
  try {
    // Get the current session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the tokens from the database
    const dbTokens = await getUserGoogleTokens(session.user.id);
    
    // Return token information (safely)
    return NextResponse.json({
      userId: session.user.id,
      email: session.user.email,
      hasSessionAccessToken: !!session.accessToken,
      hasSessionRefreshToken: !!session.refreshToken,
      hasDbAccessToken: !!dbTokens?.accessToken,
      hasDbRefreshToken: !!dbTokens?.refreshToken,
      dbTokenExpiry: dbTokens?.tokenExpiry ? new Date(dbTokens.tokenExpiry).toISOString() : null,
    });
  } catch (error) {
    console.error('Error checking tokens:', error);
    return NextResponse.json({ error: 'Failed to check tokens' }, { status: 500 });
  }
}
