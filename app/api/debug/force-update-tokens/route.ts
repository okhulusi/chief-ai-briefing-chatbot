import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// This endpoint directly updates the database with test tokens
export async function GET(request: NextRequest) {
  try {
    // Get the current session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log(`Force updating tokens for user ID: ${session.user.id}`);
    
    // Generate test tokens
    const testAccessToken = `test_access_token_${randomUUID()}`;
    const testRefreshToken = `test_refresh_token_${randomUUID()}`;
    const testExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour from now
    
    // Update values to set
    const updateValues = {
      googleAccessToken: testAccessToken,
      googleRefreshToken: testRefreshToken,
      googleTokenExpiry: testExpiry
    };
    
    console.log('Update values:', updateValues);
    
    // Execute raw SQL to update the user
    const rawResult = await db.execute(
      `UPDATE "User" 
       SET "googleAccessToken" = $1, 
           "googleRefreshToken" = $2, 
           "googleTokenExpiry" = $3
       WHERE "id" = $4
       RETURNING "id", "email"`,
      [testAccessToken, testRefreshToken, testExpiry, session.user.id]
    );
    
    console.log('Raw SQL update result:', rawResult);
    
    // Also try with Drizzle ORM
    const ormResult = await db
      .update(user)
      .set(updateValues)
      .where(eq(user.id, session.user.id))
      .returning({ id: user.id, email: user.email });
    
    console.log('Drizzle ORM update result:', ormResult);
    
    // Verify the update by fetching the user again
    const updatedUser = await db
      .select({
        id: user.id,
        email: user.email,
        googleAccessToken: user.googleAccessToken,
        googleRefreshToken: user.googleRefreshToken,
        googleTokenExpiry: user.googleTokenExpiry,
      })
      .from(user)
      .where(eq(user.id, session.user.id));
    
    if (updatedUser.length > 0) {
      console.log('Updated user found:', {
        id: updatedUser[0].id,
        email: updatedUser[0].email,
        hasAccessToken: !!updatedUser[0].googleAccessToken,
        hasRefreshToken: !!updatedUser[0].googleRefreshToken,
        tokenExpiry: updatedUser[0].googleTokenExpiry
      });
      
      return NextResponse.json({
        success: true,
        userId: updatedUser[0].id,
        email: updatedUser[0].email,
        hasAccessToken: !!updatedUser[0].googleAccessToken,
        hasRefreshToken: !!updatedUser[0].googleRefreshToken,
        tokenExpiry: updatedUser[0].googleTokenExpiry ? new Date(updatedUser[0].googleTokenExpiry).toISOString() : null
      });
    } else {
      return NextResponse.json({ error: 'User not found after update' }, { status: 404 });
    }
  } catch (error) {
    console.error('Error force updating tokens:', error);
    return NextResponse.json({ 
      error: 'Failed to force update tokens',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
