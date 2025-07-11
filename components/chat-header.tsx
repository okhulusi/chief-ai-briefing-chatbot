'use client';

import { useRouter } from 'next/navigation';

import { SidebarToggle } from '@/components/sidebar-toggle';
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

      {/* Plus button removed as requested */}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return prevProps.selectedModelId === nextProps.selectedModelId;
});
