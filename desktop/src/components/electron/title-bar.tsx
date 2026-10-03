'use client';

import * as React from 'react';
import { Minus, X, Maximize2, Minimize2 } from 'lucide-react';
import { useElectron } from '@/hooks/use-electron';

export function TitleBar() {
  const { isElectron, minimize, maximize, close } = useElectron();
  const [isMaximized, setIsMaximized] = React.useState(false);

  React.useEffect(() => {
    if (!isElectron) return;
    const checkMaximized = async () => {
      const maximized = await window.electronAPI?.isMaximized();
      if (maximized !== undefined) setIsMaximized(maximized);
    };
    checkMaximized();

    const handleResize = () => checkMaximized();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isElectron]);

  if (!isElectron) return null;

  const handleMaximize = async () => {
    await maximize();
    const maximized = await window.electronAPI?.isMaximized();
    if (maximized !== undefined) setIsMaximized(maximized);
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex h-8 items-center justify-between bg-ds-surface border-b border-ds-border">
      {/* Drag region */}
      <div className="flex-1 h-full electron-drag" />

      {/* Window controls */}
      <div className="flex items-center electron-no-drag">
        <button
          onClick={minimize}
          className="flex h-8 w-11 items-center justify-center text-ds-foreground-muted hover:bg-ds-surface-sunken transition-colors"
          aria-label="Minimize"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-8 w-11 items-center justify-center text-ds-foreground-muted hover:bg-ds-surface-sunken transition-colors"
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
        <button
          onClick={close}
          className="flex h-8 w-11 items-center justify-center text-ds-foreground-muted hover:bg-ds-danger hover:text-ds-danger-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
