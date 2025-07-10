import type { ChatMessage } from '@/lib/types';

/**
 * Returns the initial bot message for a briefing chat if no user messages exist.
 */
export function getBriefingBotInitialMessage(chatTitle: string, messages: ChatMessage[]): ChatMessage | null {
  if (!chatTitle.toLowerCase().startsWith('briefing')) return null;
  const hasUserMessage = messages.some((msg) => msg.role === 'user');
  if (hasUserMessage) return null;
  return {
    id: 'briefing-bot-initial',
    role: 'assistant',
    parts: [{ type: 'text', text: 'What date do you want to generate the briefing for?' }],

  };
}
