'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Share2, Trash2 } from 'lucide-react';
import { DetailPage } from '@/components/domain';
import { SectionCard, Skeleton, Tag } from '@/components/ui';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { marketingApi, type MarketingFlyer } from '@/lib/api/marketing';
import { FlyerPreview, type FlyerContentForm } from '@/components/domain/marketing/flyer-content-fields';
import { ShareFlyerDialog } from '@/components/domain/marketing/share-flyer-dialog';

export default function FlyerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [flyer, setFlyer] = React.useState<MarketingFlyer | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await marketingApi.flyers.get(params.id);
      setFlyer(res.data);
    } catch {
      toast.error('Failed to load flyer');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    try {
      await marketingApi.flyers.upload(params.id, file);
      toast.success('Image uploaded');
      await load();
    } catch {
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete flyer',
      description: 'This flyer will be permanently deleted.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await marketingApi.flyers.delete(params.id);
      toast.success('Flyer deleted');
      router.push('/marketing/flyers');
    } catch {
      toast.error('Failed to delete flyer');
    }
  }

  if (loading || !flyer) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const content = (flyer.content ?? {}) as Partial<FlyerContentForm>;
  const previewData: FlyerContentForm = {
    title: flyer.title,
    templateId: flyer.templateId,
    headline: content.headline ?? flyer.title,
    subheadline: content.subheadline,
    offerText: content.offerText,
    contactInfo: content.contactInfo,
    colorScheme: content.colorScheme ?? 'ocean',
    fontSize: content.fontSize ?? 'medium',
  };

  return (
    <>
      <DetailPage<MarketingFlyer>
        entity={flyer}
        title={flyer.title}
        status={<Tag tone={flyer.status === 'published' ? 'success' : 'neutral'}>{flyer.status}</Tag>}
        onBack={() => router.push('/marketing/flyers')}
        primaryActions={
          <>
            <button
              type="button"
              onClick={() => router.push(`/marketing/flyers/${flyer.id}/edit`)}
              className="inline-flex items-center gap-ds-2 rounded-ds-md border border-ds-border px-ds-3 py-ds-2 text-sm font-medium text-ds-foreground hover:bg-ds-surface-raised focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none"
            >
              <Pencil className="size-4" aria-hidden="true" /> Edit
            </button>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-ds-2 rounded-ds-md border border-ds-border px-ds-3 py-ds-2 text-sm font-medium text-ds-foreground hover:bg-ds-surface-raised focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none"
            >
              <Share2 className="size-4" aria-hidden="true" /> Share
            </button>
          </>
        }
        actions={[
          { label: 'Delete', icon: <Trash2 aria-hidden="true" />, onSelect: () => void handleDelete(), destructive: true, separatorBefore: true },
        ]}
        overview={
          <div className="grid gap-ds-6 lg:grid-cols-2">
            <SectionCard title="Preview">
              <FlyerPreview data={previewData} />
            </SectionCard>
            <SectionCard title="Custom image" description="Upload a rendered image for this flyer.">
              <div className="flex flex-col gap-ds-4">
                {flyer.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={flyer.imageUrl} alt={flyer.title} className="max-h-64 w-full rounded-ds-md object-contain" />
                )}
                <FileDropzone
                  onFiles={(files) => void handleUpload(files)}
                  accept="image/*"
                  disabled={uploading}
                  label={uploading ? 'Uploading…' : 'Drop an image here, or browse'}
                  hint="PNG, JPG up to 5MB"
                />
              </div>
            </SectionCard>
          </div>
        }
      />

      <ShareFlyerDialog flyer={flyer} open={shareOpen} onOpenChange={setShareOpen} />
      {dialog}
    </>
  );
}
