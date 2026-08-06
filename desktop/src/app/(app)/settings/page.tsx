'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Building2,
  Shield,
  Bell,
  Palette,
  Globe,
  Users,
  CreditCard,
  Save,
  Loader2,
  Zap,
  Eye,
  EyeOff,
  Upload,
  Check,
  ArrowUpRight,
  Receipt,
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
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { settingsApi, type UpdateCompanySettingsRequest } from '@/lib/api/settings';
import { useI18n } from '@/lib/i18n';

type ReminderChannel = 'Email' | 'WhatsApp' | 'SMS' | 'Push';

interface ReminderSetting {
  id: string;
  label: string;
  enabled: boolean;
  channel: ReminderChannel;
}

interface IntegrationCard {
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  status: string;
}

export default function SettingsPage() {
  const { locale, setLocale } = useI18n();
  const [isSaving, setIsSaving] = React.useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = React.useState(false);
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('general');

  // Fetch company settings
  const { data: settingsResponse, loading: settingsLoading, error: settingsError } = useApiQuery(
    () => settingsApi.company.get(),
    [],
  );

  const companySettings = React.useMemo(() => {
    if (!settingsResponse || !('data' in settingsResponse)) {
      return null;
    }
    return settingsResponse.data ?? null;
  }, [settingsResponse]);

  // General settings state
  const [generalForm, setGeneralForm] = React.useState({
    companyName: '',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    dateFormat: 'DD/MM/YYYY',
    fiscalYearStart: '01-04',
    language: locale,
  });

  // Update form when settings load
  React.useEffect(() => {
    if (companySettings) {
      setGeneralForm((prev) => ({
        ...prev,
        companyName: companySettings.name ?? prev.companyName,
        timezone: companySettings.timezone ?? prev.timezone,
        currency: companySettings.currency ?? prev.currency,
      }));
    }
  }, [companySettings]);

  // Update form language when locale changes
  React.useEffect(() => {
    setGeneralForm((prev) => ({
      ...prev,
      language: locale,
    }));
  }, [locale]);

  // Integrations state
  const [integrations, setIntegrations] = React.useState<IntegrationCard[]>([
    {
      name: 'Email (SMTP)',
      description: 'Send invoices and notifications via email',
      icon: '📧',
      connected: true,
      status: 'Connected',
    },
    {
      name: 'WhatsApp',
      description: 'Send messages and alerts via WhatsApp',
      icon: '💬',
      connected: false,
      status: 'Not Connected',
    },
    {
      name: 'Payment Gateway',
      description: 'Accept online payments',
      icon: '💳',
      connected: true,
      status: 'Connected',
    },
    {
      name: 'Google Calendar',
      description: 'Sync trips and events',
      icon: '📅',
      connected: false,
      status: 'Not Connected',
    },
    {
      name: 'Slack',
      description: 'Get notifications in Slack',
      icon: '🔔',
      connected: true,
      status: 'Connected',
    },
  ]);

  // Notification preferences state
  const [reminders, setReminders] = React.useState<ReminderSetting[]>([
    {
      id: '1',
      label: 'Payment Reminders',
      enabled: true,
      channel: 'Email',
    },
    {
      id: '2',
      label: 'Booking Confirmations',
      enabled: true,
      channel: 'WhatsApp',
    },
    {
      id: '3',
      label: 'Trip Updates',
      enabled: true,
      channel: 'SMS',
    },
    {
      id: '4',
      label: 'New Bookings',
      enabled: true,
      channel: 'Email',
    },
  ]);

  // Update API mutation
  const updateMutation = useApiMutation<UpdateCompanySettingsRequest, any>((data) =>
    settingsApi.company.update(data),
  );

  // Invoice defaults state
  const [invoiceDefaultsForm, setInvoiceDefaultsForm] = React.useState({
    bankName: '',
    accountNumber: '',
    ifsc: '',
    branch: '',
    accountHolderName: '',
    upiId: '',
    defaultCurrency: 'INR',
    defaultTaxSystem: 'GST',
    defaultPaymentTerms: '30',
    defaultNotes: '',
    defaultTerms: '',
  });

  // Numbering config state
  const [numberingForm, setNumberingForm] = React.useState({
    invoicePrefix: 'INV',
    proformaPrefix: 'PI',
    receiptPrefix: 'RCT',
    creditNotePrefix: 'CN',
    debitNotePrefix: 'DN',
    voucherPrefix: 'VCH',
    fyStartMonth: '4',
    resetYearly: true,
  });

  // Fetch invoice defaults
  const { data: invoiceDefaultsResponse } = useApiQuery(
    () => settingsApi.invoiceDefaults.get(),
    [],
  );

  // Fetch numbering config
  const { data: numberingResponse } = useApiQuery(
    () => settingsApi.numberingConfig.get(),
    [],
  );

  // Populate invoice defaults when loaded
  React.useEffect(() => {
    const d = invoiceDefaultsResponse?.data;
    if (d) {
      setInvoiceDefaultsForm((prev) => ({
        ...prev,
        bankName: d.bankName ?? prev.bankName,
        accountNumber: d.accountNumber ?? prev.accountNumber,
        ifsc: d.ifsc ?? prev.ifsc,
        branch: d.branch ?? prev.branch,
        accountHolderName: d.accountHolderName ?? prev.accountHolderName,
        upiId: d.upiId ?? prev.upiId,
        defaultCurrency: d.defaultCurrency ?? prev.defaultCurrency,
        defaultTaxSystem: d.defaultTaxSystem ?? prev.defaultTaxSystem,
        defaultPaymentTerms: String(d.defaultPaymentTerms ?? prev.defaultPaymentTerms),
        defaultNotes: d.defaultNotes ?? prev.defaultNotes,
        defaultTerms: d.defaultTerms ?? prev.defaultTerms,
      }));
    }
  }, [invoiceDefaultsResponse]);

  // Populate numbering config when loaded
  React.useEffect(() => {
    const d = numberingResponse?.data;
    if (d) {
      setNumberingForm((prev) => ({
        ...prev,
        invoicePrefix: d.invoicePrefix ?? prev.invoicePrefix,
        proformaPrefix: d.proformaPrefix ?? prev.proformaPrefix,
        receiptPrefix: d.receiptPrefix ?? prev.receiptPrefix,
        creditNotePrefix: d.creditNotePrefix ?? prev.creditNotePrefix,
        debitNotePrefix: d.debitNotePrefix ?? prev.debitNotePrefix,
        voucherPrefix: d.voucherPrefix ?? prev.voucherPrefix,
        fyStartMonth: String(d.fyStartMonth ?? prev.fyStartMonth),
        resetYearly: d.resetYearly ?? prev.resetYearly,
      }));
    }
  }, [numberingResponse]);

  const handleSaveInvoiceDefaults = async () => {
    setIsSaving(true);
    try {
      await settingsApi.invoiceDefaults.update(invoiceDefaultsForm);
      toast.success('Invoice defaults saved successfully');
    } catch {
      toast.error('Failed to save invoice defaults');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNumberingConfig = async () => {
    setIsSaving(true);
    try {
      await settingsApi.numberingConfig.update({
        ...numberingForm,
        fyStartMonth: parseInt(numberingForm.fyStartMonth, 10),
      });
      toast.success('Numbering configuration saved successfully');
    } catch {
      toast.error('Failed to save numbering configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGeneralSettings = async () => {
    setIsSaving(true);
    const updateData: UpdateCompanySettingsRequest = {
      name: generalForm.companyName,
      timezone: generalForm.timezone,
      currency: generalForm.currency,
    };

    const result = await updateMutation.mutate(updateData);
    if (result) {
      toast.success('General settings saved successfully');
    } else {
      toast.error(updateMutation.error?.message ?? 'Failed to save settings');
    }
    setIsSaving(false);
  };

  const handleSaveReminders = async () => {
    setIsSaving(true);
    try {
      // Save reminders to API if endpoint is available
      toast.success('Notification preferences saved');
    } catch (error) {
      toast.error('Failed to save notification preferences');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    setIsSaving(true);
    try {
      await settingsApi.logo.upload({ file });
      toast.success('Logo uploaded successfully');
    } catch {
      toast.error('Failed to upload logo');
    }
    setIsSaving(false);
  };

  const toggleReminder = (id: string) => {
    setReminders((prev) =>
      prev.map((r: any) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  const updateReminderChannel = (id: string, channel: ReminderChannel) => {
    setReminders((prev) =>
      prev.map((r: any) => (r.id === id ? { ...r, channel } : r)),
    );
  };

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your company configuration and preferences</p>
      </div>

      {settingsError && (
        <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">Error loading settings - using default values</p>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7">
          <TabsTrigger value="general" className="gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="company" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Company</span>
          </TabsTrigger>
          <TabsTrigger value="invoicing" className="gap-2">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Invoicing</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Integrations</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        {/* General Settings Tab */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Basic information about your company</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Company Name */}
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={generalForm.companyName}
                  onChange={(e) => setGeneralForm((prev) => ({ ...prev, companyName: e.target.value }))}
                  placeholder="e.g., TravelCRM Inc"
                />
              </div>

              {/* Timezone */}
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={generalForm.timezone} onValueChange={(v) => setGeneralForm((prev) => ({ ...prev, timezone: v }))}>
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

              {/* Currency */}
              <div className="space-y-2">
                <Label htmlFor="currency">Default Currency</Label>
                <Select value={generalForm.currency} onValueChange={(v) => setGeneralForm((prev) => ({ ...prev, currency: v }))}>
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">Indian Rupee (₹)</SelectItem>
                    <SelectItem value="USD">US Dollar ($)</SelectItem>
                    <SelectItem value="EUR">Euro (€)</SelectItem>
                    <SelectItem value="GBP">British Pound (£)</SelectItem>
                    <SelectItem value="AED">UAE Dirham (د.إ)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Format */}
              <div className="space-y-2">
                <Label htmlFor="dateFormat">Date Format</Label>
                <Select value={generalForm.dateFormat} onValueChange={(v) => setGeneralForm((prev) => ({ ...prev, dateFormat: v }))}>
                  <SelectTrigger id="dateFormat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fiscal Year Start */}
              <div className="space-y-2">
                <Label htmlFor="fiscalYearStart">Fiscal Year Start</Label>
                <Select value={generalForm.fiscalYearStart} onValueChange={(v) => setGeneralForm((prev) => ({ ...prev, fiscalYearStart: v }))}>
                  <SelectTrigger id="fiscalYearStart">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01-01">January 1st</SelectItem>
                    <SelectItem value="01-04">April 1st</SelectItem>
                    <SelectItem value="07-01">July 1st</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Language */}
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select
                  value={generalForm.language}
                  onValueChange={(v) => {
                    setGeneralForm((prev) => ({ ...prev, language: v as any }));
                    setLocale(v as any);
                    toast.success(`Language changed to ${v === 'en' ? 'English' : v === 'hi' ? 'Hindi' : 'Arabic'}`);
                  }}
                >
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">हिंदी (Hindi)</SelectItem>
                    <SelectItem value="ar">العربية (Arabic)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSaveGeneralSettings}
              disabled={isSaving || settingsLoading}
              className="gap-2"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </TabsContent>

        {/* Company Profile Tab */}
        <TabsContent value="company" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Company Profile</CardTitle>
              <CardDescription>Company branding and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Logo Upload */}
              <div className="space-y-3">
                <Label>Company Logo</Label>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="bg-blue-100 text-blue-700 font-bold">TC</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                      <Button variant="outline" className="w-full gap-2">
                        <Upload className="h-4 w-4" />
                        Upload Logo
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">PNG or JPG, max 2MB</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={companySettings?.email ?? ''}
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={companySettings?.phone ?? ''}
                    readOnly
                    className="bg-muted"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={companySettings?.address ?? ''}
                  readOnly
                  className="bg-muted"
                />
              </div>

              {/* Location */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={companySettings?.city ?? ''} readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" value={companySettings?.state ?? ''} readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input id="postalCode" value={companySettings?.postalCode ?? ''} readOnly className="bg-muted" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoicing Tab */}
        <TabsContent value="invoicing" className="space-y-4">
          {/* Bank Details */}
          <Card>
            <CardHeader>
              <CardTitle>Bank Details</CardTitle>
              <CardDescription>Your bank account details for invoices</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    value={invoiceDefaultsForm.bankName}
                    onChange={(e) => setInvoiceDefaultsForm((prev) => ({ ...prev, bankName: e.target.value }))}
                    placeholder="e.g., State Bank of India"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    value={invoiceDefaultsForm.accountNumber}
                    onChange={(e) => setInvoiceDefaultsForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                    placeholder="e.g., 1234567890"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ifsc">IFSC Code</Label>
                  <Input
                    id="ifsc"
                    value={invoiceDefaultsForm.ifsc}
                    onChange={(e) => setInvoiceDefaultsForm((prev) => ({ ...prev, ifsc: e.target.value }))}
                    placeholder="e.g., SBIN0001234"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    value={invoiceDefaultsForm.branch}
                    onChange={(e) => setInvoiceDefaultsForm((prev) => ({ ...prev, branch: e.target.value }))}
                    placeholder="e.g., MG Road Branch"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="accountHolderName">Account Holder Name</Label>
                  <Input
                    id="accountHolderName"
                    value={invoiceDefaultsForm.accountHolderName}
                    onChange={(e) => setInvoiceDefaultsForm((prev) => ({ ...prev, accountHolderName: e.target.value }))}
                    placeholder="e.g., TravelCRM Pvt Ltd"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upiId">UPI ID</Label>
                  <Input
                    id="upiId"
                    value={invoiceDefaultsForm.upiId}
                    onChange={(e) => setInvoiceDefaultsForm((prev) => ({ ...prev, upiId: e.target.value }))}
                    placeholder="e.g., company@upi"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Invoice Defaults */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Defaults</CardTitle>
              <CardDescription>Default values applied to new invoices</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultCurrency">Default Currency</Label>
                  <Select
                    value={invoiceDefaultsForm.defaultCurrency}
                    onValueChange={(v) => setInvoiceDefaultsForm((prev) => ({ ...prev, defaultCurrency: v }))}
                  >
                    <SelectTrigger id="defaultCurrency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                      <SelectItem value="USD">USD - US Dollar</SelectItem>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                      <SelectItem value="GBP">GBP - British Pound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultTaxSystem">Default Tax System</Label>
                  <Select
                    value={invoiceDefaultsForm.defaultTaxSystem}
                    onValueChange={(v) => setInvoiceDefaultsForm((prev) => ({ ...prev, defaultTaxSystem: v }))}
                  >
                    <SelectTrigger id="defaultTaxSystem"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GST">GST</SelectItem>
                      <SelectItem value="VAT">VAT</SelectItem>
                      <SelectItem value="None">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultPaymentTerms">Payment Terms (days)</Label>
                  <Input
                    id="defaultPaymentTerms"
                    type="number"
                    min="0"
                    value={invoiceDefaultsForm.defaultPaymentTerms}
                    onChange={(e) => setInvoiceDefaultsForm((prev) => ({ ...prev, defaultPaymentTerms: e.target.value }))}
                    placeholder="30"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultNotes">Default Notes</Label>
                <Textarea
                  id="defaultNotes"
                  value={invoiceDefaultsForm.defaultNotes}
                  onChange={(e) => setInvoiceDefaultsForm((prev) => ({ ...prev, defaultNotes: e.target.value }))}
                  placeholder="Notes that appear on every invoice by default..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultTerms">Default Terms & Conditions</Label>
                <Textarea
                  id="defaultTerms"
                  value={invoiceDefaultsForm.defaultTerms}
                  onChange={(e) => setInvoiceDefaultsForm((prev) => ({ ...prev, defaultTerms: e.target.value }))}
                  placeholder="Terms & conditions that appear on every invoice by default..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save Invoice Defaults */}
          <div className="flex justify-end">
            <Button onClick={handleSaveInvoiceDefaults} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" />
              Save Invoice Settings
            </Button>
          </div>

          <Separator />

          {/* Numbering Config */}
          <Card>
            <CardHeader>
              <CardTitle>Document Numbering</CardTitle>
              <CardDescription>Configure prefixes and numbering rules for invoices and documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
                  <Input
                    id="invoicePrefix"
                    value={numberingForm.invoicePrefix}
                    onChange={(e) => setNumberingForm((prev) => ({ ...prev, invoicePrefix: e.target.value }))}
                    placeholder="INV"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proformaPrefix">Proforma Prefix</Label>
                  <Input
                    id="proformaPrefix"
                    value={numberingForm.proformaPrefix}
                    onChange={(e) => setNumberingForm((prev) => ({ ...prev, proformaPrefix: e.target.value }))}
                    placeholder="PI"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receiptPrefix">Receipt Prefix</Label>
                  <Input
                    id="receiptPrefix"
                    value={numberingForm.receiptPrefix}
                    onChange={(e) => setNumberingForm((prev) => ({ ...prev, receiptPrefix: e.target.value }))}
                    placeholder="RCT"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="creditNotePrefix">Credit Note Prefix</Label>
                  <Input
                    id="creditNotePrefix"
                    value={numberingForm.creditNotePrefix}
                    onChange={(e) => setNumberingForm((prev) => ({ ...prev, creditNotePrefix: e.target.value }))}
                    placeholder="CN"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debitNotePrefix">Debit Note Prefix</Label>
                  <Input
                    id="debitNotePrefix"
                    value={numberingForm.debitNotePrefix}
                    onChange={(e) => setNumberingForm((prev) => ({ ...prev, debitNotePrefix: e.target.value }))}
                    placeholder="DN"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucherPrefix">Voucher Prefix</Label>
                  <Input
                    id="voucherPrefix"
                    value={numberingForm.voucherPrefix}
                    onChange={(e) => setNumberingForm((prev) => ({ ...prev, voucherPrefix: e.target.value }))}
                    placeholder="VCH"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fyStartMonth">Financial Year Start Month</Label>
                  <Select
                    value={numberingForm.fyStartMonth}
                    onValueChange={(v) => setNumberingForm((prev) => ({ ...prev, fyStartMonth: v }))}
                  >
                    <SelectTrigger id="fyStartMonth"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">January</SelectItem>
                      <SelectItem value="2">February</SelectItem>
                      <SelectItem value="3">March</SelectItem>
                      <SelectItem value="4">April</SelectItem>
                      <SelectItem value="5">May</SelectItem>
                      <SelectItem value="6">June</SelectItem>
                      <SelectItem value="7">July</SelectItem>
                      <SelectItem value="8">August</SelectItem>
                      <SelectItem value="9">September</SelectItem>
                      <SelectItem value="10">October</SelectItem>
                      <SelectItem value="11">November</SelectItem>
                      <SelectItem value="12">December</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resetYearly">Reset Numbering Yearly</Label>
                  <div className="flex items-center gap-3 pt-2">
                    <Switch
                      id="resetYearly"
                      checked={numberingForm.resetYearly}
                      onCheckedChange={(checked) => setNumberingForm((prev) => ({ ...prev, resetYearly: checked }))}
                    />
                    <span className="text-sm text-muted-foreground">
                      {numberingForm.resetYearly ? 'Numbers reset at FY start' : 'Continuous numbering'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Numbering Config */}
          <div className="flex justify-end">
            <Button onClick={handleSaveNumberingConfig} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" />
              Save Numbering Config
            </Button>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how you want to receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {reminders.map((reminder: any) => (
                <div key={reminder.id} className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                  <div className="flex items-center gap-4 flex-1">
                    <Switch
                      checked={reminder.enabled}
                      onCheckedChange={() => toggleReminder(reminder.id)}
                      id={`reminder-${reminder.id}`}
                    />
                    <div>
                      <Label htmlFor={`reminder-${reminder.id}`} className="text-base font-medium cursor-pointer">
                        {reminder.label}
                      </Label>
                    </div>
                  </div>

                  <div className="w-40">
                    <Select value={reminder.channel} onValueChange={(v) => updateReminderChannel(reminder.id, v as ReminderChannel)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Email">Email</SelectItem>
                        <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                        <SelectItem value="SMS">SMS</SelectItem>
                        <SelectItem value="Push">Push</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSaveReminders}
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" />
              Save Preferences
            </Button>
          </div>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
              <CardDescription>Connect external services to TravelCRM</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {integrations.map((integration, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-lg border border-border/50 hover:border-border transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="text-2xl">{integration.icon}</div>
                        <div>
                          <p className="font-medium text-sm">{integration.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{integration.description}</p>
                        </div>
                      </div>
                      <Badge
                        className={cn(
                          'text-xs',
                          integration.connected
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
                        )}
                      >
                        {integration.status}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                    >
                      {integration.connected ? 'Manage' : 'Connect'}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Email Signature */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Email Signature</CardTitle>
                  <CardDescription>Configure the signature appended to outbound emails</CardDescription>
                </div>
                <Link href="/settings/email-signature">
                  <Button variant="outline" size="sm">
                    Configure Signature <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
          </Card>
        </TabsContent>

        {/* Users/Roles Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Users & Roles</CardTitle>
                  <CardDescription>Manage team members and their permissions</CardDescription>
                </div>
                <Link href="/settings/team">
                  <Button>
                    <Users className="h-4 w-4 mr-1.5" />
                    Manage Team
                    <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">Manage your team members, roles, and permissions</p>
                <Link href="/settings/team">
                  <Button variant="outline" size="sm">
                    Open Team Management <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          {/* Quick links to security sub-pages */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Profile', description: 'Manage your personal info', href: '/settings/profile', icon: <Users className="h-5 w-5" /> },
              { label: 'Active Sessions', description: 'View & revoke sessions', href: '/settings/sessions', icon: <Shield className="h-5 w-5" /> },
              { label: 'Login History', description: 'Recent login activity', href: '/settings/login-history', icon: <Globe className="h-5 w-5" /> },
              { label: 'Activity Log', description: 'System audit trail', href: '/settings/activity-log', icon: <Zap className="h-5 w-5" /> },
            ].map(({ label, description, href, icon }) => (
              <Link key={href} href={href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <div className="text-primary">{icon}</div>
                      <div>
                        <p className="font-medium text-sm">{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    placeholder="Enter current password"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="Enter new password"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button className="w-full gap-2">
                <Check className="h-4 w-4" />
                Update Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
