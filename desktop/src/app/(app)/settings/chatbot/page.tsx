'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Check, Clock, Code2, Copy, Globe, Loader2, Lock, MessageSquare, Save, Sparkles,
} from 'lucide-react';
import {
  Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Switch, Separator, Tabs, TabsList, TabsTrigger, TabsContent, Textarea, Skeleton, PageHeader,
} from '@/components/ui';
import { useApiMutation, useApiQuery } from '@/hooks/use-api';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { chatbotApi, type ChatbotConfig, type UpdateChatbotConfigRequest } from '@/lib/api/chatbot';
import { toast } from 'sonner';
import { color } from '@/design-system/tokens';

// Default widget accent: the product primary colour (light theme value).
const DEFAULT_WIDGET_COLOR = color('primary', 'light');
import { PageContainer } from '@/components/layout/page-container';

function ChatbotSettingsContent() {
  const [isSaving, setIsSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('website');
  const [copied, setCopied] = React.useState(false);

  const { data: configResponse, loading } = useApiQuery(() => chatbotApi.config.get(), []);
  const config: ChatbotConfig | null = configResponse?.data ?? null;

  const [webBotEnabled, setWebBotEnabled] = React.useState(true);
  const [widgetPosition, setWidgetPosition] = React.useState<'bottom-right' | 'bottom-left'>('bottom-right');
  const [primaryColor, setPrimaryColor] = React.useState(DEFAULT_WIDGET_COLOR);
  const [welcomeMessage, setWelcomeMessage] = React.useState('Hi! How can we help you today?');

  const [whatsappEnabled, setWhatsappEnabled] = React.useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = React.useState(true);
  const [greetingMessage, setGreetingMessage] = React.useState('Thanks for reaching out! We\'ll get back to you soon.');

  React.useEffect(() => {
    if (!config) return;
    setWebBotEnabled(config.enabled);
    setWelcomeMessage(config.welcomeMessage ?? '');
    const web = config.channels?.find((c) => c.platform === 'web');
    if (web) {
      setWidgetPosition((web.config?.position as 'bottom-right' | 'bottom-left') ?? 'bottom-right');
      setPrimaryColor((web.config?.primaryColor as string) ?? DEFAULT_WIDGET_COLOR);
    }
    const whatsapp = config.channels?.find((c) => c.platform === 'whatsapp');
    if (whatsapp) {
      setWhatsappEnabled(whatsapp.enabled);
      setAutoReplyEnabled((whatsapp.config?.autoReply as boolean) ?? true);
      setGreetingMessage((whatsapp.config?.greetingMessage as string) ?? '');
    }
  }, [config]);

  const { mutate: saveSettings } = useApiMutation<UpdateChatbotConfigRequest, unknown>(
    (data) => chatbotApi.config.update(data),
  );

  const handleSaveSettings = async () => {
    setIsSaving(true);
    const payload: UpdateChatbotConfigRequest = {
      enabled: webBotEnabled,
      welcomeMessage,
      channels: [
        { platform: 'web', enabled: webBotEnabled, config: { position: widgetPosition, primaryColor } },
        { platform: 'whatsapp', enabled: whatsappEnabled, config: { autoReply: autoReplyEnabled, greetingMessage } },
      ],
    };
    const result = await saveSettings(payload);
    setIsSaving(false);
    if (result) toast.success('Chatbot settings saved successfully');
    else toast.error('Failed to save chatbot settings');
  };

  const embedSnippet = `<script>\n  (function (w, d) {\n    var s = d.createElement('script');\n    s.src = '${chatbotApi.widgetUrl()}';\n    s.async = true;\n    d.head.appendChild(s);\n  })(window, document);\n</script>`;

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setCopied(true);
      toast.success('Embed snippet copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-ds-6">
      <PageHeader
        title="Chatbot configuration"
        description="Manage your AI-powered chatbot across multiple channels"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="website" className="gap-ds-2">
            <Globe className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Website bot</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-ds-2">
            <MessageSquare className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="install" className="gap-ds-2">
            <Code2 className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Install widget</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="website" className="space-y-ds-4">
          <Card>
            <CardHeader>
              <CardTitle>Website chatbot</CardTitle>
              <CardDescription>Configure your website widget settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-ds-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="web-enabled" className="text-base font-medium">Enable website chatbot</Label>
                  <p className="mt-ds-1 text-sm text-ds-foreground-muted">Make the chatbot visible on your website</p>
                </div>
                <Switch id="web-enabled" checked={webBotEnabled} onCheckedChange={setWebBotEnabled} />
              </div>

              <Separator />

              <div className="space-y-ds-3">
                <Label className="text-base font-medium">Widget position</Label>
                <Select value={widgetPosition} onValueChange={(v) => setWidgetPosition(v as typeof widgetPosition)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Bottom right</SelectItem>
                    <SelectItem value="bottom-left">Bottom left</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-ds-3">
                <Label className="text-base font-medium">Primary color</Label>
                <div className="flex items-center gap-ds-4">
                  <div
                    className="size-12 rounded-ds-lg border-2 border-ds-border"
                    style={{ backgroundColor: primaryColor }}
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.currentTarget.value)}
                    className="w-28 font-mono text-sm"
                    placeholder="Hex colour"
                  />
                  <Button size="sm" variant="outline" onClick={() => setPrimaryColor(DEFAULT_WIDGET_COLOR)}>Reset</Button>
                </div>
              </div>

              <div className="space-y-ds-3">
                <Label htmlFor="welcome-msg" className="text-base font-medium">Welcome message</Label>
                <Textarea
                  id="welcome-msg"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.currentTarget.value)}
                  placeholder="Enter the welcome message..."
                  className="min-h-24"
                />
                <p className="text-xs text-ds-foreground-muted">{welcomeMessage.length}/200 characters</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-ds-4">
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp bot</CardTitle>
              <CardDescription>Manage your WhatsApp automated responses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-ds-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="wa-enabled" className="text-base font-medium">Enable WhatsApp bot</Label>
                  <p className="mt-ds-1 text-sm text-ds-foreground-muted">Respond automatically to incoming WhatsApp messages</p>
                </div>
                <Switch id="wa-enabled" checked={whatsappEnabled} onCheckedChange={setWhatsappEnabled} />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-reply" className="text-base font-medium">Enable auto-reply</Label>
                  <p className="mt-ds-1 text-sm text-ds-foreground-muted">Send automatic responses during off-hours</p>
                </div>
                <Switch id="auto-reply" checked={autoReplyEnabled} onCheckedChange={setAutoReplyEnabled} />
              </div>

              <div className="space-y-ds-3">
                <Label htmlFor="greeting-msg" className="text-base font-medium">Greeting message</Label>
                <Textarea
                  id="greeting-msg"
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.currentTarget.value)}
                  placeholder="Enter the greeting message..."
                  className="min-h-24"
                />
                <p className="text-xs text-ds-foreground-muted">{greetingMessage.length}/300 characters</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="install" className="space-y-ds-4">
          <Card>
            <CardHeader>
              <CardTitle>Website embed snippet</CardTitle>
              <CardDescription>Paste this snippet before the closing <code>&lt;/body&gt;</code> tag on your website to show the chatbot widget.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-ds-4">
              <div className="relative">
                <pre className="overflow-auto rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-4 text-xs">
                  <code>{embedSnippet}</code>
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute right-ds-2 top-ds-2 gap-ds-2"
                  onClick={copySnippet}
                >
                  {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <div className="flex items-center gap-ds-2 text-xs text-ds-foreground-muted">
                <Clock className="size-3.5" aria-hidden="true" />
                Changes to website bot settings above apply the next time the widget loads.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-ds-3">
        <Button variant="outline" disabled={isSaving}>Cancel</Button>
        <Button onClick={handleSaveSettings} disabled={isSaving} className="gap-ds-2">
          {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}

function ChatbotSettingsPageContent() {
  const { enabled, reason, upgradeHref, loading } = useFeatureGate('ai_chatbot');

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 rounded-ds-lg border border-dashed border-ds-border py-ds-9 text-center">
        <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-surface-sunken">
          <Lock className="size-5 text-ds-foreground-muted" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-ds-foreground">
            {reason === 'cap_exceeded' ? "Today's chatbot quota is used up" : 'AI Chatbot is not on your plan'}
          </p>
          <p className="mt-ds-1 text-xs text-ds-foreground-muted">
            {reason === 'cap_exceeded'
              ? 'Your quota resets automatically tomorrow, or upgrade for a higher daily limit.'
              : 'Upgrade your plan to configure the AI chatbot.'}
          </p>
        </div>
        <Button asChild size="sm" className="gap-ds-2">
          <Link href={upgradeHref}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            {reason === 'cap_exceeded' ? 'Upgrade for more' : 'Upgrade to enable'}
          </Link>
        </Button>
      </div>
    );
  }

  return <ChatbotSettingsContent />;
}

export default function ChatbotSettingsPage() {
  return (
    <PageContainer>
      <ChatbotSettingsPageContent />
    </PageContainer>
  );
}
