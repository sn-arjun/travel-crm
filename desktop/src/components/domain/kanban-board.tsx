'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  count: number;
  value?: string;
  children: React.ReactNode;
}

interface KanbanBoardProps {
  columns: KanbanColumn[];
  className?: string;
  onAddItem?: (columnId: string) => void;
}

function KanbanColumnHeader({ column, onAdd }: { column: KanbanColumn; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3 px-1">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} />
        <h3 className="text-sm font-semibold text-ds-foreground">{column.title}</h3>
        <Badge variant="outline">
          {column.count}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        {column.value && (
          <span className="text-xs font-medium text-ds-foreground-muted tabular-nums mr-1">
            {column.value}
          </span>
        )}
        {onAdd && (
          <Button variant="ghost" size="icon-sm" onClick={onAdd} className="h-6 w-6">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({ columns, className, onAddItem }: KanbanBoardProps) {
  return (
    <ScrollArea className={cn('w-full', className)}>
      <div className="flex gap-4 pb-4 min-w-max">
        {columns.map((column, idx) => (
          <div
            key={column.id}
            className="w-80 shrink-0 animate-slide-up"
            style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
          >
            <KanbanColumnHeader column={column} onAdd={onAddItem ? () => onAddItem(column.id) : undefined} />
            <div
              className={cn(
                'min-h-[200px] rounded-ds-lg border border-dashed border-ds-border bg-ds-surface-sunken/30 p-3 space-y-3',
                'transition-colors duration-200',
              )}
            >
              {column.children}
            </div>
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
