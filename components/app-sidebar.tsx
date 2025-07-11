'use client';

import type { User } from 'next-auth';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { mutate } from 'swr';

import { PlusIcon } from '@/components/icons';
import { SidebarHistory } from '@/components/sidebar-history';
import { SidebarUserNav } from '@/components/sidebar-user-nav';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './ui/dropdown-menu';

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center">
            <div className="flex flex-row gap-3 items-center">
              <span className="text-lg font-semibold px-2 rounded-md">
                Chatbot
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  type="button"
                  className="p-2 h-fit cursor-pointer"
                >
                  <PlusIcon />
                  <span className="sr-only">Generate new Briefing</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={async () => {
                    try {
                      // Show a loading toast to indicate briefing creation is in progress
                      toast.loading('Creating new briefing...');
                      
                      const res = await fetch('/api/briefing', { method: 'POST' });
                      const data = await res.json();
                      const id = data.id;
                      
                      if (id !== undefined) {
                        // Dismiss the loading toast
                        toast.dismiss();
                        toast.success('Briefing created');
                        
                        // Manually trigger a revalidation of all SWR cache
                        // This will refresh the sidebar history immediately
                        await mutate('/api/chat/history');
                        
                        setOpenMobile(false);
                        router.push(`/chat/${id}`);
                      }
                    } catch (_) {
                      toast.dismiss();
                      toast.error('Failed to create briefing');
                      // eslint-disable-next-line no-console
                      console.error('Failed to create briefing');
                    }
                  }}
                >
                  Generate new Briefing
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarHistory user={user} />
      </SidebarContent>
      <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
    </Sidebar>
  );
}
