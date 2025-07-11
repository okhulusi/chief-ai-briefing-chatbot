import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

// This endpoint provides detailed information about token storage
export async function GET() {
  try {
    // Get the current session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get session token information
    const sessionTokenInfo = {
      hasAccessToken: !!session.accessToken,
      accessTokenPrefix: session.accessToken ? `${session.accessToken.substring(0, 10)}...` : null,
      hasRefreshToken: !!session.refreshToken,
      refreshTokenPrefix: session.refreshToken ? `${session.refreshToken.substring(0, 10)}...` : null,
      tokenExpiry: session.accessTokenExpires ? new Date(session.accessTokenExpires).toISOString() : null
    };

    // Get database token information
    const dbUser = await db
      .select({
        id: user.id,
        email: user.email,
        googleAccessToken: user.googleAccessToken,
        googleRefreshToken: user.googleRefreshToken,
        googleTokenExpiry: user.googleTokenExpiry
      })
      .from(user)
      .where(eq(user.id, session.user.id));

    // Format database token information
    const dbTokenInfo = dbUser.length > 0 ? {
      hasAccessToken: !!dbUser[0].googleAccessToken,
      accessTokenPrefix: dbUser[0].googleAccessToken ? `${dbUser[0].googleAccessToken.substring(0, 10)}...` : null,
      hasRefreshToken: !!dbUser[0].googleRefreshToken,
      refreshTokenPrefix: dbUser[0].googleRefreshToken ? `${dbUser[0].googleRefreshToken.substring(0, 10)}...` : null,
      tokenExpiry: dbUser[0].googleTokenExpiry ? dbUser[0].googleTokenExpiry.toISOString() : null
    } : null;

    // Check if tokens match between session and database
    const tokensMatch = dbTokenInfo && sessionTokenInfo.hasAccessToken && dbTokenInfo.hasAccessToken ? 
      sessionTokenInfo.accessTokenPrefix === dbTokenInfo.accessTokenPrefix : false;

    // Get raw database values for debugging
    const rawDbQuery = await db.execute(
      sql`SELECT "id", "email", "googleAccessToken", "googleRefreshToken", "googleTokenExpiry" 
          FROM "User" 
          WHERE "id" = ${session.user.id}`
    );

    return NextResponse.json({
      userId: session.user.id,
      email: session.user.email,
      sessionTokens: sessionTokenInfo,
      dbTokens: dbTokenInfo,
      tokensMatch,
      rawDbQueryResult: rawDbQuery
    });
  } catch (error) {
    console.error('Error checking token details:', error);
    return NextResponse.json({ 
      error: 'Failed to check token details',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
