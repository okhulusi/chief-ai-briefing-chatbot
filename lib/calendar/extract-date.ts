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
  confidence: string;
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
            content: `You are a date extraction expert. Your task is to identify the specific date a user is asking about and return it in a JSON object. 
            
            Current context for the user:
            - Today's Date: ${new Date().toISOString().split('T')[0]}
            - User's Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
            
            Please follow these rules:
            1.  Interpret all relative dates (e.g., "today", "tomorrow") based on the provided current date and user's timezone.
            2.  If a date is mentioned without a year (e.g., "July 17th"), assume it's for the upcoming instance of that date in the user's timezone.
            3.  If no specific date is mentioned, default to today's date in the user's timezone.
            4.  Return ONLY a JSON object with the following format:
                {
                  "date": "YYYY-MM-DD",
                  "confidence": "high|medium|low",
                  "reasoning": "A brief explanation of how you determined the date."
                }
            5.  Do not include any other text, greetings, or explanations in your response.`
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
    let confidence = 'low'; // Default confidence
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
      confidence = dateInfo.confidence.toLowerCase();
      console.log(`Extracted date: ${parsedDate.toDateString()} (Confidence: ${confidence})`);
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
      events,
      confidence
    };
  } catch (error) {
    console.error('Error extracting date and fetching events:', error);
    // Default to today if there's an error
    const today = new Date();
    return {
      date: today,
      formattedDate: today.toDateString(),
      events: null,
      confidence: 'low' // Default to low confidence on error
    };
  }
}
