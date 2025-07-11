import { fetchCalendarEventsForDate } from './fetch-events';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  organizer?: {
    email: string;
    displayName?: string;
  };
  conferenceData?: any;
}

export async function extractDateAndFetchEvents(userMessage: string): Promise<{
  date: Date;
  formattedDate: string;
  events: CalendarEvent[] | null;
}> {
  try {
    // Use OpenAI to extract the date from the user's message
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is missing');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: `Extract the date mentioned in the user's message, including future dates. 
            Return ONLY a JSON object with the format: 
            { 
              "date": "YYYY-MM-DD", 
              "confidence": "high|medium|low",
              "reasoning": "brief explanation"
            }
            Handle all date formats including:
            - Relative dates (today, tomorrow, next week)
            - Specific dates with or without year (July 16th, July 16th 2025)
            - Numeric dates (7/16/2025, 16/7/2025)
            
            If a date is mentioned without a year, assume it's in the future if it's after today's date this year,
            otherwise assume it's next year.
            
            If no date is mentioned, use today's date.
            Do not include any other text in your response.` 
          },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.1,
        max_tokens: 150
      })
    });

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text());
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const extractedContent = data.choices[0].message.content.trim();
    
    console.log('OpenAI extracted date JSON:', extractedContent);
    
    // Parse the JSON response
    let parsedDate: Date;
    try {
      // Try to extract JSON if it's wrapped in other text
      let jsonStr = extractedContent;
      
      // Look for JSON object pattern if the response isn't pure JSON
      if (!extractedContent.startsWith('{')) {
        const jsonMatch = extractedContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
      }
      
      const dateInfo: { date: string; confidence: string; reasoning: string } = JSON.parse(jsonStr);
      parsedDate = new Date(dateInfo.date);
      console.log(`Extracted date: ${parsedDate.toDateString()} (Confidence: ${dateInfo.confidence})`);
      console.log(`Reasoning: ${dateInfo.reasoning}`);
    } catch (error) {
      console.error('Error parsing date from OpenAI response:', error);
      parsedDate = new Date(); // Default to today
    }
    
    // Check if the date is valid
    if (Number.isNaN(parsedDate.getTime())) {
      console.log('Invalid date extracted, defaulting to today');
      parsedDate = new Date();
    }
    
    // Fetch calendar events for the extracted date
    const events = await fetchCalendarEventsForDate(parsedDate);
    
    return {
      date: parsedDate,
      formattedDate: parsedDate.toDateString(),
      events
    };
  } catch (error) {
    console.error('Error extracting date and fetching events:', error);
    // Default to today if there's an error
    const today = new Date();
    return {
      date: today,
      formattedDate: today.toDateString(),
      events: null
    };
  }
}
