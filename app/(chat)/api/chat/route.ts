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
    const dateResult = await extractDateAndFetchEvents(userContent).catch(() => null);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendFallback = async (text: string) => {
          const fallbackId = generateUUID();
          const fallbackMessage = {
            id: fallbackId,
            chatId,
            role: 'assistant' as const,
            parts: [{ type: 'text' as const, text }],
            attachments: [],
            createdAt: new Date(),
          };
          await saveMessages({ messages: [fallbackMessage] });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(fallbackMessage)}\n\n`));
          controller.close();
        };

        if (!dateResult || dateResult.confidence !== 'high') {
          return sendFallback('I was not confident about the date you requested. Could you please specify the date more clearly?');
        }

        if (!dateResult.events || dateResult.events.length === 0) {
          return sendFallback(`No calendar events found for ${dateResult.formattedDate}.`);
        }

        const eventList = dateResult.events.map(ev => `- ${ev.summary}${ev.start ? ` (${ev.start})` : ''}${ev.location ? ` @ ${ev.location}` : ''}`).join('\n');
        const { longitude, latitude, city, country } = geolocation(request);
        const requestHints: RequestHints = { longitude, latitude, city, country };
        
        // Construct the full system prompt by combining the base prompt with the specific briefing task.
        const baseSystemPrompt = systemPrompt({ selectedChatModel, requestHints });
        const briefingText = `Given the following events for ${dateResult.formattedDate}, generate a detailed, formal briefing for your principal.\n\nEvents:\n${eventList}`;
        const systemPromptText = `${baseSystemPrompt}\n\n${briefingText}`;

        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
          console.error('OpenAI API key is missing');
          return sendFallback('The service is temporarily unavailable due to a configuration issue.');
        }

        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiApiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPromptText },
              { role: 'user', content: userContent },
            ],
            stream: true,
            temperature: 0.2,
            max_tokens: 1500,
          }),
        });

        if (!openaiRes.ok || !openaiRes.body) {
          console.error('OpenAI API request failed:', await openaiRes.text());
          return sendFallback('Sorry, I was unable to generate a response. Please try again.');
        }

        const reader = openaiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantText = '';
        const assistantId = generateUUID();

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data === '[DONE]') {
                break;
              }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  assistantText += delta;
                  const partialMessage = { id: assistantId, role: 'assistant' as const, parts: [{ type: 'text' as const, text: assistantText }] };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(partialMessage)}\n\n`));
                }
              } catch (e) {
                console.error('Error parsing stream chunk:', e);
              }
            }
          }
        }

        await saveMessages({
          messages: [{
            id: assistantId,
            chatId,
            role: 'assistant',
            parts: [{ type: 'text', text: assistantText }],
            attachments: [],
            createdAt: new Date(),
          }],
        });

        controller.close();
      },
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });

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
