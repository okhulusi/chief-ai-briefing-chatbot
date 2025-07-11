-- Drizzle migration: reset to minimal schema (User, Chat, Message, Stream)
-- Drop legacy tables if they still exist

DROP TABLE IF EXISTS "Vote";
DROP TABLE IF EXISTS "Vote_v2";
DROP TABLE IF EXISTS "Document";
DROP TABLE IF EXISTS "Suggestion";
DROP TABLE IF EXISTS "Message_v2";

-- Core tables
CREATE TABLE IF NOT EXISTS "User" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar NOT NULL,
  "email" varchar UNIQUE NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Chat" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid REFERENCES "User"("id"),
  "title" varchar NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Message" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chatId" uuid NOT NULL REFERENCES "Chat"("id"),
  "role" varchar NOT NULL,
  "parts" json NOT NULL,
  "attachments" json NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Stream" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId" uuid REFERENCES "Message"("id"),
  "token" varchar NOT NULL,
  "index" integer NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
