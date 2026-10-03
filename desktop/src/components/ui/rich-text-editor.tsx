'use client';

import * as React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = '7.5rem',
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    content: value || '',
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2',
          'min-h-[var(--min-height)]',
        ),
        style: `min-height: ${minHeight}; --min-height: ${minHeight}`,
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
  });

  // Sync external value changes
  React.useEffect(() => {
    if (editor && value !== undefined && editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className={cn('rounded-md border bg-background', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b bg-muted/30 p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn(
            'h-7 w-7',
            editor.isActive('bold') && 'bg-accent text-accent-foreground',
          )}
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn(
            'h-7 w-7',
            editor.isActive('italic') && 'bg-accent text-accent-foreground',
          )}
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn(
            'h-7 w-7',
            editor.isActive('bulletList') &&
              'bg-accent text-accent-foreground',
          )}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn(
            'h-7 w-7',
            editor.isActive('orderedList') &&
              'bg-accent text-accent-foreground',
          )}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
      </div>
      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}
