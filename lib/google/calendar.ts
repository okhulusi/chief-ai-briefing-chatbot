/**
 * Fetches Google Calendar events for a given user and date using REST API.
 * @param accessToken The user's Google OAuth access token
 * @param date A Date object representing the target day
 */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  date: Date,
) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  const timeMin = startOfDay.toISOString();
  const timeMax = endOfDay.toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch Google Calendar events');
  }
  const data = await response.json();
  return data.items || [];
}
