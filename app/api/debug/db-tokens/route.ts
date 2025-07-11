import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// This endpoint directly checks the database for Google tokens
export async function GET(request: NextRequest) {
  try {
    // Get the current session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log(`Checking database for user ID: ${session.user.id}`);
    
    // Query the database directly
    const result = await db
      .select({
        id: user.id,
        email: user.email,
        googleAccessToken: user.googleAccessToken,
        googleRefreshToken: user.googleRefreshToken,
        googleTokenExpiry: user.googleTokenExpiry,
      })
      .from(user)
      .where(eq(user.id, session.user.id));
      
    if (result.length === 0) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
    }
    
    // Return token information (safely)
    return NextResponse.json({
      userId: result[0].id,
      email: result[0].email,
      hasGoogleAccessToken: !!result[0].googleAccessToken,
      hasGoogleRefreshToken: !!result[0].googleRefreshToken,
      googleTokenExpiry: result[0].googleTokenExpiry ? new Date(result[0].googleTokenExpiry).toISOString() : null,
    });
  } catch (error) {
    console.error('Error checking database tokens:', error);
    return NextResponse.json({ error: 'Failed to check database tokens' }, { status: 500 });
  }
}
