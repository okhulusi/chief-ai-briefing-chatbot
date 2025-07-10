'use client';
import { useRouter } from 'next/navigation';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon, } from './icons';
import { useSidebar } from './ui/sidebar';
import { memo } from 'react';
import type { Session } from 'next-auth';

function PureChatHeader({
  chatId,
  selectedModelId,
  isReadonly,
  session,
}: {
  chatId: string;
  selectedModelId: string;

  isReadonly: boolean;
  session: Session;
}) {
  const router = useRouter();
  const { open } = useSidebar();

  return (
    <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 md:px-2 gap-2">
      <SidebarToggle />

      {(!open) && (
        <Button
          variant="ghost"
          size="icon"
          className="order-2 md:order-1"
          onClick={() => router.push('/chat/new')}
          data-testid="new-chat-button"
        >
          <PlusIcon />
        </Button>
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return prevProps.selectedModelId === nextProps.selectedModelId;
});
