'use client';

import * as React from 'react';
import {
  Sparkles, Copy, Trash2, Instagram, Facebook, Linkedin, Twitter,
  Eye, Loader2, Lightbulb, Check, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import {
  Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Textarea, Label, Tag, Skeleton, Separator,
} from '@/components/ui';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { marketingApi } from '@/lib/api/marketing';
import type {
  SocialContent, MarketingSuggestion, GenerateSocialContentRequest, GenerateSocialContentBatchRequest,
} from '@/lib/api/marketing';
import { toLocalDateString } from '@/lib/dates';

const PLATFORMS = ['instagram', 'facebook', 'linkedin', 'twitter'] as const;
const TONES = ['professional', 'casual', 'exciting', 'informative'] as const;

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'instagram':
      return <Instagram className="size-4 text-ds-chart-5" aria-hidden="true" />;
    case 'facebook':
      return <Facebook className="size-4 text-ds-info" aria-hidden="true" />;
    case 'linkedin':
      return <Linkedin className="size-4 text-ds-primary" aria-hidden="true" />;
    case 'twitter':
      return <Twitter className="size-4 text-ds-chart-2" aria-hidden="true" />;
    default:
      return null;
  }
}

function statusTone(status: string): 'success' | 'info' | 'warning' {
  if (status === 'posted') return 'success';
  if (status === 'scheduled') return 'warning';
  return 'info';
}

function csvRow(values: unknown[]) {
  return values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
}

function toCsv(rows: SocialContent[]) {
  const header = csvRow(['Platform', 'Content', 'Status', 'Scheduled for', 'Created']);
  const lines = rows.map((p) =>
    csvRow([p.platform, p.content, p.status, p.scheduledFor ?? '', p.createdAt ?? '']),
  );
  return [header, ...lines].join('\n');
}

async function exportAllPosts(platform: string | undefined) {
  const pageSize = 200;
  let page = 1;
  let all: SocialContent[] = [];
  for (;;) {
    const res = await marketingApi.socialContent.list({ page, limit: pageSize, platform });
    const items = res.data;
    all = all.concat(items);
    if (all.length >= res.pagination.total || items.length === 0) break;
    page += 1;
  }
  const csv = toCsv(all);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `social-content-${toLocalDateString(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function PostDetail({ post, onSaved }: { post: SocialContent; onSaved: () => void }) {
  const [content, setContent] = React.useState(post.content);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => setContent(post.content), [post]);

  async function handleSave() {
    if (!content.trim()) {
      toast.error('Content cannot be empty');
      return;
    }
    setSaving(true);
    try {
      await marketingApi.socialContent.update(post.id, { content });
      toast.success('Post updated');
      onSaved();
    } catch {
      toast.error('Failed to update post');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex items-center gap-ds-2">
        <PlatformIcon platform={post.platform} />
        <span className="text-sm font-medium capitalize text-ds-foreground">{post.platform}</span>
        <Tag tone={statusTone(post.status)}>{post.status}</Tag>
      </div>

      {post.imageUrl && (
        <img src={post.imageUrl} alt="Social content" className="max-w-xs rounded-ds-md" />
      )}

      <div className="flex flex-col gap-ds-2">
        <Label htmlFor="post-content">Content</Label>
        <Textarea
          id="post-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
        />
        <p className="text-xs text-ds-foreground-subtle">{content.length} characters</p>
      </div>

      {post.scheduledFor && (
        <p className="text-xs text-ds-foreground-subtle">
          Scheduled: {new Date(post.scheduledFor).toLocaleString()}
        </p>
      )}

      <Separator />

      <div className="flex flex-col gap-ds-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            navigator.clipboard.writeText(post.content);
            toast.success('Copied to clipboard');
          }}
        >
          <Copy aria-hidden="true" /> Copy content
        </Button>
        <Button className="w-full" onClick={() => void handleSave()} disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}

function GenerateDialog({
  open, onOpenChange, onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: () => void;
}) {
  const [topic, setTopic] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [platforms, setPlatforms] = React.useState<string[]>(['instagram']);
  const [tone, setTone] = React.useState<(typeof TONES)[number]>('casual');
  const [generating, setGenerating] = React.useState(false);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleGenerate() {
    if (!topic.trim()) {
      toast.error('Please enter a topic');
      return;
    }
    if (platforms.length === 0) {
      toast.error('Select at least one platform');
      return;
    }
    setGenerating(true);
    try {
      if (platforms.length > 1) {
        await marketingApi.socialContent.generateBatch({
          topic,
          destination: destination || undefined,
          platforms: platforms as GenerateSocialContentBatchRequest['platforms'],
          tone,
        });
      } else {
        await marketingApi.socialContent.generate({
          topic,
          destination: destination || undefined,
          platform: platforms[0] as GenerateSocialContentRequest['platform'],
          tone,
        });
      }
      toast.success('Posts generated');
      onOpenChange(false);
      setTopic('');
      setDestination('');
      onGenerated();
    } catch {
      toast.error('Failed to generate posts. Check your AI provider is configured.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate social posts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-ds-4">
          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="gen-topic">Topic / offer</Label>
            <Input
              id="gen-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Summer promotion"
            />
          </div>
          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="gen-destination">Destination</Label>
            <Input
              id="gen-destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g., Maldives"
            />
          </div>
          <div className="flex flex-col gap-ds-2">
            <Label>Platforms</Label>
            <div className="grid grid-cols-4 gap-ds-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={
                    platforms.includes(p)
                      ? 'flex flex-col items-center gap-ds-1 rounded-ds-md border border-ds-primary bg-ds-primary-subtle p-ds-2 text-ds-primary-on-subtle'
                      : 'flex flex-col items-center gap-ds-1 rounded-ds-md border border-ds-border p-ds-2 text-ds-foreground-muted hover:bg-ds-surface-raised'
                  }
                >
                  <PlatformIcon platform={p} />
                  <span className="text-xs capitalize">{p}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="gen-tone">Tone</Label>
            <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
              <SelectTrigger id="gen-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={() => void handleGenerate()} disabled={generating} className="gap-ds-2">
            {generating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuggestionsPanel() {
  const { enabled, reason, loading: gateLoading } = useFeatureGate('ai_assistant');
  const [suggestions, setSuggestions] = React.useState<MarketingSuggestion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [actingId, setActingId] = React.useState<string | null>(null);

  const loadSuggestions = React.useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await marketingApi.suggestions.list({ status: 'pending', limit: 20 });
      setSuggestions(res.data);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  React.useEffect(() => {
    if (!gateLoading && enabled) void loadSuggestions();
    if (!gateLoading && !enabled) setLoading(false);
  }, [gateLoading, enabled, loadSuggestions]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await marketingApi.suggestions.generate();
      toast.success('New suggestions generated');
      await loadSuggestions();
    } catch {
      toast.error('Failed to generate suggestions');
    } finally {
      setGenerating(false);
    }
  }

  async function handleAccept(s: MarketingSuggestion) {
    setActingId(s.id);
    try {
      await marketingApi.suggestions.accept(s.id);
      toast.success('Suggestion accepted');
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    } catch {
      toast.error('Failed to accept suggestion');
    } finally {
      setActingId(null);
    }
  }

  async function handleDismiss(s: MarketingSuggestion) {
    setActingId(s.id);
    try {
      await marketingApi.suggestions.dismiss(s.id);
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    } catch {
      toast.error('Failed to dismiss suggestion');
    } finally {
      setActingId(null);
    }
  }

  if (gateLoading) return <Skeleton className="h-40 w-full" />;

  if (!enabled) {
    return (
      <div className="rounded-ds-md border border-ds-border bg-ds-surface p-ds-4">
        <div className="flex items-center gap-ds-2 text-ds-foreground-muted">
          <Lightbulb className="size-4" aria-hidden="true" />
          <p className="text-sm font-medium">AI suggestions</p>
        </div>
        <p className="mt-ds-1 text-sm text-ds-foreground-subtle">
          {reason === 'cap_exceeded' ? 'Usage limit reached for this billing period.' : 'Upgrade your plan to unlock AI-generated festival offer suggestions.'}
        </p>
        <Button size="sm" variant="outline" className="mt-ds-3" disabled>
          {reason === 'cap_exceeded' ? 'Limit reached' : 'Upgrade to enable'}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-ds-md border border-ds-border bg-ds-surface p-ds-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-ds-2">
          <Lightbulb className="size-4 text-ds-warning" aria-hidden="true" />
          <p className="text-sm font-medium text-ds-foreground">AI festival &amp; offer suggestions</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void handleGenerate()} disabled={generating} className="gap-ds-2">
          {generating ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="size-3.5" aria-hidden="true" />}
          Generate
        </Button>
      </div>

      <div className="mt-ds-3 flex flex-col gap-ds-2">
        {loading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : suggestions.length === 0 ? (
          <p className="py-ds-3 text-center text-sm text-ds-foreground-subtle">
            No pending suggestions. Click Generate to get AI-powered ideas.
          </p>
        ) : (
          suggestions.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-ds-3 rounded-ds-md border border-ds-border p-ds-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ds-foreground">{s.title}</p>
                <p className="text-xs text-ds-foreground-muted">{s.description}</p>
                {s.festivalName && (
                  <Tag tone="info" className="mt-ds-1">{s.festivalName}</Tag>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-ds-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Accept"
                  disabled={actingId === s.id}
                  onClick={() => void handleAccept(s)}
                >
                  <Check className="text-ds-success" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Dismiss"
                  disabled={actingId === s.id}
                  onClick={() => void handleDismiss(s)}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function SocialPage() {
  const { enabled: aiEnabled, reason: aiReason, loading: aiGateLoading } = useFeatureGate('ai_assistant');
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [platformFilter, setPlatformFilter] = React.useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [deleteTarget, setDeleteTarget] = React.useState<SocialContent | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await marketingApi.socialContent.delete(deleteTarget.id);
      toast.success('Post deleted');
      setReloadKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete post');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-col gap-ds-6 p-ds-6">
      <SuggestionsPanel />

      <ListPage<SocialContent>
        refreshKey={reloadKey}
        title="Social Content"
        description="AI-generated social media posts for your travel offerings."
        getRowId={(p) => p.id}
        fetcher={({ page, limit, search }) => {
          const q = search.trim();
          return marketingApi.socialContent.list({
            page,
            limit,
            platform: platformFilter,
            status: undefined,
            search: q || undefined,
          });
        }}
        columns={[
          {
            key: 'platform',
            header: 'Platform',
            cell: (p) => (
              <div className="flex items-center gap-ds-2">
                <PlatformIcon platform={p.platform} />
                <span className="capitalize text-ds-foreground">{p.platform}</span>
              </div>
            ),
          },
          {
            key: 'content',
            header: 'Content',
            cell: (p) => (
              <span className="block max-w-md truncate text-ds-foreground-muted" title={p.content}>
                {p.content}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (p) => <Tag tone={statusTone(p.status)} className="capitalize">{p.status}</Tag>,
          },
          {
            key: 'scheduledFor',
            header: 'Scheduled',
            cell: (p) => (p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'),
          },
        ]}
        primaryAction={
          aiGateLoading ? (
            <Skeleton className="h-9 w-36" />
          ) : (
            <Button
              size="sm"
              onClick={() => setGenerateOpen(true)}
              disabled={!aiEnabled}
              className="gap-ds-2"
              title={!aiEnabled ? (aiReason === 'cap_exceeded' ? 'Limit reached' : 'Upgrade to enable') : undefined}
            >
              <Sparkles aria-hidden="true" />
              {!aiEnabled ? (aiReason === 'cap_exceeded' ? 'Limit reached' : 'Upgrade to generate') : 'Generate posts'}
            </Button>
          )
        }
        searchPlaceholder="Search post content..."
        filters={
          platformFilter
            ? [{ id: 'platform', label: 'Platform', value: platformFilter }]
            : []
        }
        onRemoveFilter={() => setPlatformFilter(undefined)}
        onClearFilters={() => setPlatformFilter(undefined)}
        rowActions={(p) => (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy"
              onClick={() => {
                navigator.clipboard.writeText(p.content);
                toast.success('Copied to clipboard');
              }}
            >
              <Copy aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="View">
              <Eye aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setDeleteTarget(p)}>
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        )}
        renderDetail={(p) => <PostDetail post={p} onSaved={() => setReloadKey((k) => k + 1)} />}
        detailTitle={(p) => `${p.platform.charAt(0).toUpperCase()}${p.platform.slice(1)} post`}
        bulkActions={[
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              await Promise.all(rows.map((r) => marketingApi.socialContent.delete(r.id)));
              toast.success(`${rows.length} post${rows.length !== 1 ? 's' : ''} deleted`);
              setReloadKey((k) => k + 1);
            },
          },
        ]}
        onExport={async () => {
          await exportAllPosts(platformFilter);
        }}
        exportLabel="Export all"
        emptyIcon={<Sparkles className="size-10" aria-hidden="true" />}
        emptyTitle="No social posts yet"
        emptyDescription="Generate AI-powered captions for your travel offerings to get started."
        emptyAction={
          <Button size="sm" onClick={() => setGenerateOpen(true)} disabled={!aiEnabled}>
            Generate your first post
          </Button>
        }
      />

      <GenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={() => setReloadKey((k) => k + 1)}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete post</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ds-foreground-muted">
            Are you sure you want to delete this {deleteTarget?.platform} post? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
