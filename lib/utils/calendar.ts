/**
 * Utility functions for fetching and processing calendar data
 */

/**
 * Fetches the user's calendar data for today
 * @returns Promise with calendar events or error
 */
export async function fetchTodaysCalendarEvents() {
  try {
    console.log('Fetching calendar events...');
    const response = await fetch('/api/calendar/import');
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Calendar API error:', errorData);
      throw new Error(`Calendar API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Calendar data received:', data);
    
    return data.events;
  } catch (error) {
    console.error('Error fetching calendar data:', error);
    throw error;
  }
}
