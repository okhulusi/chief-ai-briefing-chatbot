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
          
          // Extract content from the message based on its structure
          // Use type assertion to handle the TypeScript error
          const message = lastMessage as any;
          if (typeof message.content === 'string') {
            userContent = message.content;
          } else if (message.content && Array.isArray(message.content)) {
            // Handle array content format
            userContent = message.content
              .filter((part: any) => typeof part === 'string' || (part && part.type === 'text'))
              .map((part: any) => typeof part === 'string' ? part : part.text || '')
              .join(' ');
          } else {
            // Default to empty string if we can't extract content
            userContent = '';
          }
          
          // Call the OpenAI API directly
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            throw new Error('OpenAI API key is missing');
          }
          
          // Prepare a more specific prompt for calendar-based briefing generation
          const enhancedSystemPrompt = `${systemPromptText}

You are a briefing assistant that creates concise, informative briefings based on calendar data.

If calendar data is provided, analyze the events for the specified date and create a well-structured briefing that includes:
1. A summary of the day's schedule
2. Key meetings and their times
3. Any action items or preparations needed

If there are no events for the specified date, respond with: "There are no events to generate a briefing from today."

Format the briefing in a professional, easy-to-read manner.`;

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
                { role: 'user', content: userContent }
              ],
              temperature: 0.7,
              max_tokens: 2000
            })
          });
          
          if (!openaiResponse.ok) {
            const errorData = await openaiResponse.text();
            console.error('OpenAI API error:', errorData);
            throw new Error(`OpenAI API error: ${openaiResponse.status}`);
          }
          
          const data = await openaiResponse.json();
          const responseText = data.choices[0].message.content;
          
          // Update the message with the generated text
          assistantMessage.content = responseText;
          
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
