import {
  createUIMessageStream,
  JsonToSseTransformStream,
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
// No longer using isProductionEnvironment
import { myProvider } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
// Removed resumable-stream import as we're not using it
// Removed after import as we're not using it
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';
import type { ChatModel } from '@/lib/ai/models';

export const maxDuration = 60;

// Modified to handle the case when Redis is not available
export function getStreamContext() {
  // We're intentionally not using Redis for resumable streams
  // This function will always return null, which means we'll use
  // the non-resumable stream path
  return null;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel['id'];
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: 'private',
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    // Instead of using streaming, we'll use a simple approach that works reliably
    const messageId = generateUUID();
    const assistantMessage = {
      id: messageId,
      role: 'assistant' as const,
      content: '',
      createdAt: new Date().toISOString()
    };
    
    // Create a simple UI message stream
    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        try {
          // First, write a "thinking" message
          assistantMessage.content = 'Thinking...';
          dataStream.write({
            type: 'data-message',
            data: JSON.stringify(assistantMessage),
          });
          
          // Get the model from the provider
          const model = myProvider.languageModel(selectedChatModel);
          const systemPromptText = systemPrompt({ selectedChatModel, requestHints });
          
          // Use a direct fetch to the OpenAI API instead of the AI SDK
          // This avoids the compatibility issues with the model interfaces
          const lastMessage = uiMessages[uiMessages.length - 1];
          let userContent = '';
          
          console.log('Raw message from client:', JSON.stringify(lastMessage));
          
          // Extract content from the message based on its structure
          if (typeof lastMessage === 'object' && lastMessage !== null) {
            // Check if the message has parts array (from the client)
            if ((lastMessage as any).parts && Array.isArray((lastMessage as any).parts)) {
              userContent = (lastMessage as any).parts
                .filter((part: any) => typeof part === 'string' || (part && part.type === 'text'))
                .map((part: any) => typeof part === 'string' ? part : part.text || '')
                .join(' ');
            } 
            // Check if the message has content as string
            else if (typeof (lastMessage as any).content === 'string') {
              userContent = (lastMessage as any).content;
            } 
            // Check if the message has content as array
            else if ((lastMessage as any).content && Array.isArray((lastMessage as any).content)) {
              userContent = (lastMessage as any).content
                .filter((part: any) => typeof part === 'string' || (part && part.type === 'text'))
                .map((part: any) => typeof part === 'string' ? part : part.text || '')
                .join(' ');
            }
          }
          
          // If we couldn't extract content, check if the message itself is a string
          if (!userContent && typeof lastMessage === 'string') {
            userContent = lastMessage;
          }
          
          // Default to empty string if we can't extract content
          if (!userContent) {
            userContent = '';
            console.error('Could not extract user content from message:', lastMessage);
          }
          
          console.log('Extracted user content:', userContent);
          
          // Extract date from user message and fetch calendar events
          const { extractDateAndFetchEvents } = await import('@/lib/calendar/extract-date');
          console.log('Extracting date from user message:', userContent);
          
          try {
            const { date: targetDate, formattedDate, events: calendarEvents } = 
              await extractDateAndFetchEvents(userContent);
            
            console.log('Extracted date:', formattedDate);
            console.log('Found calendar events:', calendarEvents?.length || 0);
            
            // Prepare calendar data for the prompt
            let detailedCalendarData = "";
            if (calendarEvents && calendarEvents.length > 0) {
              detailedCalendarData = `# Calendar Events for ${formattedDate}\n\n`;
              detailedCalendarData += `## Day Overview\n${calendarEvents.length} event(s) scheduled.\n\n`;
              detailedCalendarData += `## Detailed Event Information\n\n`;
              
              calendarEvents.forEach((event, index) => {
                const start = event.start?.dateTime || event.start?.date || '';
                const end = event.end?.dateTime || event.end?.date || '';
                const startTime = start ? new Date(start).toLocaleString() : 'Unknown time';
                const endTime = end ? new Date(end).toLocaleString() : 'Unknown time';
                
                detailedCalendarData += `### Event ${index + 1}: ${event.summary || 'Untitled Event'}\n`;
                detailedCalendarData += `- Time: ${startTime} to ${endTime}\n`;
                if (event.location) detailedCalendarData += `- Location: ${event.location}\n`;
                if (event.description) detailedCalendarData += `- Description: ${event.description}\n`;
                
                if (event.attendees && event.attendees.length > 0) {
                  detailedCalendarData += `- Attendees:\n`;
                  event.attendees.forEach(attendee => {
                    const name = attendee.displayName || attendee.email || 'Unknown';
                    const status = attendee.responseStatus ? ` (${attendee.responseStatus})` : '';
                    detailedCalendarData += `  * ${name}${status}\n`;
                  });
                }
                
                if (event.organizer) {
                  detailedCalendarData += `- Organizer: ${event.organizer.displayName || event.organizer.email || 'Unknown'}\n`;
                }
                
                detailedCalendarData += '\n';
              });
            } else {
              detailedCalendarData = `No events scheduled for ${formattedDate || 'the requested date'}.`;
            }
            
            // Call the OpenAI API directly with streaming
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
              throw new Error('OpenAI API key is missing');
            }
            
            // Prepare a more specific prompt for calendar-based briefing generation
            const enhancedSystemPrompt = `${systemPromptText}

You are a briefing assistant that creates detailed government-style briefing books based on calendar data.

Government officials receive a daily briefing book that includes:
1. A copy of the day's schedule in an easy-to-scan format
2. Individual memos prepared for each key item on the schedule

For each calendar event, create a detailed memo that includes:
- Logistics (time, location, participants)
- Background information on the topic
- Context about the participants
- Talking points and suggested questions
- Any necessary preparation or follow-up actions

If there are no events for the specified date, respond with: "There are no events scheduled for this day. Your calendar is clear."

Format the briefing in a professional, government-style manner with clear headings and structured sections.`;
            
            console.log('Calling OpenAI API with streaming...');
            
            // Use streaming API
            const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: enhancedSystemPrompt },
                  { role: 'system', content: detailedCalendarData },
                  { role: 'user', content: userContent }
                ],
                temperature: 0.7,
                max_tokens: 4000,
                stream: true
              })
            });
            
            if (!openaiResponse.ok) {
              const errorData = await openaiResponse.text();
              console.error('OpenAI API error:', errorData);
              throw new Error(`OpenAI API error: ${openaiResponse.status}`);
            }
            
            // Process the streaming response
            const reader = openaiResponse.body?.getReader();
            const decoder = new TextDecoder('utf-8');
            let responseText = '';
            
            if (!reader) {
              console.error('Failed to get reader from response');
              throw new Error('Failed to get reader from response');
            }
            
            // Initial message
            assistantMessage.content = '';
            
            // Stream the response
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                  try {
                    const data = JSON.parse(line.substring(6));
                    if (data.choices?.[0]?.delta?.content) {
                      const content = data.choices[0].delta.content;
                      responseText += content;
                      
                      // Update the message with the generated text so far
                      assistantMessage.content = responseText;
                      
                      // Stream the update
                      dataStream.write({
                        type: 'data-message',
                        data: JSON.stringify(assistantMessage),
                      });
                    }
                  } catch (e) {
                    console.error('Error parsing streaming response:', e);
                  }
                }
              }
            }
            
            // Final update with complete response
            assistantMessage.content = responseText;
          } catch (error) {
            console.error('Error processing calendar data or OpenAI request:', error);
            assistantMessage.content = 'Sorry, I encountered an error while processing your calendar data or generating the briefing.';
          }
          
          // Write the final message
          dataStream.write({
            type: 'data-message',
            data: JSON.stringify(assistantMessage),
          });
        } catch (error) {
          console.error('Streaming error:', error);
          dataStream.write({
            type: 'data-message',
            data: JSON.stringify({
              id: generateUUID(),
              role: 'assistant',
              content: 'Sorry, I encountered an error while processing your request.',
              createdAt: new Date().toISOString()
            }),
          });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        await saveMessages({
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: message.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          })),
        });
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    // We're intentionally not using resumable streams (which require Redis)
    // Instead, we'll use the standard streaming approach directly
    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
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
