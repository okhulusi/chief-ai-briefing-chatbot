import { auth } from '@/app/(auth)/auth';
import { getUserGoogleTokens } from '@/lib/db/queries';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
}

export async function fetchCalendarEventsForDate(date: Date): Promise<CalendarEvent[] | null> {
  try {
    // Get the current session
    const session = await auth();
    if (!session?.user?.id) {
      console.log('No authenticated user found');
      return null;
    }

    // Try to get access token from session first
    let accessToken = session.accessToken;
    
    // If not in session, try to get from database
    if (!accessToken) {
      console.log('No access token in session, trying database');
      const tokens = await getUserGoogleTokens(session.user.id);
      if (tokens?.accessToken) {
        console.log('Found access token in database');
        accessToken = tokens.accessToken;
      } else {
        console.log('No Google access token found');
        return null;
      }
    }

    // Set up time range for the specific date (start of day to end of day)
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
    
    const timeMin = startDate.toISOString();
    const timeMax = endDate.toISOString();

    // Fetch events from Google Calendar API
    const url = `${GOOGLE_CALENDAR_API}?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
    console.log(`Fetching calendar events for date: ${date.toDateString()}`);
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Google Calendar API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`Calendar API response: { hasItems: ${!!data.items}, itemCount: ${data.items?.length || 0} }`);
    
    return data.items || [];
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return null;
  }
}

export function formatCalendarEventsForPrompt(events: CalendarEvent[]): string {
  if (!events || events.length === 0) {
    return "No events found for the specified date.";
  }

  const formattedEvents = events.map(event => {
    const startTime = new Date(event.start.dateTime).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    const endTime = new Date(event.end.dateTime).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    const attendees = event.attendees 
      ? `\n   Attendees: ${event.attendees.map(a => a.displayName || a.email).join(', ')}`
      : '';
      
    const location = event.location 
      ? `\n   Location: ${event.location}`
      : '';
      
    const description = event.description
      ? `\n   Description: ${event.description}`
      : '';
    
    return `- ${startTime} - ${endTime}: ${event.summary}${location}${attendees}${description}`;
  }).join('\n\n');

  return `Calendar events for the day:\n\n${formattedEvents}`;
}

export function parseDateFromMessage(message: string): Date | null {
  // Try to extract date from message
  const today = new Date();
  
  // Check for "today"
  if (/today/i.test(message)) {
    return today;
  }
  
  // Check for "tomorrow"
  if (/tomorrow/i.test(message)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  
  // Check for "yesterday"
  if (/yesterday/i.test(message)) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }
  
  // Check for day of week
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < daysOfWeek.length; i++) {
    if (message.toLowerCase().includes(daysOfWeek[i])) {
      const targetDay = i;
      const currentDay = today.getDay();
      const daysToAdd = (targetDay + 7 - currentDay) % 7;
      const date = new Date(today);
      date.setDate(today.getDate() + daysToAdd);
      return date;
    }
  }
  
  // Check for month name and day format (e.g., "July 14th, 2025")
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  
  // Match patterns like "July 14th, 2025" or "July 14, 2025" or "July 14"
  const monthDayRegex = new RegExp(
    `(${monthNames.join('|')})[\\s,]+(\\d{1,2})(?:st|nd|rd|th)?[\\s,]*(?:(\\d{4}))?`,
    'i' // Case insensitive
  );
  
  const monthDayMatch = message.match(monthDayRegex);
  if (monthDayMatch) {
    const monthName = monthDayMatch[1].toLowerCase();
    const month = monthNames.indexOf(monthName);
    const day = Number.parseInt(monthDayMatch[2], 10);
    const year = monthDayMatch[3] ? Number.parseInt(monthDayMatch[3], 10) : today.getFullYear();
    
    if (month !== -1 && day >= 1 && day <= 31) {
      console.log(`Parsed date: ${monthName} ${day}, ${year}`);
      return new Date(year, month, day);
    }
  }
  
  // Try to parse numeric date formats (MM/DD/YYYY)
  const dateRegex = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
  const match = message.match(dateRegex);
  
  if (match) {
    const month = Number.parseInt(match[1], 10) - 1; // 0-based month
    const day = Number.parseInt(match[2], 10);
    let year = match[3] ? Number.parseInt(match[3], 10) : today.getFullYear();
    
    // Handle 2-digit year
    if (year < 100) {
      year += 2000;
    }
    
    // Validate date
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }
  
  // Default to today if no date found
  console.log('No date pattern matched, defaulting to today');
  return today;
}
