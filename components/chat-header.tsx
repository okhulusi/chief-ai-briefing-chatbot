'use client';

// No longer using Link
import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';

import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon } from './icons';
import { useSidebar } from './ui/sidebar';
import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

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

  const { width: windowWidth } = useWindowSize();

  return (
    <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 md:px-2 gap-2">
      <SidebarToggle />

      {(!open || windowWidth < 768) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="order-2 md:order-1 md:px-2 px-2 md:h-fit ml-auto md:ml-0"
              onClick={async () => {
                try {
                  const res = await fetch('/api/briefing', { method: 'POST' });
                  const data = await res.json();
                  const id = data.id;
                  if (id !== undefined) {
                    router.push(`/chat/${id}`);
                    router.refresh();
                  }
                } catch (_) {
                  // eslint-disable-next-line no-console
                  console.error('Failed to create briefing');
                }
              }}
            >
              <PlusIcon />
              <span className="sr-only">Generate New Briefing</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Generate New Briefing</TooltipContent>
        </Tooltip>
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return prevProps.selectedModelId === nextProps.selectedModelId;
});
