import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export async function GET(request: NextRequest) {
  // Authenticate user and get Google access token
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token || !token.accessToken) {
    return NextResponse.json({ error: 'Not authenticated with Google' }, { status: 401 });
  }

  // Get today's date in RFC3339 format
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const timeMin = startOfDay.toISOString();
  const timeMax = endOfDay.toISOString();

  // Fetch today's events from Google Calendar API
  const url = `${GOOGLE_CALENDAR_API}?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    return NextResponse.json({ error }, { status: 500 });
  }

  const data = await response.json();
  return NextResponse.json({ events: data.items ?? [] });
}
