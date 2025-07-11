import { db } from '@/lib/db';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// This endpoint checks the database schema to verify the columns exist
export async function GET(request: NextRequest) {
  try {
    // Query the database to get the User table schema
    const result = await db.execute(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'User'`
    );
    
    return NextResponse.json({
      schema: result,
      message: 'This shows all columns in the User table to verify the Google OAuth fields exist'
    });
  } catch (error) {
    console.error('Error checking database schema:', error);
    return NextResponse.json({ error: 'Failed to check database schema' }, { status: 500 });
  }
}
