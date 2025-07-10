import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
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
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';
import type { ChatModel } from '@/lib/ai/models';
import type { VisibilityType } from '@/components/visibility-selector';

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
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
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel['id'];
      selectedVisibilityType: VisibilityType;
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

    // --- Briefing Book MVP: Detect first user message in a 'Briefing' chat ---
    const isBriefingChat = chat?.title?.toLowerCase().startsWith('briefing');
    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];
    const isFirstUserMessage = isBriefingChat && messagesFromDb.filter((m) => m.role === 'user').length === 0 && message.role === 'user';

    if (isFirstUserMessage) {
      // Try to parse the date from the user's message
      const dateText = (message.parts?.[0] && 'text' in message.parts[0]) ? message.parts[0].text?.trim() : undefined;
      let parsedDate: Date | null = null;
      if (dateText) {
        // Try YYYY-MM-DD
        const isoMatch = dateText.match(/\d{4}-\d{2}-\d{2}/);
        if (isoMatch) {
          parsedDate = new Date(isoMatch[0]);
        } else {
          // Try natural language (e.g., 'tomorrow', 'next Monday', 'July 10, 2025')
          try {
            parsedDate = new Date(dateText);
            if (Number.isNaN(parsedDate.getTime())) parsedDate = null;
          } catch {}
        }
      }
      if (!parsedDate) {
        // If not a valid date, reply with an error prompt
        return Response.json({
          messages: [
            {
              id: generateUUID(),
              role: 'assistant' as const,
              parts: [{ type: 'text', text: 'Sorry, I could not understand the date. Please reply with a date in YYYY-MM-DD format or a clear natural language date.' }],
              
            } satisfies ChatMessage,
          ],
        });
      }
      // --- Fetch Google Calendar events ---
      const accessToken = session.accessToken;
      if (!accessToken) {
        return Response.json({
          messages: [
            {
              id: generateUUID(),
              role: 'assistant' as const,
              parts: [{ type: 'text', text: 'Could not access your Google Calendar. Please re-login with Google.' }],
              
            } satisfies ChatMessage,
          ],
        });
      }
      let events: any[] = [];
      try {
        const { fetchGoogleCalendarEvents } = await import('@/lib/google/calendar');
        events = await fetchGoogleCalendarEvents(accessToken, parsedDate);
      } catch (err) {
        return Response.json({
          messages: [
            {
              id: generateUUID(),
              role: 'assistant' as const,
              parts: [{ type: 'text', text: 'Failed to fetch your schedule from Google Calendar.' }],
              
            } satisfies ChatMessage,
          ],
        });
      }
      // --- Compose prompt for OpenAI ---
      const scheduleSummary = events.length
        ? events.map((e) => `- ${e.summary || 'Untitled'} (${e.start?.dateTime || e.start?.date || ''} to ${e.end?.dateTime || e.end?.date || ''})`).join('\n')
        : 'No events found.';
      const openAIPrompt = `You are a government assistant. Here is the official's schedule for ${parsedDate.toDateString()}:\n${scheduleSummary}\n\nGenerate a briefing book for this day, including logistics, background, context, and talking points for each event.`;
      // --- Call OpenAI (using existing chat logic) ---
      // Insert the AI prompt as a system message and continue as normal
      const aiMessage: ChatMessage = {
        id: generateUUID(),
        role: 'system',
        parts: [{ type: 'text', text: openAIPrompt }],
        
      };
      uiMessages.push(aiMessage);
      // Continue with normal chat logic using uiMessages
      const title = await generateTitleFromUserMessage({
        message,
      });
      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const messagesFromDbFinal = await getMessagesByChatId({ id });
    const uiMessagesFinal = [...convertToUIMessages(messagesFromDbFinal), message];

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

    const stream = createUIMessageStream({
      execute: ({ writer: dataStream }) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages: convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(5),
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : [
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          }),
        );
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

    const streamContext = getStreamContext();

    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () =>
          stream.pipeThrough(new JsonToSseTransformStream()),
        ),
      );
    } else {
      return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
    }
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
