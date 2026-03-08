'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Edit2, Mail, MessageSquare, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { vouchersApi, type Voucher, type UpdateVoucherRequest, type SendVoucherRequest } from '@/lib/api/vouchers';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function StatusBadge({ status }: { status?: string }) {
  const displayStatus = status ?? 'draft';
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    issued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    used: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    expired: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  const label = displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1);
  return <Badge className={cn('border-transparent text-[11px]', styles[displayStatus] ?? 'bg-slate-100 text-slate-700')}>{label}</Badge>;
}

export default function VoucherDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [newStatus, setNewStatus] = React.useState('');
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [sendMethod, setSendMethod] = React.useState<'email' | 'whatsapp'>('email');
  const [sendTo, setSendTo] = React.useState('');
  const [sendMessage, setSendMessage] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);

  const { data: voucherResponse, loading, error } = useApiQuery(
    () => vouchersApi.getById(id),
    [id],
  );

  const updateMutation = useApiMutation<UpdateVoucherRequest, any>((data) =>
    vouchersApi.update(id, data),
  );

  const voucher = React.useMemo(() => {
    if (!voucherResponse || !('data' in voucherResponse)) return null;
    const data = voucherResponse.data;
    return data ?? null;
  }, [voucherResponse]);

  const handleStatusUpdate = async () => {
    if (!newStatus) return;

    const result = await updateMutation.mutate({
      status: newStatus as any,
    });

    if (result) {
      toast.success('Voucher status updated successfully!');
      setNewStatus('');
    } else {
      toast.error(updateMutation.error?.message ?? 'Failed to update voucher');
    }
  };

  const openSendDialog = (method: 'email' | 'whatsapp') => {
    setSendMethod(method);
    const guestEmail = (voucher?.customFields?.guestEmail as string) ?? '';
    const guestPhone = (voucher?.customFields?.guestPhone as string) ?? '';
    setSendTo(method === 'email' ? guestEmail : guestPhone);
    setSendMessage(`Please find attached voucher ${voucher?.voucherNumber ?? ''}.`);
    setSendDialogOpen(true);
  };

  const handleSendVoucher = async () => {
    if (!sendTo.trim()) {
      toast.error(`Please enter a ${sendMethod === 'email' ? 'email address' : 'phone number'}`);
      return;
    }
    setIsSending(true);
    try {
      await vouchersApi.send(id, {
        to: [sendTo.trim()],
        message: sendMessage,
        sendMethod,
      });
      toast.success(`Voucher sent via ${sendMethod === 'email' ? 'Email' : 'WhatsApp'} successfully!`);
      setSendDialogOpen(false);
    } catch {
      toast.error(`Failed to send voucher via ${sendMethod}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await vouchersApi.getPdf(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${voucher?.voucherNumber ?? 'voucher'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded successfully!');
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!voucher || error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Voucher not found</p>
          <Button onClick={() => router.push('/vouchers')}>Back to Vouchers</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              {voucher.voucherNumber}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <StatusBadge status={voucher.status} />
              <span className="capitalize">{voucher.customFields?.type as string ?? 'voucher'}</span>
              <span>•</span>
              <span>{(voucher.customFields?.guestName as string) ?? 'Guest'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/vouchers/${id}/edit`)}><Edit2 className="h-4 w-4 mr-1" /> Edit</Button>
          <Button variant="outline" size="sm" onClick={() => openSendDialog('email')}><Mail className="h-4 w-4 mr-1" /> Email</Button>
          <Button variant="outline" size="sm" onClick={() => openSendDialog('whatsapp')}><MessageSquare className="h-4 w-4 mr-1" /> WhatsApp</Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}><Download className="h-4 w-4 mr-1" /> PDF</Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Guest Info */}
          <Card>
            <CardHeader><CardTitle className="text-base">Guest Information</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Guest Name</p>
                  <p className="font-medium text-sm">{(voucher.customFields?.guestName as string) ?? 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Email</p>
                  <p className="text-sm">{(voucher.customFields?.guestEmail as string) ?? 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Phone</p>
                  <p className="text-sm">{(voucher.customFields?.guestPhone as string) ?? 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Voucher Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Voucher Details</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Issue Date</p>
                  <p className="text-sm font-medium">
                    {new Date(voucher.issueDate).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Valid Until</p>
                  <p className="text-sm font-medium">
                    {new Date(voucher.validUntil).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                {voucher.items && voucher.items.length > 0 && (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Items</p>
                      <p className="text-sm font-medium">{voucher.items.length} item(s)</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
                      <p className="text-sm font-medium">
                        ₹{voucher.items.reduce((sum: any, item: any) => sum + ((item.amount ?? 0)), 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </>
                )}
                {voucher.discount !== undefined && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Discount</p>
                    <p className="text-sm font-medium">{voucher.discount}%</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator className="my-6" />

          {/* Status Management */}
          <Card>
            <CardHeader><CardTitle className="text-base">Change Status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium">New Status</label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger><SelectValue placeholder="Select new status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="issued">Issued</SelectItem>
                      <SelectItem value="used">Used</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={!newStatus || updateMutation.loading}
                  onClick={handleStatusUpdate}
                  className="gap-2"
                >
                  {updateMutation.loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update Status
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Send Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Voucher via {sendMethod === 'email' ? 'Email' : 'WhatsApp'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{sendMethod === 'email' ? 'Email Address' : 'Phone Number'}</Label>
              <Input
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder={sendMethod === 'email' ? 'guest@example.com' : '+91 98765 43210'}
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)} disabled={isSending}>Cancel</Button>
            <Button onClick={handleSendVoucher} disabled={isSending}>
              {isSending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
