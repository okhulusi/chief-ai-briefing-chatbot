import { auth } from '@/app/(auth)/auth';
import { updateUserGoogleTokens } from '@/lib/db/queries';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// This route handles the Google OAuth callback and stores the tokens in the database
export async function GET(request: NextRequest) {
  try {
    // Get the current session
    const session = await auth();
    if (!session?.user?.id) {
      console.error('No authenticated user found');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the access token from the URL parameters
    const searchParams = request.nextUrl.searchParams;
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');
    const expiryTimeStr = searchParams.get('expires_in');
    
    if (!accessToken) {
      console.error('No access token provided');
      return NextResponse.json({ error: 'No access token provided' }, { status: 400 });
    }

    // Calculate expiry time
    const expiryTime = expiryTimeStr ? 
      Date.now() + (Number.parseInt(expiryTimeStr, 10) * 1000) : 
      undefined;

    // Store the tokens in the database
    await updateUserGoogleTokens({
      userId: session.user.id,
      accessToken,
      refreshToken: refreshToken || undefined,
      expiryTime
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing Google tokens:', error);
    return NextResponse.json({ error: 'Failed to store tokens' }, { status: 500 });
  }
}
