'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, Mail, MessageSquare, Calendar, FileText, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiMutation, useApiQuery } from '@/hooks/use-api';
import { campaignsApi } from '@/lib/api/campaigns';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';
import { contactsApi } from '@/lib/api/contacts';
import { Combobox } from '@/components/ui/combobox';

interface FormState {
  // Card 1: Campaign Details
  campaignName: string;
  campaignType: 'email' | 'sms' | 'whatsapp';
  description: string;

  // Card 2: Audience
  audienceType: 'tags' | 'lead_status' | 'custom';
  selectedTags: string[];
  selectedStatuses: string[];
  segmentId: string;
  segmentName: string;

  // Card 3: Content
  contentSource: 'template' | 'custom';
  selectedTemplate: string;
  customContent: string;
  emailSubject: string;

  // Card 4: Schedule
  scheduleType: 'now' | 'later';
  scheduleDate: string;
  scheduleTime: string;
}

const initialFormState: FormState = {
  campaignName: '',
  campaignType: 'email',
  description: '',
  audienceType: 'tags',
  selectedTags: [],
  selectedStatuses: [],
  segmentId: '',
  segmentName: '',
  contentSource: 'template',
  selectedTemplate: '',
  customContent: '',
  emailSubject: '',
  scheduleType: 'now',
  scheduleDate: '',
  scheduleTime: '',
};

const leadStatuses = [
  'New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost',
];

// SMS character limit
const SMS_LIMIT = 160;

export default function NewCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = React.useState<FormState>(initialFormState);
  const [currentStep, setCurrentStep] = React.useState(1);

  // Auto-populate from URL params (e.g., navigating from a segment's "Use in Campaign")
  React.useEffect(() => {
    const segmentId = searchParams.get('segmentId');
    const segmentName = searchParams.get('segmentName');
    if (segmentId) {
      setForm((prev) => ({ ...prev, audienceType: 'custom', segmentId, segmentName: segmentName ?? '' }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { mutate: createCampaign, loading: isCreating } = useApiMutation(campaignsApi.create);
  const { mutate: scheduleCampaign, loading: isScheduling } = useApiMutation((data: { id: string; scheduledAt: string }) => campaignsApi.schedule(data.id, { scheduledFor: data.scheduledAt }));

  // Fetch API data for form fields
  const { data: templatesResponse } = useApiQuery(
    () => templatesApi.list({ channel: form.campaignType, limit: 100 }),
    [form.campaignType],
  );
  const apiTemplates: MessageTemplate[] = (templatesResponse?.data?.data ?? templatesResponse?.data ?? []) as MessageTemplate[];

  const { data: tagsResponse } = useApiQuery(
    () => contactsApi.getTags(),
    [],
  );
  const availableTags: string[] = (tagsResponse?.data ?? []) as string[];

  const handleFieldChange = (field: keyof FormState, value: unknown) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTagToggle = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      selectedTags: prev.selectedTags.includes(tag)
        ? prev.selectedTags.filter((t: any) => t !== tag)
        : [...prev.selectedTags, tag],
    }));
  };

  const handleStatusToggle = (status: string) => {
    setForm((prev) => ({
      ...prev,
      selectedStatuses: prev.selectedStatuses.includes(status)
        ? prev.selectedStatuses.filter((s: any) => s !== status)
        : [...prev.selectedStatuses, status],
    }));
  };

  const isStep1Valid = form.campaignName.trim() !== '' && form.campaignType;
  const isStep2Valid =
    (form.audienceType === 'tags' && form.selectedTags.length > 0) ||
    (form.audienceType === 'lead_status' && form.selectedStatuses.length > 0) ||
    form.audienceType === 'custom';
  const isStep3Valid =
    (form.contentSource === 'template' && form.selectedTemplate) ||
    (form.contentSource === 'custom' && form.customContent.trim() !== '');
  const isStep4Valid = form.scheduleType === 'now' || (() => {
    if (!form.scheduleDate || !form.scheduleTime) return false;
    const scheduled = new Date(`${form.scheduleDate}T${form.scheduleTime}`);
    const minTime = new Date(Date.now() + 15 * 60 * 1000);
    const maxTime = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    return scheduled >= minTime && scheduled <= maxTime;
  })();

  const stepValid = [isStep1Valid, isStep2Valid, isStep3Valid, isStep4Valid];

  const buildCampaignPayload = (extraFields?: Partial<{ status: 'draft' | 'running' | 'scheduled' | 'completed' | 'paused'; startDate: string }>) => {
    const segmentFilters: Record<string, unknown> = {};
    if (form.audienceType === 'tags' && form.selectedTags.length > 0) {
      segmentFilters.tags = form.selectedTags;
    }
    return {
      name: form.campaignName,
      subject: form.emailSubject || form.campaignName, // subject is required by backend
      body: form.contentSource === 'custom' ? form.customContent : undefined,
      templateId: form.contentSource === 'template' && form.selectedTemplate ? form.selectedTemplate : undefined,
      segmentFilters,
      ...extraFields,
    };
  };

  const handleSaveDraft = async () => {
    if (!isStep1Valid) {
      toast.error('Please complete campaign details');
      return;
    }

    const result = await createCampaign(buildCampaignPayload());

    if (result) {
      toast.success('Campaign saved as draft!');
      router.push('/campaigns');
    } else {
      toast.error('Failed to save campaign');
    }
  };

  const handleLaunch = async () => {
    if (!stepValid.every((v) => v)) {
      toast.error('Please complete all required fields');
      return;
    }

    const result = await createCampaign(
      buildCampaignPayload({
        startDate: form.scheduleType === 'later' ? `${form.scheduleDate}T${form.scheduleTime}:00` : undefined,
      }),
    );

    if (result) {
      if (form.scheduleType === 'later') {
        const scheduledAt = `${form.scheduleDate}T${form.scheduleTime}:00`;
        // @ts-ignore-next-line
        const scheduleResult = await scheduleCampaign({ id: result.id, scheduledAt });
        if (scheduleResult) {
          toast.success('Campaign scheduled successfully!');
        } else {
          toast.error('Campaign created but failed to schedule');
        }
      } else {
        toast.success('Campaign launched successfully!');
      }
      router.push('/campaigns');
    } else {
      toast.error('Failed to create campaign');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Create New Campaign
          </h1>
          <p className="text-sm text-muted-foreground">Step {currentStep} of 4</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between mb-2">
          {Array.from({ length: 4 }, (_, i) => (
            <React.Fragment key={i}>
              <button
                onClick={() => setCurrentStep(i + 1)}
                className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center font-semibold transition-colors',
                  stepValid[i]
                    ? 'bg-primary text-primary-foreground cursor-pointer'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </button>
              {i < 3 && (
                <div
                  className={cn(
                    'flex-1 h-1 mx-2 transition-colors',
                    stepValid[i] ? 'bg-primary' : 'bg-muted',
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Campaign Details</span>
          <span>Audience</span>
          <span>Content</span>
          <span>Schedule</span>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Step 1: Campaign Details */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Campaign Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Campaign Name *</label>
                  <Input
                    placeholder="e.g., Summer Holiday Offers"
                    value={form.campaignName}
                    onChange={(e) => handleFieldChange('campaignName', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Campaign Type *</label>
                  <Select value={form.campaignType} onValueChange={(v) => handleFieldChange('campaignType', v as typeof form.campaignType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">
                        <span className="flex items-center gap-2">
                          <Mail className="h-4 w-4" /> Email
                        </span>
                      </SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="whatsapp">
                        <span className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" /> WhatsApp
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    placeholder="What is this campaign about?"
                    value={form.description}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Audience */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Select Audience
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Audience Type Selection */}
                <div>
                  <label className="block text-sm font-medium mb-3">Audience Type *</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50" style={{
                      borderColor: form.audienceType === 'tags' ? 'hsl(var(--primary))' : undefined,
                      backgroundColor: form.audienceType === 'tags' ? 'hsl(var(--primary))10' : undefined,
                    }}>
                      <Checkbox checked={form.audienceType === 'tags'} onCheckedChange={() => handleFieldChange('audienceType', 'tags')} />
                      <span className="text-sm font-medium">By Tags</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50" style={{
                      borderColor: form.audienceType === 'lead_status' ? 'hsl(var(--primary))' : undefined,
                      backgroundColor: form.audienceType === 'lead_status' ? 'hsl(var(--primary))10' : undefined,
                    }}>
                      <Checkbox checked={form.audienceType === 'lead_status'} onCheckedChange={() => handleFieldChange('audienceType', 'lead_status')} />
                      <span className="text-sm font-medium">By Lead Status</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50" style={{
                      borderColor: form.audienceType === 'custom' ? 'hsl(var(--primary))' : undefined,
                      backgroundColor: form.audienceType === 'custom' ? 'hsl(var(--primary))10' : undefined,
                    }}>
                      <Checkbox checked={form.audienceType === 'custom'} onCheckedChange={() => handleFieldChange('audienceType', 'custom')} />
                      <span className="text-sm font-medium">Custom Filter</span>
                    </label>
                  </div>
                </div>

                <Separator />

                {/* Tags Selection */}
                {form.audienceType === 'tags' && (
                  <div>
                    <label className="block text-sm font-medium mb-3">Select Tags *</label>
                    <div className="flex flex-wrap gap-2">
                      {availableTags.map((tag: any) => (
                        <Badge
                          key={tag}
                          variant={form.selectedTags.includes(tag) ? 'default' : 'outline'}
                          className="cursor-pointer px-3 py-2"
                          onClick={() => handleTagToggle(tag)}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lead Status Selection */}
                {form.audienceType === 'lead_status' && (
                  <div>
                    <label className="block text-sm font-medium mb-3">Select Lead Statuses *</label>
                    <div className="grid grid-cols-2 gap-3">
                      {leadStatuses.map((status: any) => (
                        <label key={status} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                          <Checkbox
                            checked={form.selectedStatuses.includes(status)}
                            onCheckedChange={() => handleStatusToggle(status)}
                          />
                          <span className="text-sm">{status}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Filter */}
                {form.audienceType === 'custom' && (
                  <div className="p-4 rounded-lg border border-dashed text-center">
                    <p className="text-sm text-muted-foreground">Custom filter builder (advanced)</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Content */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Campaign Content
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Content Source Selection */}
                <div>
                  <label className="block text-sm font-medium mb-3">Content Source *</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50" style={{
                      borderColor: form.contentSource === 'template' ? 'hsl(var(--primary))' : undefined,
                      backgroundColor: form.contentSource === 'template' ? 'hsl(var(--primary))10' : undefined,
                    }}>
                      <Checkbox checked={form.contentSource === 'template'} onCheckedChange={() => handleFieldChange('contentSource', 'template')} />
                      <span className="text-sm font-medium">Use Template</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50" style={{
                      borderColor: form.contentSource === 'custom' ? 'hsl(var(--primary))' : undefined,
                      backgroundColor: form.contentSource === 'custom' ? 'hsl(var(--primary))10' : undefined,
                    }}>
                      <Checkbox checked={form.contentSource === 'custom'} onCheckedChange={() => handleFieldChange('contentSource', 'custom')} />
                      <span className="text-sm font-medium">Write Custom Content</span>
                    </label>
                  </div>
                </div>

                <Separator />

                {/* Template Selection — searchable Combobox */}
                {form.contentSource === 'template' && (
                  <div>
                    <label className="block text-sm font-medium mb-3">Select Template *</label>
                    <Combobox
                      options={apiTemplates.map((t) => ({ value: t.id, label: t.name }))}
                      value={form.selectedTemplate}
                      onValueChange={(v) => handleFieldChange('selectedTemplate', v)}
                      placeholder="Choose a template..."
                      searchPlaceholder="Search templates..."
                      emptyText={`No ${form.campaignType} templates found`}
                    />
                    {apiTemplates.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        No {form.campaignType} templates found.{' '}
                        <a href="/communication/templates/new" className="text-primary hover:underline">Create one</a>.
                      </p>
                    )}
                  </div>
                )}

                {/* Custom Content */}
                {form.contentSource === 'custom' && (
                  <>
                    {form.campaignType === 'email' && (
                      <div>
                        <label className="block text-sm font-medium mb-2">Email Subject *</label>
                        <Input
                          placeholder="e.g., Special Offer: 30% Off Your Next Trip!"
                          value={form.emailSubject}
                          onChange={(e) => handleFieldChange('emailSubject', e.target.value)}
                        />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium">Message Content *</label>
                        {form.campaignType === 'sms' && (
                          <span className={cn(
                            'text-xs font-mono',
                            form.customContent.length > SMS_LIMIT
                              ? 'text-destructive'
                              : form.customContent.length > SMS_LIMIT * 0.8
                                ? 'text-amber-500'
                                : 'text-muted-foreground',
                          )}>
                            {form.customContent.length}/{SMS_LIMIT}
                            {form.customContent.length > SMS_LIMIT && (
                              <span className="ml-1">
                                ({Math.ceil(form.customContent.length / SMS_LIMIT)} parts)
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      <textarea
                        placeholder="Write your message here... You can use {{firstName}}, {{email}} for personalization"
                        value={form.customContent}
                        onChange={(e) => handleFieldChange('customContent', e.target.value)}
                        className={cn(
                          'w-full h-32 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary',
                          form.campaignType === 'sms' && form.customContent.length > SMS_LIMIT
                            ? 'border-destructive focus:ring-destructive'
                            : 'border-input',
                        )}
                      />
                      {form.campaignType === 'sms' && form.customContent.length > SMS_LIMIT && (
                        <p className="text-xs text-amber-600 mt-1">
                          Message exceeds 160 characters and will be split into {Math.ceil(form.customContent.length / SMS_LIMIT)} SMS parts.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 4: Schedule */}
          {currentStep === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Schedule Campaign
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-3">Send Schedule</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50" style={{
                      borderColor: form.scheduleType === 'now' ? 'hsl(var(--primary))' : undefined,
                      backgroundColor: form.scheduleType === 'now' ? 'hsl(var(--primary))10' : undefined,
                    }}>
                      <Checkbox checked={form.scheduleType === 'now'} onCheckedChange={() => handleFieldChange('scheduleType', 'now')} />
                      <span className="text-sm font-medium">Send Immediately</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50" style={{
                      borderColor: form.scheduleType === 'later' ? 'hsl(var(--primary))' : undefined,
                      backgroundColor: form.scheduleType === 'later' ? 'hsl(var(--primary))10' : undefined,
                    }}>
                      <Checkbox checked={form.scheduleType === 'later'} onCheckedChange={() => handleFieldChange('scheduleType', 'later')} />
                      <span className="text-sm font-medium">Schedule for Later</span>
                    </label>
                  </div>
                </div>

                {form.scheduleType === 'later' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Date</label>
                        <Input
                          type="date"
                          min={new Date(Date.now() + 15 * 60 * 1000).toISOString().split('T')[0]}
                          max={new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                          value={form.scheduleDate}
                          onChange={(e) => handleFieldChange('scheduleDate', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Time</label>
                        <Input
                          type="time"
                          value={form.scheduleTime}
                          onChange={(e) => handleFieldChange('scheduleTime', e.target.value)}
                        />
                      </div>
                    </div>
                    {form.scheduleDate && form.scheduleTime && (() => {
                      const scheduled = new Date(`${form.scheduleDate}T${form.scheduleTime}`);
                      const minTime = new Date(Date.now() + 15 * 60 * 1000);
                      const maxTime = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                      if (scheduled < minTime) {
                        return (
                          <p className="text-xs text-destructive">
                            Schedule must be at least 15 minutes from now.
                          </p>
                        );
                      }
                      if (scheduled > maxTime) {
                        return (
                          <p className="text-xs text-destructive">
                            Schedule cannot be more than 90 days in the future.
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}

                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    <strong>Summary:</strong> You're about to send a {form.campaignType} campaign to{' '}
                    {form.audienceType === 'tags'
                      ? `contacts with tags: ${form.selectedTags.join(', ')}`
                      : form.audienceType === 'lead_status'
                        ? `leads with status: ${form.selectedStatuses.join(', ')}`
                        : 'your custom audience'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer with Navigation */}
      <div className="border-t px-6 py-4 bg-background flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handleSaveDraft}
          disabled={isCreating}
        >
          Save Draft
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
          >
            Previous
          </Button>
          {currentStep < 4 ? (
            <Button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!stepValid[currentStep - 1]}
            >
              Next
              {' '}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleLaunch} disabled={isCreating || isScheduling}>
              {isCreating || isScheduling ? 'Creating...' : 'Launch Campaign'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
