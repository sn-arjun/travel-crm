// HIDDEN (R112, owner question Q8): this page has no backend API behind it. It is not in the sidebar and next.config.ts redirects its route to /dashboard. Kept for the day the backend gets the feature.
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Trash2, Edit2 } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  body: string;
  target: string;
  priority: string;
  is_active: number;
  admin_name: string;
  published_at: string;
  expires_at: string | null;
  created_at: string;
}

const priorityColors: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; editing: Announcement | null }>({ open: false, editing: null });
  const [form, setForm] = useState({ title: '', body: '', target: 'all', priority: 'info', expiresAt: '' });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/announcements?page=${page}`);
    const data = await res.json() as { announcements: Announcement[]; totalPages: number };
    setItems(data.announcements || []);
    setTotalPages(data.totalPages || 1);
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openCreate = () => {
    setForm({ title: '', body: '', target: 'all', priority: 'info', expiresAt: '' });
    setDialog({ open: true, editing: null });
  };

  const openEdit = (a: Announcement) => {
    setForm({ title: a.title, body: a.body, target: a.target, priority: a.priority, expiresAt: a.expires_at || '' });
    setDialog({ open: true, editing: a });
  };

  const handleSave = async () => {
    if (dialog.editing) {
      await fetch(`/api/announcements/${dialog.editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    } else {
      await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    }
    setDialog({ open: false, editing: null });
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this announcement?')) return;
    await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
    fetchItems();
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Announcements' }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Announcements</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> New Announcement
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-3 px-4 font-medium">Title</th>
              <th className="text-left py-3 px-4 font-medium">Priority</th>
              <th className="text-left py-3 px-4 font-medium">Target</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-left py-3 px-4 font-medium">Created</th>
              <th className="text-right py-3 px-4 font-medium w-24" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No announcements</td></tr>
            ) : (
              items.map((a) => (
                <tr key={a.id} className="border-b hover:bg-muted/50">
                  <td className="py-3 px-4 font-medium">{a.title}</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={priorityColors[a.priority] || ''}>{a.priority}</Badge>
                  </td>
                  <td className="py-3 px-4 capitalize">{a.target}</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={a.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                      {a.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </div>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ ...dialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit Announcement' : 'New Announcement'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Title</label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Body (Markdown)</label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px]"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Priority</label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Target</label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                  <option value="all">All Tenants</option>
                  <option value="specific">Specific Tenants</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Expires At (optional)</label>
              <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, editing: null })}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.title || !form.body}>
              {dialog.editing ? 'Update' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
