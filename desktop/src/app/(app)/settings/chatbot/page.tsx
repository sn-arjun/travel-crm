'use client';

import * as React from 'react';
import {
  MessageCircle,
  MessageSquare,
  Save,
  Loader2,
  Upload,
  Trash2,
  Plus,
  Clock,
  Globe,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApiMutation, useApiQuery } from '@/hooks/use-api';
import { chatbotApi, type ChatbotConfig, type UpdateChatbotConfigRequest } from '@/lib/api/chatbot';

interface FAQ {
  id: string;
  question: string;
  answer: string;
}

interface BusinessHour {
  day: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export default function ChatbotSettingsPage() {
  const [isSaving, setIsSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('website');

  // Website Bot State
  const [webBotEnabled, setWebBotEnabled] = React.useState(true);
  const [widgetPosition, setWidgetPosition] = React.useState<'bottom-right' | 'bottom-left'>('bottom-right');
  const [primaryColor, setPrimaryColor] = React.useState('#3b82f6');
  const [welcomeMessage, setWelcomeMessage] = React.useState('Hi! How can we help you today?');

  // WhatsApp Bot State
  const [whatsappConnected, setWhatsappConnected] = React.useState(true);
  const [whatsappPhone, setWhatsappPhone] = React.useState('+91 98765 43210');
  const [autoReplyEnabled, setAutoReplyEnabled] = React.useState(true);
  const [greetingMessage, setGreetingMessage] = React.useState('Thanks for reaching out! We\'ll get back to you soon.');

  // FAQs State
  const [faqs, setFaqs] = React.useState<FAQ[]>([
    {
      id: '1',
      question: 'What is your best-selling package?',
      answer: 'Our Maldives honeymoon packages are the most popular, offering luxury resorts and water sports activities.',
    },
    {
      id: '2',
      question: 'Do you offer visa assistance?',
      answer: 'Yes, we provide comprehensive visa assistance for all destinations. Our team handles documentation and submission.',
    },
    {
      id: '3',
      question: 'What is your cancellation policy?',
      answer: 'Cancellations made 30+ days before travel receive a full refund. Within 30 days, a 50% refund applies.',
    },
    {
      id: '4',
      question: 'Do you arrange travel insurance?',
      answer: 'Absolutely! We offer comprehensive travel insurance packages that cover medical emergencies and trip cancellations.',
    },
    {
      id: '5',
      question: 'How far in advance should I book?',
      answer: 'We recommend booking 2-3 months in advance for domestic trips and 3-6 months for international destinations.',
    },
  ]);
  const [editingFaqId, setEditingFaqId] = React.useState<string | null>(null);

  // Business Hours State
  const [businessHours, setBusinessHours] = React.useState<BusinessHour[]>([
    { day: 'Monday', enabled: true, startTime: '09:00', endTime: '18:00' },
    { day: 'Tuesday', enabled: true, startTime: '09:00', endTime: '18:00' },
    { day: 'Wednesday', enabled: true, startTime: '09:00', endTime: '18:00' },
    { day: 'Thursday', enabled: true, startTime: '09:00', endTime: '18:00' },
    { day: 'Friday', enabled: true, startTime: '09:00', endTime: '18:00' },
    { day: 'Saturday', enabled: true, startTime: '10:00', endTime: '16:00' },
    { day: 'Sunday', enabled: false, startTime: '10:00', endTime: '16:00' },
  ]);
  const [timezone, setTimezone] = React.useState('Asia/Kolkata');
  const [outsideHoursMessage, setOutsideHoursMessage] = React.useState(
    'We\'re currently offline. Our team will respond during business hours.',
  );

  const { mutate: saveSettings } = useApiMutation<UpdateChatbotConfigRequest, any>(
    (data) => chatbotApi.config.update(data),
  );

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const config: UpdateChatbotConfigRequest = {
        enabled: webBotEnabled,
        welcomeMessage,
        channels: [
          {
            platform: 'web',
            enabled: webBotEnabled,
            config: { position: widgetPosition, primaryColor },
          },
          {
            platform: 'whatsapp',
            enabled: whatsappConnected,
            config: { autoReply: autoReplyEnabled, greetingMessage },
          },
        ],
      };

      const result = await saveSettings(config);
      if (result) {
        toast.success('Chatbot settings saved successfully');
      } else {
        toast.error('Failed to save chatbot settings');
      }
    } catch (error) {
      toast.error('Failed to save chatbot settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFAQ = () => {
    const newFaq: FAQ = {
      id: String(Date.now()),
      question: '',
      answer: '',
    };
    setFaqs([...faqs, newFaq]);
    setEditingFaqId(newFaq.id);
  };

  const handleUpdateFAQ = (id: string, field: 'question' | 'answer', value: string) => {
    setFaqs(faqs.map((faq: any) => (faq.id === id ? { ...faq, [field]: value } : faq)));
  };

  const handleDeleteFAQ = (id: string) => {
    setFaqs(faqs.filter((faq: any) => faq.id !== id));
    toast.success('FAQ deleted');
  };

  const handleBusinessHourChange = (
    day: string,
    field: 'enabled' | 'startTime' | 'endTime',
    value: boolean | string,
  ) => {
    setBusinessHours(
      businessHours.map((bh: any) =>
        bh.day === day ? { ...bh, [field]: value } : bh,
      ),
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Chatbot Configuration</h1>
        <p className="text-muted-foreground mt-1">Manage your AI-powered chatbot across multiple channels</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="website" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Website Bot</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="faqs" className="gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">FAQs</span>
          </TabsTrigger>
          <TabsTrigger value="hours" className="gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Business Hours</span>
          </TabsTrigger>
        </TabsList>

        {/* Website Bot Tab */}
        <TabsContent value="website" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Website Chatbot</CardTitle>
              <CardDescription>Configure your website widget settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enable Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="web-enabled" className="text-base font-medium">
                    Enable Website Chatbot
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">Make the chatbot visible on your website</p>
                </div>
                <Switch
                  id="web-enabled"
                  checked={webBotEnabled}
                  onCheckedChange={setWebBotEnabled}
                />
              </div>

              <Separator />

              {/* Widget Position */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Widget Position</Label>
                <Select value={widgetPosition} onValueChange={(v) => setWidgetPosition(v as typeof widgetPosition)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Bottom Right</SelectItem>
                    <SelectItem value="bottom-left">Bottom Left</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Color Picker */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Primary Color</Label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-12 w-12 rounded-lg border-2 border-border cursor-pointer"
                      style={{ backgroundColor: primaryColor }}
                      onClick={() => {
                        // In a real app, this would open a color picker
                        setPrimaryColor('#8b5cf6');
                      }}
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.currentTarget.value)}
                      className="w-28 font-mono text-sm"
                      placeholder="#000000"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPrimaryColor('#3b82f6')}
                  >
                    Reset
                  </Button>
                </div>
              </div>

              {/* Welcome Message */}
              <div className="space-y-3">
                <Label htmlFor="welcome-msg" className="text-base font-medium">
                  Welcome Message
                </Label>
                <Textarea
                  id="welcome-msg"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.currentTarget.value)}
                  placeholder="Enter the welcome message..."
                  className="min-h-24"
                />
                <p className="text-xs text-muted-foreground">{welcomeMessage.length}/200 characters</p>
              </div>

              {/* Avatar Upload */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Avatar</Label>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="bg-blue-100 text-blue-700 font-bold">AI</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Button variant="outline" className="w-full gap-2">
                      <Upload className="h-4 w-4" />
                      Upload Avatar
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">PNG or JPG, max 2MB</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WhatsApp Bot Tab */}
        <TabsContent value="whatsapp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp Bot</CardTitle>
              <CardDescription>Manage your WhatsApp automated responses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Connection Status */}
              <div className="rounded-lg border border-emerald-200/50 dark:border-emerald-800/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-emerald-900 dark:text-emerald-100">Connection Status</p>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">Synced with WhatsApp Business API</p>
                  </div>
                  <Badge className="bg-emerald-600 text-white dark:bg-emerald-700">Connected</Badge>
                </div>
              </div>

              <Separator />

              {/* Phone Number */}
              <div className="space-y-3">
                <Label htmlFor="whatsapp-phone" className="text-base font-medium">
                  WhatsApp Phone Number
                </Label>
                <Input
                  id="whatsapp-phone"
                  value={whatsappPhone}
                  readOnly
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Verified on WhatsApp Business</p>
              </div>

              {/* Auto Reply */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-reply" className="text-base font-medium">
                    Enable Auto-Reply
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">Send automatic responses during off-hours</p>
                </div>
                <Switch
                  id="auto-reply"
                  checked={autoReplyEnabled}
                  onCheckedChange={setAutoReplyEnabled}
                />
              </div>

              {/* Greeting Message */}
              <div className="space-y-3">
                <Label htmlFor="greeting-msg" className="text-base font-medium">
                  Greeting Message
                </Label>
                <Textarea
                  id="greeting-msg"
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.currentTarget.value)}
                  placeholder="Enter the greeting message..."
                  className="min-h-24"
                />
                <p className="text-xs text-muted-foreground">{greetingMessage.length}/300 characters</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FAQs Tab */}
        <TabsContent value="faqs" className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">FAQs</h2>
              <p className="text-sm text-muted-foreground mt-1">Manage frequently asked questions</p>
            </div>
            <Button onClick={handleAddFAQ} className="gap-2">
              <Plus className="h-4 w-4" />
              Add FAQ
            </Button>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <Card key={faq.id}>
                <CardContent className="pt-6 space-y-4">
                  {editingFaqId === faq.id ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor={`q-${faq.id}`} className="text-sm font-medium">
                          Question
                        </Label>
                        <Input
                          id={`q-${faq.id}`}
                          value={faq.question}
                          onChange={(e) => handleUpdateFAQ(faq.id, 'question', e.currentTarget.value)}
                          placeholder="Enter question..."
                          autoFocus
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`a-${faq.id}`} className="text-sm font-medium">
                          Answer
                        </Label>
                        <Textarea
                          id={`a-${faq.id}`}
                          value={faq.answer}
                          onChange={(e) => handleUpdateFAQ(faq.id, 'answer', e.currentTarget.value)}
                          placeholder="Enter answer..."
                          className="min-h-20"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingFaqId(null)}
                        >
                          Done
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-sm font-medium text-foreground">Q: {faq.question}</p>
                        <p className="text-sm text-muted-foreground mt-2">A: {faq.answer}</p>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingFaqId(faq.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteFAQ(faq.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Business Hours Tab */}
        <TabsContent value="hours" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Business Hours</CardTitle>
              <CardDescription>Set your availability and offline messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Timezone */}
              <div className="space-y-3">
                <Label htmlFor="timezone" className="text-base font-medium">
                  Timezone
                </Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                    <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                    <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                    <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                    <SelectItem value="Asia/Bangkok">Asia/Bangkok (ICT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Daily Hours */}
              <div className="space-y-3">
                <p className="text-base font-medium">Operating Hours</p>
                {businessHours.map((bh: any) => (
                  <div key={bh.day} className="flex items-center gap-4 rounded-lg border border-border/50 bg-muted/30 p-3">
                    <Switch
                      checked={bh.enabled}
                      onCheckedChange={(checked) => handleBusinessHourChange(bh.day, 'enabled', checked)}
                      className="flex-shrink-0"
                    />
                    <span className="w-20 text-sm font-medium">{bh.day}</span>
                    <Input
                      type="time"
                      value={bh.startTime}
                      onChange={(e) => handleBusinessHourChange(bh.day, 'startTime', e.currentTarget.value)}
                      disabled={!bh.enabled}
                      className="w-24"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="time"
                      value={bh.endTime}
                      onChange={(e) => handleBusinessHourChange(bh.day, 'endTime', e.currentTarget.value)}
                      disabled={!bh.enabled}
                      className="w-24"
                    />
                  </div>
                ))}
              </div>

              <Separator />

              {/* Outside Hours Message */}
              <div className="space-y-3">
                <Label htmlFor="outside-hours" className="text-base font-medium">
                  Outside Hours Message
                </Label>
                <Textarea
                  id="outside-hours"
                  value={outsideHoursMessage}
                  onChange={(e) => setOutsideHoursMessage(e.currentTarget.value)}
                  placeholder="Enter message for outside business hours..."
                  className="min-h-24"
                />
                <p className="text-xs text-muted-foreground">{outsideHoursMessage.length}/300 characters</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSaveSettings} disabled={isSaving} className="gap-2">
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
