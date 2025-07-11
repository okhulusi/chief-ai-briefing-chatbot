import { tool, type UIMessageStreamWriter } from 'ai';
import type { Session } from 'next-auth';
import { z } from 'zod';
import type { ChatMessage } from '@/lib/types';

// This is a stub implementation since the document feature has been removed
// It maintains the same interface but doesn't actually do anything

interface UpdateDocumentProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

export const updateDocument = ({ session, dataStream }: UpdateDocumentProps) =>
  tool({
    description: 'Update a document with the given description.',
    inputSchema: z.object({
      id: z.string().describe('The ID of the document to update'),
      description: z
        .string()
        .describe('The description of changes that need to be made'),
    }),
    execute: async ({ id, description }) => {
      // Stub implementation that returns a simple error message
      // since the document feature has been removed
      return {
        error: 'Feature not available',
      };
    },
  });
