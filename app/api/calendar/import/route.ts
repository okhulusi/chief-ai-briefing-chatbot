import { auth } from '@/app/(auth)/auth';
import { getUserGoogleTokens } from '@/lib/db/queries';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export async function GET(request: NextRequest) {
  try {
    // Get the current session
    const session = await auth();
    if (!session?.user?.id) {
      console.error('No authenticated user found');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Log the session user ID for debugging
    console.log(`Calendar import requested by user ID: ${session.user.id}, email: ${session.user.email}`);
    
    // Try to get the access token from the session first
    let accessToken = session.accessToken;
    
    // If not in session, try to get it from the database
    if (!accessToken) {
      console.log('No access token in session, checking database...');
      const dbTokens = await getUserGoogleTokens(session.user.id);
      
      if (dbTokens?.accessToken) {
        console.log('Found access token in database');
        accessToken = dbTokens.accessToken;
      } else {
        console.error('No Google access token found in session or database');
        // Return a response that will trigger a client-side redirect to the sign-in page
        // with the Google provider specified
        return NextResponse.json({ 
          error: 'No Google access token', 
          signIn: true,
          provider: 'google'
        }, { status: 401 });
      }
    }

    // Get today's date in RFC3339 format
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const timeMin = startOfDay.toISOString();
    const timeMax = endOfDay.toISOString();

    // Fetch today's events from Google Calendar API using the access token
    const url = `${GOOGLE_CALENDAR_API}?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
    console.log(`Fetching calendar events with access token: ${accessToken ? 'present' : 'missing'}`);
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Google Calendar API error:', error);
      
      // If unauthorized, the token might be invalid or expired
      if (response.status === 401) {
        return NextResponse.json({ 
          error: 'Google token invalid or expired',
          signIn: true,
          provider: 'google'
        }, { status: 401 });
      }
      
      return NextResponse.json({ error }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json({ events: data.items ?? [] });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 });
  }
}
