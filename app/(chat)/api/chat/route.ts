import { auth } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import { ChatSDKError } from '@/lib/errors';
import { message } from '@/lib/db/schema';
import { db } from '@/lib/db';

export const maxDuration = 60;

// Modified to handle the case when Redis is not available
export function getStreamContext() {
  // We're intentionally not using Redis for resumable streams
  // This function will always return null, which means we'll use
  // the non-resumable stream path
  return null;
}

// Helper function to save a message to the database
async function saveMessageToDatabase(messageData: {
  id: string;
  chatId: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt: Date;
}) {
  try {
    await db.insert(message).values({
      id: messageData.id,
      chatId: messageData.chatId,
      parts: JSON.stringify({ text: messageData.content }),
      role: messageData.role,
      attachments: JSON.stringify([]),
      createdAt: messageData.createdAt,
    });
    console.log(`Message saved to database: ${messageData.id}`);
  } catch (error) {
    console.error('Error saving message to database:', error);
  }
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;
  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (err) {
    console.error('Error parsing request body:', err);
    return new ChatSDKError('bad_request:api', 'Invalid request body.').toResponse();
  }

  try {
    const {
      id: chatId,
      message: userMessage,
      selectedChatModel,
    } = requestBody;

    const session = await auth();
    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const { id: userId, type: userType } = session.user;

    const messageCount = await getMessageCountByUserId({
      id: userId,
      differenceInHours: 24,
    });

    if (messageCount >= entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const userContent = userMessage.parts
      .filter(part => typeof part === 'string' || part.type === 'text')
      .map(part => (typeof part === 'string' ? part : part.text || ''))
      .join(' ');

    if (!userContent) {
      return new ChatSDKError('bad_request:chat', 'Cannot process an empty message.').toResponse();
    }

    const chat = await getChatById({ id: chatId });
    if (chat && chat.userId !== userId) {
      return new ChatSDKError('forbidden:chat').toResponse();
    }

    if (!chat) {
      const title = await generateTitleFromUserMessage({ message: userMessage });
      await saveChat({
        id: chatId,
        userId,
        title,
        visibility: 'private',
      });
    }

    // Save the user's message to the database
    await saveMessages({
      messages: [
        {
          id: userMessage.id,
          chatId,
          role: 'user',
          parts: userMessage.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const { extractDateAndFetchEvents } = await import('@/lib/calendar/extract-date');
    console.log('Extracting date and fetching events for user message:', userContent);
    const dateResult = await extractDateAndFetchEvents(userContent).catch((error) => {
      console.error('Error extracting date or fetching events:', error);
      return null;
    });
    
    // Log detailed information about the extraction results
    if (dateResult) {
      console.log('=== CALENDAR EXTRACTION RESULTS ===');
      console.log(`Date extracted: ${dateResult.formattedDate}`);
      console.log(`Extraction confidence: ${dateResult.confidence}`);
      // Log the date object itself for debugging timezone issues
      console.log(`Date object:`, dateResult.date);
      
      if (dateResult.events && dateResult.events.length > 0) {
        console.log(`Found ${dateResult.events.length} calendar events:`);
        dateResult.events.forEach((event, index) => {
          console.log(`\nEvent #${index + 1}:`);
          console.log(`  Summary: ${event.summary || 'No summary'}`);
          console.log(`  Start: ${event.start || 'No start time'}`);
          console.log(`  End: ${event.end || 'No end time'}`);
          console.log(`  Location: ${event.location || 'No location'}`);
          
          // Safely log description with truncation if it exists
          if (event.description) {
            const truncatedDesc = event.description.length > 50 
              ? `${event.description.substring(0, 50)}...` 
              : event.description;
            console.log(`  Description: ${truncatedDesc}`);
          } else {
            console.log(`  Description: No description`);
          }
          
          // Safely log attendees if they exist
          if (event.attendees && Array.isArray(event.attendees)) {
            console.log(`  Attendees: ${event.attendees.length}`);
            if (event.attendees.length > 0) {
              const firstAttendee = event.attendees[0];
              const attendeeName = firstAttendee.displayName || firstAttendee.email || 'unnamed';
              console.log(`  Attendee sample: ${attendeeName}${event.attendees.length > 1 ? ' (and others)' : ''}`);
            }
          } else {
            console.log(`  Attendees: None or unknown`);
          }
        });
      } else {
        console.log('No calendar events found for the extracted date.');
      }
      console.log('=== END CALENDAR EXTRACTION ===');
    } else {
      console.log('Failed to extract date or confidence was too low.');
    }

    // Handle cases where we couldn't extract a date or find events
    if (!dateResult || dateResult.confidence !== 'high') {
      const fallbackId = generateUUID();
      const fallbackMessage = {
        id: fallbackId,
        chatId,
        role: 'assistant',
        parts: [{ type: 'text', text: 'I was not confident about the date you requested. Could you please specify the date more clearly?' }],
        attachments: [],
        createdAt: new Date(),
      };
      
      // Save the fallback message to the database
      await saveMessages({ messages: [fallbackMessage] });
      
      // Return the fallback message directly
      return new Response(JSON.stringify(fallbackMessage), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    if (!dateResult.events || dateResult.events.length === 0) {
      const fallbackId = generateUUID();
      const fallbackMessage = {
        id: fallbackId,
        chatId,
        role: 'assistant',
        parts: [{ type: 'text', text: `No calendar events found for ${dateResult.formattedDate}.` }],
        attachments: [],
        createdAt: new Date(),
      };
      
      // Save the fallback message to the database
      await saveMessages({ messages: [fallbackMessage] });
      
      // Return the fallback message directly
      return new Response(JSON.stringify(fallbackMessage), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Prepare the system prompt with calendar events
    const eventList = dateResult.events.map(ev => `- ${ev.summary}${ev.start ? ` (${ev.start})` : ''}${ev.location ? ` @ ${ev.location}` : ''}`).join('\n');
    const { longitude, latitude, city, country } = geolocation(request);
    const requestHints: RequestHints = { longitude, latitude, city, country };
    
    const baseSystemPrompt = systemPrompt({ selectedChatModel, requestHints });
    const briefingText = `I've found the following events for ${dateResult.formattedDate} in your calendar. Please begin your response by acknowledging that you found these events, then provide a formal, detailed briefing for your principal.\n\nEvents:\n${eventList}\n\nYour response should be structured as a professional briefing, with a clear introduction acknowledging the date, a summary of the day's schedule, and details about each event including timing, location, and any other relevant information.`;
    const systemPromptText = `${baseSystemPrompt}\n\n${briefingText}`;

    // Verify API key is available
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error('OpenAI API key is missing');
      
      const errorId = generateUUID();
      const errorMessage = {
        id: errorId,
        chatId,
        role: 'assistant',
        parts: [{ type: 'text', text: 'The service is temporarily unavailable due to a configuration issue.' }],
        attachments: [],
        createdAt: new Date(),
      };
      
      await saveMessages({ messages: [errorMessage] });
      return new Response(JSON.stringify(errorMessage), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    try {
      // Make the API request to OpenAI - NO STREAMING
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${openaiApiKey}` 
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPromptText },
            { role: 'user', content: userContent },
          ],
          stream: false, // No streaming
          temperature: 0.2,
          max_tokens: 1500,
        }),
      });

      if (!openaiRes.ok) {
        const errorText = await openaiRes.text().catch(() => 'Unknown error');
        console.error('OpenAI API request failed:', errorText);
        
        const errorId = generateUUID();
        const errorMessage = {
          id: errorId,
          chatId,
          role: 'assistant',
          parts: [{ type: 'text', text: 'Sorry, I was unable to generate a response. Please try again.' }],
          attachments: [],
          createdAt: new Date(),
        };
        
        await saveMessages({ messages: [errorMessage] });
        return new Response(JSON.stringify(errorMessage), { 
          headers: { 'Content-Type': 'application/json' } 
        });
      }

      // Parse the complete response
      const responseData = await openaiRes.json();
      const assistantText = responseData.choices[0].message.content;
      
      // Generate a UUID for the assistant message
      const assistantId = generateUUID();
      
      // Create the assistant message object
      const assistantMessage = {
        id: assistantId,
        chatId,
        role: 'assistant',
        parts: [{ type: 'text', text: assistantText }],
        attachments: [],
        createdAt: new Date(),
      };
      
      // Save the message to the database
      await saveMessages({ messages: [assistantMessage] });
      
      // Return the complete message
      return new Response(JSON.stringify(assistantMessage), { 
        headers: { 'Content-Type': 'application/json' } 
      });
      
    } catch (error) {
      console.error('Error processing OpenAI response:', error);
      
      const errorId = generateUUID();
      const errorMessage = {
        id: errorId,
        chatId,
        role: 'assistant',
        parts: [{ type: 'text', text: 'Sorry, an unexpected error occurred while processing your request. Please try again.' }],
        attachments: [],
        createdAt: new Date(),
      };
      
      await saveMessages({ messages: [errorMessage] });
      return new Response(JSON.stringify(errorMessage), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    }


  } catch (error) {
    console.error('Unhandled error in POST /api/chat:', error);
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    // Use a valid error code for generic server errors.
    return new ChatSDKError('bad_request:api', 'An unexpected error occurred.').toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
