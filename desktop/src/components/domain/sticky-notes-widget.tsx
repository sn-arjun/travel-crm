'use client';

import * as React from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { stickyNotesApi } from '@/lib/api/sticky-notes';
import { toast } from 'sonner';

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

  // Load notes from API
  React.useEffect(() => {
    stickyNotesApi.list({ limit: 50 })
      .then((res: any) => {
        const data = res?.data;
        const list = Array.isArray(data) ? data : (data?.data ?? []);
        setNotes(list.map((n: any) => ({
          id: n.id,
          content: n.content || n.title || '',
          color: n.color || 'yellow',
        })));
      })
      .catch(() => {
        // If API fails, start with empty notes
      })
      .finally(() => setLoading(false));
  }, []);

  const deleteNote = async (id: string) => {
    setNotes(notes.filter((n) => n.id !== id));
    try {
      await stickyNotesApi.delete(id);
    } catch {
      toast.error('Failed to delete note');
    }
  };

  const updateNote = (id: string, content: string) => {
    setNotes(notes.map((n) => (n.id === id ? { ...n, content } : n)));
  };

  const saveNote = async (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    setEditingId(null);
    try {
      await stickyNotesApi.update(id, { content: note.content, color: note.color });
    } catch {
      // silent - note is saved locally anyway
    }
  };

  const changeColor = async (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const currentIndex = colors.indexOf(note.color);
    const nextColor = colors[(currentIndex + 1) % colors.length]!;
    setNotes(notes.map((n) => (n.id === id ? { ...n, color: nextColor } : n)));
    try {
      await stickyNotesApi.update(id, { color: nextColor });
    } catch {
      // silent
    }
  };

  const addNote = async () => {
    const color = colors[notes.length % colors.length]!;
    try {
      const res: any = await stickyNotesApi.create({ content: '', color });
      const created = res?.data;
      if (created?.id) {
        const newNote: StickyNote = { id: created.id, content: '', color };
        setNotes([...notes, newNote]);
        setEditingId(created.id);
      }
    } catch {
      toast.error('Failed to create note');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Quick Notes</h3>
          <Button variant="ghost" size="icon-sm" onClick={addNote} title="Add note">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className={cn(
                'relative p-3 rounded-lg border-2 transition-all min-h-24 flex flex-col',
                colorClasses[note.color] || colorClasses.yellow,
              )}
              onClick={() => changeColor(note.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') changeColor(note.id);
              }}
              title="Click to change color"
            >
              {editingId === note.id ? (
                <textarea
                  autoFocus
                  value={note.content}
                  onChange={(e) => updateNote(note.id, e.target.value)}
                  onBlur={() => saveNote(note.id)}
                  className={cn(
                    'flex-1 bg-transparent border-0 resize-none focus:outline-none text-xs p-0',
                    textColorClasses[note.color] || textColorClasses.yellow,
                  )}
                  placeholder="Type your note..."
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className={cn(
                    'flex-1 text-xs cursor-text overflow-hidden break-words',
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
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNote(note.id);
                }}
                className="absolute top-1 right-1 opacity-0 hover:opacity-100 transition-opacity"
                title="Delete note"
              >
                <X className={cn('h-3.5 w-3.5', textColorClasses[note.color] || textColorClasses.yellow)} />
              </button>
            </div>
          ))}
          {notes.length === 0 && (
            <p className="col-span-2 text-xs text-muted-foreground text-center py-4">No notes yet. Click + to add one.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
