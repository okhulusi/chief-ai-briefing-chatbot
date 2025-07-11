-- Drizzle migration: fresh start with minimal schema (User, Chat, Message, Stream)
-- Create all tables from scratch since the database is empty

-- Core tables
CREATE TABLE IF NOT EXISTS "User" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(64) NOT NULL,
  "password" varchar(64)
);

CREATE TABLE IF NOT EXISTS "Chat" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "createdAt" timestamp NOT NULL,
  "title" text NOT NULL,
  "userId" uuid NOT NULL,
  "visibility" varchar DEFAULT 'private' NOT NULL,
  CONSTRAINT "Chat_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id")
);

CREATE TABLE IF NOT EXISTS "Message" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chatId" uuid NOT NULL,
  "role" varchar NOT NULL,
  "parts" json NOT NULL,
  "attachments" json NOT NULL,
  "createdAt" timestamp NOT NULL,
  CONSTRAINT "Message_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
);

CREATE TABLE IF NOT EXISTS "Stream" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "messageId" uuid,
  "token" varchar NOT NULL,
  "index" integer NOT NULL,
  "createdAt" timestamp NOT NULL,
  CONSTRAINT "Stream_messageId_Message_id_fk" FOREIGN KEY ("messageId") REFERENCES "Message"("id")
);
