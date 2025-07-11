# ChiefAI Briefing Bot Demo App

## Overview

ChiefAI Briefing Bot is an AI-powered assistant designed to generate concise, informative daily briefings based on a user's calendar data. The application connects with Google Calendar, analyzes upcoming events, and creates well-structured briefings that include schedule summaries, key meetings, and action items.

**Most of this code was generated using Windsurf + GPT-4.1, GPT-3o, and Claude 3.7 Sonnet.**

## Key Features

- **Calendar Integration**: Connects with Google Calendar to fetch daily events
- **AI-Powered Briefings**: Generates concise, well-structured briefings based on calendar data
- **Chat Interface**: Allows users to interact with the AI assistant through a chat interface
- **Multiple Briefings**: Users can create and manage multiple briefings
- **Responsive Design**: Works seamlessly across desktop and mobile devices

## Technology Stack

### Frontend

- **Next.js 15**: React framework with App Router
- **React 19**: UI library
- **Tailwind CSS**: Utility-first CSS framework
- **SWR**: React Hooks for data fetching
- **Framer Motion**: Animation library
- **Radix UI**: Unstyled, accessible UI components

### Backend

- **Next.js API Routes**: Serverless functions
- **OpenAI API**: Powers the AI briefing generation (GPT-4o)
- **Google Calendar API**: Fetches calendar events
- **NextAuth.js**: Authentication with Google OAuth

### Database

- **PostgreSQL**: Primary database
- **Drizzle ORM**: Type-safe SQL query builder
- **Vercel Postgres**: Managed PostgreSQL service

## Architecture

The application follows a modern Next.js architecture with the App Router pattern. The frontend and backend are tightly integrated, with API routes handling server-side operations and React components managing the UI. The application uses a PostgreSQL database with Drizzle ORM for data persistence.

Key architectural components include:

1. **Authentication Flow**: Google OAuth via NextAuth.js
2. **Calendar Integration**: API routes to fetch and process Google Calendar data
3. **AI Processing**: OpenAI API integration for generating briefings
4. **Data Persistence**: PostgreSQL database for storing chats and user data

## Project Structure

```text
/
├── app/                  # Next.js App Router structure
│   ├── (auth)/           # Authentication-related routes
│   ├── (chat)/           # Chat interface routes
│   └── api/              # API routes
│       ├── auth/         # Authentication endpoints
│       ├── briefing/     # Briefing generation endpoints
│       ├── calendar/     # Calendar integration endpoints
│       └── chat/         # Chat functionality endpoints
├── components/           # React components
├── hooks/                # Custom React hooks
├── lib/                  # Utility functions and libraries
│   ├── ai/               # AI-related utilities
│   ├── db/               # Database schema and utilities
│   └── types.ts          # TypeScript type definitions
├── public/               # Static assets
└── tests/                # Test files
```

## Key Code Files

### Core Application Files

- `app/(chat)/page.tsx` - Main application page with chat interface
- `app/(chat)/chat/[id]/page.tsx` - Individual chat/briefing page
- `app/(auth)/auth.ts` - Authentication configuration with Google OAuth
- `app/api/briefing/route.ts` - API endpoint for creating new briefings
- `app/api/calendar/import/route.ts` - API endpoint for importing Google Calendar data
- `app/api/chat/route.ts` - API endpoint for chat functionality and AI processing

### Component Files

- `components/app-sidebar.tsx` - Sidebar navigation with briefing management
- `components/chat.tsx` - Main chat interface component
- `components/message.tsx` - Individual message rendering component
- `components/greeting.tsx` - Welcome screen component
- `components/sidebar-history.tsx` - Chat history management component

### Database and Utilities

- `lib/db/schema.ts` - Database schema definitions using Drizzle ORM
- `lib/db/briefing.ts` - Briefing creation and management functions
- `lib/ai/prompts.ts` - System prompts for AI briefing generation
- `lib/types.ts` - TypeScript type definitions for the application

### Database Schema

The application uses Drizzle ORM with a PostgreSQL database (Neon). The database schema includes:

- `User` - User account information
- `Chat` - Briefing metadata and settings
- `Message` - Individual chat messages
- `Stream` - Streaming data for real-time updates

## Application Flow

### User Journey

1. **Authentication**: Users sign in with their Google account, which grants access to their calendar data
2. **Briefing Creation**: Users can create a new briefing by clicking the "Generate new Briefing" button
3. **Calendar Import**: Users can import their calendar data by clicking the "Import Calendar" button
4. **Briefing Interaction**: Users can interact with the AI assistant through a chat interface to get information about their schedule

### AI Processing

The application uses OpenAI's GPT-4o model to generate briefings based on calendar data. The process works as follows:

1. Calendar data is fetched from the Google Calendar API
2. The data is processed and formatted for the AI model
3. A system prompt instructs the model to create a well-structured briefing
4. The model generates a response that includes:
   - A summary of the day's schedule
   - Key meetings and their times
   - Any action items or preparations needed
5. If no events are found, the model returns a message indicating there are no events to generate a briefing from

## Configuration

All APIs and services (OpenAI, Google Calendar, PostgreSQL, etc.) are configured through environment variables. Vercel makes this configuration process super easy with its environment management system, allowing you to securely store and access all necessary credentials without hardcoding them in your codebase. The `vercel env pull` command automatically downloads all your configured environment variables to a local `.env.local` file, making local development seamless.

## Running Locally

1. Clone the repository
2. Install dependencies: `npm install` or `pnpm install`
3. Get environment variables from Vercel:

   ```bash
   npm install -g vercel
   vercel link  # Link to your Vercel project
   vercel env pull  # Download environment variables to .env.local
   ```

4. Run the development server: `npm run dev` or `pnpm dev`
5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Deployment

This application is designed to be deployed on Vercel. To deploy your own version:

1. Fork this repository
2. Connect your fork to Vercel
3. Configure the required environment variables
4. Deploy!
