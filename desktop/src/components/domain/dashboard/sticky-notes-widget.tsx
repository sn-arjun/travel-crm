'use client';

import * as React from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { stickyNotesApi, type StickyNote as StickyNoteRecord } from '@/lib/api/sticky-notes';

interface StickyNote {
  id: string;
  content: string;
  color: string;
}

const colorClasses: Record<string, string> = {
  yellow: 'bg-yellow-100 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  green: 'bg-green-100 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  blue: 'bg-blue-100 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  pink: 'bg-pink-100 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800',
};

const textColorClasses: Record<string, string> = {
  yellow: 'text-yellow-900 dark:text-yellow-100 placeholder-yellow-600 dark:placeholder-yellow-300',
  green: 'text-green-900 dark:text-green-100 placeholder-green-600 dark:placeholder-green-300',
  blue: 'text-blue-900 dark:text-blue-100 placeholder-blue-600 dark:placeholder-blue-300',
  pink: 'text-pink-900 dark:text-pink-100 placeholder-pink-600 dark:placeholder-pink-300',
};

const colors = ['yellow', 'green', 'blue', 'pink'];

export function StickyNotesWidget() {
  const [notes, setNotes] = React.useState<StickyNote[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    stickyNotesApi.list({ limit: 50 })
      .then((res) => {
        const data = res.data as unknown;
        const list = Array.isArray(data) ? data : ((data as { data?: StickyNoteRecord[] })?.data ?? []);
        setNotes(list.map((n) => ({
          id: n.id,
          content: n.content || n.title || '',
          color: n.color || 'yellow',
        })));
      })
      .catch(() => {
        // graceful degradation — start with an empty board
      })
      .finally(() => setLoading(false));
  }, []);

  const deleteNote = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await stickyNotesApi.delete(id);
    } catch {
      toast.error('Failed to delete note');
    }
  };

  const updateNote = (id: string, content: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
  };

  const saveNote = async (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    setEditingId(null);
    try {
      await stickyNotesApi.update(id, { content: note.content, color: note.color });
    } catch {
      toast.error('Failed to save note');
    }
  };

  const changeColor = async (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const currentIndex = colors.indexOf(note.color);
    const nextColor = colors[(currentIndex + 1) % colors.length]!;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, color: nextColor } : n)));
    try {
      await stickyNotesApi.update(id, { color: nextColor });
    } catch {
      toast.error('Failed to update note color');
    }
  };

  const addNote = async () => {
    const color = colors[notes.length % colors.length]!;
    try {
      const res = await stickyNotesApi.create({ content: '', color });
      const created = res.data;
      setNotes((prev) => [...prev, { id: created.id, content: '', color }]);
      setEditingId(created.id);
    } catch {
      toast.error('Failed to create note');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex h-32 items-center justify-center p-ds-4">
          <Loader2 className="size-5 animate-spin text-ds-foreground-muted" aria-hidden="true" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-ds-3 p-ds-4">
        <div className="mb-ds-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ds-foreground">Quick Notes</h3>
          <Button variant="ghost" size="icon-sm" onClick={() => void addNote()} aria-label="Add note">
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-ds-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className={cn(
                'relative flex min-h-24 flex-col rounded-ds-lg border-2 p-ds-3 transition-all',
                colorClasses[note.color] || colorClasses.yellow,
              )}
              onClick={() => void changeColor(note.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void changeColor(note.id);
              }}
              title="Click to change color"
            >
              {editingId === note.id ? (
                <textarea
                  autoFocus
                  value={note.content}
                  onChange={(e) => updateNote(note.id, e.target.value)}
                  onBlur={() => void saveNote(note.id)}
                  className={cn(
                    'flex-1 resize-none border-0 bg-transparent p-0 text-xs focus:outline-none',
                    textColorClasses[note.color] || textColorClasses.yellow,
                  )}
                  placeholder="Type your note..."
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className={cn(
                    'flex-1 cursor-text overflow-hidden text-xs break-words',
                    textColorClasses[note.color] || textColorClasses.yellow,
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(note.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingId(note.id);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {note.content || <em>Click to edit...</em>}
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteNote(note.id);
                }}
                className="absolute top-ds-1 right-ds-1 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                aria-label="Delete note"
              >
                <X className={cn('size-3.5', textColorClasses[note.color] || textColorClasses.yellow)} aria-hidden="true" />
              </button>
            </div>
          ))}
          {notes.length === 0 && (
            <p className="col-span-2 py-ds-4 text-center text-xs text-ds-foreground-muted">
              No notes yet. Click + to add one.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
