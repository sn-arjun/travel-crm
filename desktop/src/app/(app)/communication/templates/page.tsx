'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Plus, Search, Mail, MessageSquare, Phone, Copy, Edit, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useApiQuery } from '@/hooks/use-api';
import { Loader, AlertCircle } from 'lucide-react';

interface MessageTemplate {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'whatsapp';
  category: string;
  preview: string;
  content: string;
}

// Local templates as fallback - in production these would come from an API
const localTemplates: MessageTemplate[] = [
  // Welcome Templates
  {
    id: 'welcome-email-1',
    name: 'Welcome Email - Standard',
    type: 'email',
    category: 'Welcome',
    preview: 'Welcome to our travel services. We\'re excited to help you plan your perfect trip.',
    content: 'Dear {{contactName}},\n\nWelcome to our travel services! We\'re excited to help you plan your perfect trip. Our expert team is ready to assist you with curated travel packages tailored to your preferences.\n\nBest regards,\nTravelCRM Team',
  },
  {
    id: 'welcome-whatsapp-1',
    name: 'Welcome - WhatsApp',
    type: 'whatsapp',
    category: 'Welcome',
    preview: 'Hi {{firstName}}! Welcome to our travel services. How can we help you today?',
    content: 'Hi {{firstName}}! 👋\n\nWelcome to our travel services! We\'re thrilled to help you plan your dream vacation. Whether it\'s a relaxing beach getaway or an adventurous mountain trek, we\'ve got you covered.\n\nHow can we assist you today?',
  },
  {
    id: 'welcome-sms-1',
    name: 'Welcome SMS',
    type: 'sms',
    category: 'Welcome',
    preview: 'Welcome! Visit our website to explore travel packages or reply for assistance.',
    content: 'Welcome to TravelCRM! Explore our packages at www.travelcrm.com or reply HELP for assistance.',
  },

  // Follow-up Templates
  {
    id: 'followup-email-1',
    name: 'Follow-up Email - 1st Touch',
    type: 'email',
    category: 'Follow-up',
    preview: 'Following up on your inquiry about the {{destinationName}} package.',
    content: 'Dear {{contactName}},\n\nI hope this email finds you well. I wanted to follow up on your recent inquiry about our {{destinationName}} package.\n\nI\'d love to discuss your travel dates and budget to create a perfect itinerary for you. Are you available for a quick call this week?\n\nBest regards,\nYour Travel Consultant',
  },
  {
    id: 'followup-email-2',
    name: 'Follow-up Email - 2nd Touch',
    type: 'email',
    category: 'Follow-up',
    preview: 'Just checking in - any questions about the {{destinationName}} proposal?',
    content: 'Hi {{contactName}},\n\nJust checking in to see if you had any questions about the proposal we sent. I\'m here to clarify anything or explore alternative options if needed.\n\nLooking forward to hearing from you!',
  },

  // Proposal Templates
  {
    id: 'proposal-email-1',
    name: 'Proposal Email',
    type: 'email',
    category: 'Proposal',
    preview: 'Your customized {{destinationName}} proposal is ready for review.',
    content: 'Dear {{contactName}},\n\nPlease find attached your customized {{destinationName}} travel proposal. This package includes:\n\n✓ Flights\n✓ Accommodation\n✓ Local transfers\n✓ Guided tours\n\nTotal cost: {{packagePrice}}\n\nPlease review and let me know if you\'d like any modifications.',
  },

  // Booking Confirmation Templates
  {
    id: 'booking-confirm-email',
    name: 'Booking Confirmation Email',
    type: 'email',
    category: 'Booking Confirmation',
    preview: 'Your booking for {{destinationName}} ({{travelDate}}) is confirmed!',
    content: 'Dear {{contactName}},\n\nYour booking is confirmed! Here are your details:\n\nDestination: {{destinationName}}\nTravel Date: {{travelDate}}\nDuration: {{duration}} days\nTotal Cost: {{totalCost}}\n\nYour booking reference: {{bookingRef}}\n\nPlease keep this for your records.',
  },
  {
    id: 'booking-confirm-sms',
    name: 'Booking Confirmation SMS',
    type: 'sms',
    category: 'Booking Confirmation',
    preview: 'Booking confirmed! Ref: {{bookingRef}}. Check email for details.',
    content: 'Booking confirmed for {{destinationName}}! Ref: {{bookingRef}}. Check your email for full details. Questions? Call us at +91-XXXX-XXXXXX',
  },

  // Payment Reminder Templates
  {
    id: 'payment-reminder-email',
    name: 'Payment Reminder Email',
    type: 'email',
    category: 'Payment Reminder',
    preview: 'Payment reminder: {{amountDue}} due by {{dueDate}}',
    content: 'Dear {{contactName}},\n\nThis is a friendly reminder that payment of {{amountDue}} for your {{destinationName}} booking is due by {{dueDate}}.\n\nPlease complete the payment using the link below:\n{{paymentLink}}\n\nThank you!',
  },
  {
    id: 'payment-reminder-sms',
    name: 'Payment Reminder SMS',
    type: 'sms',
    category: 'Payment Reminder',
    preview: 'Payment reminder: {{amountDue}} due by {{dueDate}}. {{paymentLink}}',
    content: 'Payment reminder: {{amountDue}} due by {{dueDate}}. Pay now: {{paymentLink}}',
  },

  // Thank You Templates
  {
    id: 'thankyou-email-1',
    name: 'Thank You Email - Post Trip',
    type: 'email',
    category: 'Thank You',
    preview: 'Thank you for traveling with us! We hope you had an amazing experience.',
    content: 'Dear {{contactName}},\n\nThank you for choosing us for your {{destinationName}} trip! We hope you had an amazing experience.\n\nWe\'d love to hear about your journey. Please share your feedback at: {{reviewLink}}\n\nLooking forward to planning your next adventure!\n\nWarm regards,\nTravelCRM Team',
  },
  {
    id: 'thankyou-whatsapp',
    name: 'Thank You WhatsApp',
    type: 'whatsapp',
    category: 'Thank You',
    preview: 'Thanks for choosing us! Share your experience and get special discounts.',
    content: 'Thanks for choosing us for your {{destinationName}} trip! 🙏\n\nWe\'d love to hear about your experience. Reply with your feedback and get a 10% discount on your next booking!\n\nHappy travels! ✈️',
  },
];

export default function TemplatesPage() {
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [categoryFilter, setCategoryFilter] = React.useState('all');

  // Use local templates for now - in production, this would fetch from API
  // const { data: templates = [], loading, error } = useApiQuery<MessageTemplate[]>(
  //   () => communicationsApi.getTemplates(),
  //   [],
  // );

  // Using local templates as fallback
  const templates = localTemplates;
  const loading = false;
  const error = null;

  const filtered = React.useMemo(() => {
    let result = [...templates];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.preview.toLowerCase().includes(q),
      );
    }
    if (typeFilter && typeFilter !== 'all') {
      result = result.filter((t: any) => t.type === typeFilter);
    }
    if (categoryFilter && categoryFilter !== 'all') {
      result = result.filter((t: any) => t.category === categoryFilter);
    }
    return result;
  }, [search, typeFilter, categoryFilter]);

  const categories = Array.from(new Set(templates.map((t: any) => t.category))).sort();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Message Templates
          </h1>
          <p className="text-sm text-muted-foreground">{filtered.length} templates</p>
        </div>
        <Button asChild>
          <Link href="/communication/templates/new"><Plus className="h-4 w-4 mr-1.5" /> Create Template</Link>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b flex-wrap">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat: any) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full gap-4 text-muted-foreground">
            <AlertCircle className="h-6 w-6" />
            <p>Failed to load templates</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((template: any) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow flex flex-col">
                  <CardContent className="p-4 flex-1 flex flex-col">
                    <div className="mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-sm">{template.name}</h3>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="h-7 w-7">
                              <div className="h-4 w-4 text-muted-foreground">⋯</div>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => toast.success('Template duplicated')}>
                              <Copy className="h-3.5 w-3.5 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/communication/templates/${template.id}/edit`}>
                                <Edit className="h-3.5 w-3.5 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => toast.success('Template deleted')}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {template.type === 'email' && <Mail className="h-3 w-3 mr-1" />}
                          {template.type === 'sms' && <Phone className="h-3 w-3 mr-1" />}
                          {template.type === 'whatsapp' && <MessageSquare className="h-3 w-3 mr-1" />}
                          {template.type.toUpperCase()}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {template.category}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground flex-1 line-clamp-3 mb-4">
                      {template.preview}
                    </p>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => { navigator.clipboard.writeText(template.preview); toast.success('Template copied'); }}>
                        <Copy className="h-3 w-3 mr-1" /> Use
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" asChild>
                        <Link href={`/communication/templates/${template.id}/edit`}><Edit className="h-3 w-3 mr-1" /> Edit</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">No templates found</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
