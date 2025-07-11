import 'server-only';
import crypto from 'node:crypto';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  user,
  chat,
  type User,
  message,
  type DBMessage,
  type Chat,
  stream,
} from './schema';
import { generateHashedPassword } from './utils';

import { ChatSDKError } from '../errors';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUser(email: string): Promise<Array<User>> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get user by email',
    );
  }
}


export async function findOrCreateUserByEmail(email: string): Promise<User> {
  try {
    // Try to find the user first
    const users = await getUser(email);
    
    if (users.length > 0) {
      console.log(`Found existing user with email ${email}, ID: ${users[0].id}`);
      return users[0];
    }
    
    // If user doesn't exist, create them
    console.log(`Creating new user with email ${email}`);
    const userId = crypto.randomUUID();
    
    await db.insert(user).values({
      id: userId,
      email
    });
    
    // Return the newly created user
    const newUsers = await getUser(email);
    if (newUsers.length === 0) {
      throw new Error(`Failed to create user with email ${email}`);
    }
    
    return newUsers[0];
  } catch (error) {
    console.error('Error in findOrCreateUserByEmail:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to find or create user');
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create user');
  }
}

export async function updateUserGoogleTokens({
  userId,
  accessToken,
  refreshToken,
  expiryTime,
}: {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiryTime?: number;
}) {
  try {
    console.log(`Updating Google tokens for user ${userId}`);
    console.log('Token data:', {
      accessToken: accessToken ? 'exists' : 'missing',
      refreshToken: refreshToken ? 'exists' : 'missing',
      expiryTime: expiryTime || 'not provided'
    });
    
    // Only update the refresh token if provided
    const updateValues: any = { 
      googleAccessToken: accessToken,
      googleTokenExpiry: expiryTime ? new Date(expiryTime) : undefined
    };
    
    if (refreshToken) {
      updateValues.googleRefreshToken = refreshToken;
    }
    
    console.log('Update values:', updateValues);
    
    // Directly update the user - we've already verified the user exists by email
    const result = await db
      .update(user)
      .set(updateValues)
      .where(eq(user.id, userId));
      
    console.log('Update result:', result);
    
    // Verify the update by fetching the user again
    const updatedUser = await db
      .select({
        accessToken: user.googleAccessToken,
        refreshToken: user.googleRefreshToken,
        tokenExpiry: user.googleTokenExpiry,
      })
      .from(user)
      .where(eq(user.id, userId));
      
    if (updatedUser.length > 0) {
      console.log('Updated user tokens:', updatedUser[0]);
    } else {
      console.log('No user found after update, this is unexpected');
    }
    
    return result;
  } catch (error) {
    console.error('Failed to update Google tokens:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to update Google tokens');
  }
}

export async function getUserGoogleTokens(userId: string) {
  try {
    console.log(`Getting Google tokens for user ${userId}`);
    const result = await db
      .select({
        accessToken: user.googleAccessToken,
        refreshToken: user.googleRefreshToken,
        tokenExpiry: user.googleTokenExpiry,
      })
      .from(user)
      .where(eq(user.id, userId));
      
    if (result.length === 0) {
      console.log(`No user found with ID ${userId}`);
      return null;
    }
    
    console.log('Retrieved tokens:', {
      hasAccessToken: !!result[0].accessToken,
      hasRefreshToken: !!result[0].refreshToken,
      tokenExpiry: result[0].tokenExpiry
    });
    
    return result[0];
  } catch (error) {
    console.error('Failed to get Google tokens:', error);
    // Don't throw an error, just return null to allow graceful fallback
    return null;
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: 'private';
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save chat');
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    // First delete all messages associated with this chat
    await db.delete(message).where(eq(message.chatId, id));
    
    // Then delete all streams associated with this chat
    await db.delete(stream).where(eq(stream.chatId, id));
    
    // Finally delete the chat itself
    const result = await db.delete(chat).where(eq(chat.id, id)).returning();
    return result[0];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('deleteChatById error', error);
    return null;
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id),
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${startingAfter} not found`,
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${endingBefore} not found`,
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get chats by user id',
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('getChatById error', error);
    throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  try {
    return await db.insert(message).values(messages);
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save messages');
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('getMessagesByChatId error', error);
    return [];
  }
}

// Voting no longer supported
export async function voteMessage() {
  return null;
}
export async function saveDocument(_: {
  id: string;
  title: string;
  kind: any;
  content: string;
  userId: string;
}) {
  console.warn('saveDocument noop - document feature removed');
  return null;
}

export async function getDocumentsById(_: { id: string }) {
  return [] as any[];
}

export async function getDocumentById(_: { id: string }) {
  return null;
}

export async function deleteDocumentsByIdAfterTimestamp(_: {
  id: string;
  timestamp: Date;
}) {
  return [] as any[];
}

// Suggestions feature removed; keep stub for type safety
export async function saveSuggestions({
  suggestions,
}: { suggestions: Array<any> }) {
  console.warn('saveSuggestions noop - suggestions feature removed');
  return [];
}

export async function getSuggestionsByDocumentId({
  documentId,
}: { documentId: string }) {
  return [] as any[];
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message by id',
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete messages by chat id after timestamp',
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update chat visibility by id',
    );
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: { id: string; differenceInHours: number }) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000,
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, 'user'),
        ),
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message count by user id',
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create stream id',
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get stream ids by chat id',
    );
  }
}
