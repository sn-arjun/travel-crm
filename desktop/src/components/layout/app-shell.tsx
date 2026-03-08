'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';
import { TopNavbar } from './top-navbar';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useElectron } from '@/hooks/use-electron';

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  const { isCollapsed } = useSidebarStore();
  const { isElectron } = useElectron();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Electron title bar spacer */}
      {isElectron && (
        <div className="fixed top-0 left-0 right-0 h-8 electron-drag z-50 bg-sidebar" />
      )}

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div
        className={cn(
          'flex-1 flex flex-col overflow-hidden transition-all duration-300',
          isElectron && 'pt-8',
          className,
        )}
      >
        <TopNavbar />
        <main className="flex-1 flex flex-col overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
