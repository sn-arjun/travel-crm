'use client';

import * as React from 'react';
import {
  Sparkles, Copy, Edit2, Calendar, Instagram, Facebook, Linkedin, Twitter, Trash2, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { marketingApi } from '@/lib/api/marketing';
import type { SocialContent } from '@/lib/api/marketing';

interface GeneratorForm {
  topic: string;
  destination: string;
  platform: 'instagram' | 'facebook' | 'linkedin' | 'twitter';
  tone: 'professional' | 'casual' | 'exciting' | 'informative';
}

const mockDestinations = [
  'Maldives', 'Bali', 'Dubai', 'Thailand', 'Europe Tour', 'Goa',
  'Kashmir', 'Kerala', 'Singapore', 'Japan', 'Swiss Alps',
];

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'instagram':
      return <Instagram className="h-5 w-5 text-pink-600" />;
    case 'facebook':
      return <Facebook className="h-5 w-5 text-blue-600" />;
    case 'linkedin':
      return <Linkedin className="h-5 w-5 text-blue-700" />;
    case 'twitter':
      return <Twitter className="h-5 w-5 text-sky-500" />;
    default:
      return null;
  }
}

function PostCard({ post, onDelete, onUpdate }: { post: SocialContent; onDelete: (id: string) => void; onUpdate: (post: SocialContent) => void }) {
  const [copied, setCopied] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editContent, setEditContent] = React.useState(post.content);
  const [isSavingEdit, setIsSavingEdit] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(post.content);
    setCopied(true);
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  };

  const handleEdit = async () => {
    if (!editContent.trim()) {
      toast.error('Content cannot be empty');
      return;
    }
    setIsSavingEdit(true);
    try {
      const response = await marketingApi.socialContent.update(post.id, { content: editContent });
      if (response?.data) {
        toast.success('Post updated successfully');
        onUpdate(response.data);
        setEditOpen(false);
      } else {
        throw new Error('Failed to update');
      }
    } catch {
      toast.error('Failed to update post');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const characterCount = post.content.length;

  return (
    <>
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <PlatformIcon platform={post.platform} />
              <Badge variant="outline">{characterCount} chars</Badge>
              {post.status && <Badge variant="outline" className="capitalize">{post.status}</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
              >
                <Copy className="h-4 w-4 mr-1" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setEditContent(post.content); setEditOpen(true); }}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete(post.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
          <p className="text-sm mb-3 leading-relaxed">{post.content}</p>
          {post.imageUrl && (
            <img src={post.imageUrl} alt="Social content" className="mb-3 max-w-xs rounded" />
          )}
          {post.scheduledFor && (
            <p className="text-xs text-muted-foreground">Scheduled: {new Date(post.scheduledFor).toLocaleString()}</p>
          )}
        </CardContent>
      </Card>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={6}
              />
              <p className="text-xs text-muted-foreground">{editContent.length} characters</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isSavingEdit}>Cancel</Button>
            <Button onClick={handleEdit} disabled={isSavingEdit} className="gap-2">
              {isSavingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function SocialPage() {
  const [form, setForm] = React.useState<GeneratorForm>({
    topic: 'Weekend getaway packages',
    destination: 'Maldives',
    platform: 'instagram',
    tone: 'casual',
  });
  const [isGenerating, setIsGenerating] = React.useState(false);

  const { data: socialData, loading: socialLoading, refetch: refetchPosts } = useApiQuery(
    () => marketingApi.socialContent.list({
      platform: form.platform,
      limit: 50,
    }),
    [form.platform],
  );

  const { mutate: createPost, loading: isCreating } = useApiMutation(marketingApi.socialContent.create);
  const { mutate: deletePost } = useApiMutation(marketingApi.socialContent.delete);

  const posts = Array.isArray(socialData?.data) ? socialData.data : (socialData?.data?.data ?? []);

  const handleGenerate = async () => {
    if (!form.topic.trim()) {
      toast.error('Please enter a topic');
      return;
    }

    setIsGenerating(true);

    // Create a social content post (since we don't have a generate endpoint)
    const result = await createPost({
      platform: form.platform,
      content: `${form.topic} in ${form.destination} - Check out our amazing travel packages! #Travel #${form.destination}`,
    });

    if (result) {
      toast.success('Post created successfully!');
    } else {
      toast.error('Failed to create post');
    }

    setIsGenerating(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this post?')) {
      const result = await deletePost(id);
      if (result) {
        toast.success('Post deleted');
      } else {
        toast.error('Failed to delete post');
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Social Content Creator
          </h1>
          <p className="text-sm text-muted-foreground">Generate AI-powered social media posts for your travel offerings</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Generator Form */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Content Generator
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Topic/Offer</label>
                  <Input
                    value={form.topic}
                    onChange={(e) => setForm({ ...form, topic: e.target.value })}
                    placeholder="e.g., Summer promotion"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Destination</label>
                  <select
                    value={form.destination}
                    onChange={(e) => setForm({ ...form, destination: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  >
                    {mockDestinations.map((dest: any) => (
                      <option key={dest} value={dest}>{dest}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-3">Platform</label>
                <Tabs value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v as GeneratorForm['platform'] })}>
                  <TabsList className="grid grid-cols-4 w-full">
                    <TabsTrigger value="instagram" className="flex items-center gap-2">
                      <Instagram className="h-4 w-4" />
                      <span className="hidden sm:inline">Instagram</span>
                    </TabsTrigger>
                    <TabsTrigger value="facebook" className="flex items-center gap-2">
                      <Facebook className="h-4 w-4" />
                      <span className="hidden sm:inline">Facebook</span>
                    </TabsTrigger>
                    <TabsTrigger value="linkedin" className="flex items-center gap-2">
                      <Linkedin className="h-4 w-4" />
                      <span className="hidden sm:inline">LinkedIn</span>
                    </TabsTrigger>
                    <TabsTrigger value="twitter" className="flex items-center gap-2">
                      <Twitter className="h-4 w-4" />
                      <span className="hidden sm:inline">Twitter</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-3">Tone</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['professional', 'casual', 'exciting', 'informative'] as const).map((tone: any) => (
                    <button
                      key={tone}
                      onClick={() => setForm({ ...form, tone })}
                      className={cn(
                        'px-4 py-2 rounded-md border transition-colors capitalize text-sm',
                        form.tone === tone
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-input hover:bg-muted',
                      )}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isGenerating ? 'Generating...' : 'Generate Posts'}
              </Button>
            </CardContent>
          </Card>

          {/* Generated Posts */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Posts - {form.platform.charAt(0).toUpperCase() + form.platform.slice(1)}</h2>
            {socialLoading ? (
              <p className="text-muted-foreground">Loading posts...</p>
            ) : posts.length === 0 ? (
              <p className="text-muted-foreground">No posts yet for this platform</p>
            ) : (
              <div className="space-y-3">
                {posts.map((post: any) => (
                  <PostCard key={post.id} post={post} onDelete={handleDelete} onUpdate={() => { refetchPosts(); }} />
                ))}
              </div>
            )}
          </div>

          {/* Calendar Section */}
          <div className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Schedule Posts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Week of March 6, 2026</p>
                <div className="grid grid-cols-7 gap-2 mt-4">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                    <div key={day} className="border rounded-lg p-3 text-center text-sm hover:bg-muted cursor-pointer transition-colors">
                      <p className="font-semibold text-xs mb-2">{day}</p>
                      <p className="text-xs text-muted-foreground">{6 + i}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
