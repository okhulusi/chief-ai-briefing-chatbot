import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { NextResponse } from 'next/server';

// This endpoint tests database connectivity without requiring authentication
export async function GET() {
  try {
    // Count users to verify database connection
    const userCount = await db.select({ count: user.id }).from(user);
    
    return NextResponse.json({
      success: true,
      message: 'Database connection successful',
      userCount: userCount.length > 0 ? userCount[0].count : 0
    });
  } catch (error) {
    console.error('Database connection error:', error);
    return NextResponse.json({ 
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
