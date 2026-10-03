'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';
import { TopNavbar } from './top-navbar';

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content (the top bar doubles as the Electron drag region) */}
      <div className={cn('flex-1 flex flex-col overflow-hidden min-w-0', className)}>
        <TopNavbar />
        <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col overflow-auto focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
