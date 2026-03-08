'use client';

import * as React from 'react';
import { Mail, MessageSquare, Link2, Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SharePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  entityType: string;
  entityId: string;
}

export function SharePanel({
  open,
  onOpenChange,
  title,
  entityType,
  entityId,
}: SharePanelProps) {
  const [emailValue, setEmailValue] = React.useState('');
  const [phoneValue, setPhoneValue] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  // Generate a shareable link
  const shareLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${entityType}/${entityId}`;

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEmailShare = () => {
    if (!emailValue) return;
    const subject = encodeURIComponent(`Shared: ${title}`);
    const body = encodeURIComponent(
      `I wanted to share this with you:\n\n${title}\n\nLink: ${shareLink}`,
    );
    const mailtoLink = `mailto:${emailValue}?subject=${subject}&body=${body}`;
    window.open(mailtoLink);
    setEmailValue('');
  };

  const handleWhatsAppShare = () => {
    if (!phoneValue) return;
    const message = encodeURIComponent(
      `Check out this: ${title}\n\n${shareLink}`,
    );
    const whatsappLink = `https://wa.me/${phoneValue}?text=${message}`;
    window.open(whatsappLink, '_blank');
    setPhoneValue('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {title}</DialogTitle>
          <DialogDescription>
            Choose how you want to share this document
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Email Share Card */}
          <Card className="p-4 cursor-pointer border transition-colors hover:border-primary/50 hover:bg-accent/30">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <h4 className="font-semibold text-sm">Share via Email</h4>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-input" className="text-xs">
                  Email Address
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="email-input"
                    type="email"
                    placeholder="recipient@example.com"
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEmailShare();
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleEmailShare}
                    disabled={!emailValue}
                  >
                    Send
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Subject: {title}
              </p>
            </div>
          </Card>

          {/* WhatsApp Share Card */}
          <Card className="p-4 cursor-pointer border transition-colors hover:border-primary/50 hover:bg-accent/30">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h4 className="font-semibold text-sm">Share via WhatsApp</h4>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone-input" className="text-xs">
                  Phone Number
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="phone-input"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phoneValue}
                    onChange={(e) => setPhoneValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleWhatsAppShare();
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleWhatsAppShare}
                    disabled={!phoneValue}
                  >
                    Send
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Include country code (e.g., +91 for India)
              </p>
            </div>
          </Card>

          {/* Copy Link Card */}
          <Card className="p-4 cursor-pointer border transition-colors hover:border-primary/50 hover:bg-accent/30">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                <h4 className="font-semibold text-sm">Copy Shareable Link</h4>
              </div>
              <div className="space-y-2">
                <div className="flex gap-2 bg-muted p-2 rounded-md border text-xs font-mono truncate">
                  <span className="flex-1 truncate text-muted-foreground">
                    {shareLink}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="w-full"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1.5" />
                      Copy Link
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can view the document
              </p>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
