import { z } from 'zod';
import type { Session } from 'next-auth';
import { tool, type UIMessageStreamWriter } from 'ai';
import type { ChatMessage } from '@/lib/types';

// This is a stub implementation since the suggestions feature has been removed
// It maintains the same interface but doesn't actually do anything

interface RequestSuggestionsProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

export const requestSuggestions = ({
  session,
  dataStream,
}: RequestSuggestionsProps) =>
  tool({
    description: 'Request suggestions for a document',
    inputSchema: z.object({
      documentId: z
        .string()
        .describe('The ID of the document to request edits'),
    }),
    execute: async ({ documentId }) => {
      // Stub implementation that returns a simple error message
      // since the document and suggestion features have been removed
      return {
        error: 'Feature not available',
      };
    },
  });

