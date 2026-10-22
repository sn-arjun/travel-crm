'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  count: number;
  value?: string;
  /** Small muted text after the value, e.g. leads left out of the total. */
  valueNote?: string;
  /** Longer explanation of the value note, shown as a tooltip. */
  valueTitle?: string;
  children: React.ReactNode;
  /** Shown instead of the cards when the column has none. */
  empty?: React.ReactNode;
  isEmpty?: boolean;
  /** Below the cards, e.g. a "Load more" button. */
  footer?: React.ReactNode;
}

interface KanbanBoardProps {
  columns: KanbanColumn[];
  className?: string;
  onAddItem?: (columnId: string) => void;
  /** Makes the columns drop targets (HTML5 drag and drop); the card's own drag handlers live in the cards. */
  onDropItem?: (columnId: string, event: React.DragEvent) => void;
}

function KanbanColumnHeader({ column, onAdd }: { column: KanbanColumn; onAdd?: () => void }) {
  const t = useT();
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
          <span className="text-xs font-medium text-ds-foreground-muted tabular-nums me-1" title={column.valueTitle}>
            {column.value}
            {column.valueNote && <span className="ms-1 font-normal">{column.valueNote}</span>}
          </span>
        )}
        {onAdd && (
          <Button variant="ghost" size="icon-sm" aria-label={t('ui.kanban.addCard')} onClick={onAdd} className="h-6 w-6">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({ columns, className, onAddItem, onDropItem }: KanbanBoardProps) {
  const t = useT();
  const [overId, setOverId] = React.useState<string | null>(null);
  return (
    <ScrollArea className={cn('w-full', className)}>
      <div className="flex gap-4 pb-4 min-w-max">
        {columns.map((column, idx) => (
          <section
            key={column.id}
            aria-label={t('ui.kanban.column', { title: column.title, count: column.count })}
            className="w-80 shrink-0 animate-slide-up"
            style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
            onDragOver={onDropItem ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overId !== column.id) setOverId(column.id);
            } : undefined}
            onDragLeave={onDropItem ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverId((cur) => (cur === column.id ? null : cur));
            } : undefined}
            onDrop={onDropItem ? (e) => {
              e.preventDefault();
              setOverId(null);
              onDropItem(column.id, e);
            } : undefined}
          >
            <KanbanColumnHeader column={column} onAdd={onAddItem ? () => onAddItem(column.id) : undefined} />
            <div
              className={cn(
                'min-h-52 rounded-ds-lg border border-dashed border-ds-border bg-ds-surface-sunken p-3 space-y-3',
                'transition-colors duration-200',
                overId === column.id && 'border-solid border-ds-primary bg-ds-primary-subtle',
              )}
            >
              {column.isEmpty && column.empty ? column.empty : column.children}
              {column.footer}
            </div>
          </section>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
