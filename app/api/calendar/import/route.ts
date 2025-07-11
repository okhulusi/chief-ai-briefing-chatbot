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
    console.log('Session data:', {
      hasAccessToken: !!session.accessToken,
      hasRefreshToken: !!session.refreshToken,
      tokenExpiry: session.accessTokenExpires ? new Date(session.accessTokenExpires).toISOString() : 'undefined'
    });
    
    // Try to get the access token from the session first
    let accessToken = session.accessToken;
    
    // If not in session, try to get it from the database
    if (!accessToken) {
      console.log('No access token in session, checking database...');
      try {
        const dbTokens = await getUserGoogleTokens(session.user.id);
        
        if (dbTokens?.accessToken) {
          console.log('Found access token in database');
          accessToken = dbTokens.accessToken;
        } else {
          console.error('No Google access token found in database');
          // Return a response that will trigger a client-side redirect to the sign-in page
          // with the Google provider specified
          return NextResponse.json({ 
            error: 'No Google access token', 
            signIn: true,
            provider: 'google'
          }, { status: 401 });
        }
      } catch (error) {
        console.error('Error retrieving tokens from database:', error);
        return NextResponse.json({ 
          error: 'Failed to retrieve Google tokens', 
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
    console.log(`Fetching calendar events with access token: ${accessToken ? `${accessToken.substring(0, 10)}...` : 'missing'}`);
    
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log('Google Calendar API response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Google Calendar API error: ${response.status} ${response.statusText}`);
        console.error('Error details:', errorText);
        
        // If unauthorized, trigger a new sign-in
        if (response.status === 401) {
          return NextResponse.json({ 
            error: 'Google Calendar API access unauthorized', 
            signIn: true,
            provider: 'google'
          }, { status: 401 });
        }
        
        return NextResponse.json({ 
          error: 'Failed to fetch calendar events', 
          status: response.status,
          statusText: response.statusText
        }, { status: response.status });
      }

      const data = await response.json();
      console.log('Calendar API response:', {
        hasItems: !!data.items,
        itemCount: data.items?.length || 0
      });
      
      const events = data.items || [];

      return NextResponse.json({ 
        events,
        message: `Successfully imported ${events.length} events`
      });
    } catch (fetchError) {
      console.error('Error fetching from Google Calendar API:', fetchError);
      return NextResponse.json({ 
        error: 'Failed to fetch calendar events',
        details: fetchError instanceof Error ? fetchError.message : String(fetchError)
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error importing calendar:', error);
    return NextResponse.json({ 
      error: 'Failed to import calendar',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
