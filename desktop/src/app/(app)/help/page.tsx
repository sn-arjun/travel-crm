'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, BookOpen, HelpCircle, Sparkles, Mail, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/layout/page-container';
import { formatDisplayDate } from '@/lib/dates';
import { toast } from 'sonner';


interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: 'general' | 'leads' | 'tasks' | 'invoices' | 'fleet';
}

const faqItems: FAQItem[] = [
  {
    id: 'faq-1',
    question: 'How do I create a new lead in TravelCRM?',
    answer: 'To create a new lead, click the "New Lead" button on the dashboard or navigate to the Leads section and click "New Lead". Fill in the customer details including destination, travel dates, budget, and number of travelers. You can also link the lead to an existing contact or create a new one during the process.',
    category: 'leads',
  },
  {
    id: 'faq-2',
    question: 'What is the lead status workflow?',
    answer: 'Leads progress through these stages: New → Contacted → Qualified → Proposal Sent → Negotiation → Won (or Lost). You can manually change the status by clicking on the lead and selecting the new status. The system tracks when each status change occurs.',
    category: 'leads',
  },
  {
    id: 'faq-3',
    question: 'How do I assign tasks to team members?',
    answer: 'Click "New Task" on the Tasks page, fill in the task details, select an assignee from the dropdown, set a due date, and click Create. You can also edit existing tasks to reassign them. Team members will see their assigned tasks on their dashboard.',
    category: 'tasks',
  },
  {
    id: 'faq-4',
    question: 'How do I track invoice payments?',
    answer: 'Go to the Invoices section, create an invoice by selecting a lead and entering the amount. Track payment status through the invoice dashboard. You can mark invoices as paid, pending, or overdue. Filter invoices by status to monitor collection.',
    category: 'invoices',
  },
  {
    id: 'faq-5',
    question: 'How do I manage fleet and driver assignments?',
    answer: 'Navigate to the Fleet section to view all vehicles and drivers. Assign drivers to specific trips by selecting the trip and choosing a driver. Track vehicle maintenance, fuel, and driver performance metrics in the Fleet dashboard.',
    category: 'fleet',
  },
  {
    id: 'faq-6',
    question: 'Can I export leads and reports?',
    answer: 'Yes, most sections have an export option. Go to the respective section (Leads, Invoices, etc.), apply filters if needed, and click the Export button. You can export to CSV or PDF formats depending on your needs.',
    category: 'general',
  },
  {
    id: 'faq-7',
    question: 'How do I set up follow-up reminders?',
    answer: 'When creating or editing a lead, click "Add Follow-up" to schedule a reminder. You can set the type (call, email, meeting), date, and time. Follow-ups appear in your dashboard and send notifications at the scheduled time.',
    category: 'leads',
  },
  {
    id: 'faq-8',
    question: 'How do I generate an itinerary?',
    answer: 'Select a lead with confirmed travel dates, click "Create Itinerary", and the system will suggest activities based on the destination. You can customize the itinerary by adding/removing activities, adjusting timings, and including hotel and transportation details.',
    category: 'leads',
  },
  {
    id: 'faq-9',
    question: 'What does the AI health score mean?',
    answer: 'The AI health score (0-100) predicts the likelihood of closing a lead. It considers factors like engagement, proposal sent, follow-up frequency, and time in pipeline. A higher score indicates a lead is more likely to convert. Use this to prioritize your sales efforts.',
    category: 'general',
  },
  {
    id: 'faq-10',
    question: 'How do I search for specific leads or contacts?',
    answer: 'Use the search bar in the top navigation or within any section. Search by name, phone, email, destination, or lead status. Filters allow you to narrow down by date range, priority, or other criteria. Saved searches can be created for frequently used filters.',
    category: 'general',
  },
];

const SUPPORT_EMAIL = 'support@travelcrmpro.com';

// In-page shortcuts: every destination exists on this page.
const quickLinks = [
  { label: 'Getting Started', icon: BookOpen, href: '#getting-started' },
  { label: 'FAQ', icon: HelpCircle, href: '#faq' },
  { label: "What's New", icon: Sparkles, href: '#whats-new' },
  { label: 'Contact Support', icon: Mail, href: '#contact' },
];

const gettingStarted = [
  { step: 1, title: 'Set Up Your Profile', description: 'Configure your user profile, team, and organization settings in Settings.' },
  { step: 2, title: 'Add Your First Lead', description: 'Create a lead with customer details, destination, and travel dates. Set priority and assign to team member.' },
  { step: 3, title: 'Start Managing', description: 'Track the lead through pipeline, create tasks, send proposals, and close deals. Monitor KPIs on dashboard.' },
];

const recentUpdates = [
  { date: '2026-03-05', title: 'New: Bulk invoice export to PDF', description: 'Export multiple invoices at once for batch processing.' },
  { date: '2026-03-01', title: 'Improved: Dashboard performance', description: 'Faster KPI calculations and chart rendering.' },
  { date: '2026-02-25', title: 'New: AI lead recommendations', description: 'Get AI-powered suggestions for which leads to prioritize.' },
  { date: '2026-02-20', title: 'Updated: Task management', description: 'Subtasks, comments, and improved filtering now available.' },
];

interface FormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [formData, setFormData] = React.useState<FormData>({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [submitMessage, setSubmitMessage] = React.useState('');

  const filteredFAQ = faqItems.filter((item) => {
    const query = searchQuery.toLowerCase();
    return item.question.toLowerCase().includes(query) || item.answer.toLowerCase().includes(query);
  });

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      toast.error('Please fill in all fields');
      return;
    }

    const body = `From: ${formData.name} <${formData.email}>\nSubject: ${formData.subject}\n\n${formData.message}`;
    try {
      await navigator.clipboard.writeText(body);
      setSubmitMessage(`Copied to clipboard — paste it into an email to ${SUPPORT_EMAIL}.`);
      toast.success('Message copied — send it to support from your email client');
    } catch {
      setSubmitMessage(`Please email ${SUPPORT_EMAIL} directly with your message.`);
      toast.info(`Email ${SUPPORT_EMAIL} directly — clipboard access unavailable`);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <PageContainer className="gap-ds-6">
      <PageHeader title="Help Center" description="Find answers, tutorials, and support" />
      <div className="flex flex-col gap-ds-6">
        {/* Search */}
        <div className="max-w-2xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search help articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
        </div>

        {/* Quick Links */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Quick Links</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickLinks.map((link) => {
              const LinkIcon = link.icon;
              return (
                <Link key={link.label} href={link.href}>
                  <Card className="h-full hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                      <LinkIcon className="h-6 w-6 text-primary" />
                      <span className="text-xs font-medium">{link.label}</span>
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Getting Started */}
        <div id="getting-started" className="scroll-mt-ds-4">
          <h2 className="text-sm font-semibold mb-3">Getting Started</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {gettingStarted.map((item) => (
              <Card key={item.step}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                      {item.step}
                    </div>
                    <CardTitle className="text-sm">{item.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div id="faq" className="scroll-mt-ds-4">
          <h2 className="text-sm font-semibold mb-3">Frequently Asked Questions</h2>
          {filteredFAQ.length > 0 ? (
            <Accordion type="single" collapsible className="w-full space-y-2">
              {filteredFAQ.map((item) => (
                <AccordionItem key={item.id} value={item.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex items-center gap-3 text-left flex-1">
                      <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                      <span className="font-medium text-sm">{item.question}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground pt-2">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No results found for "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* What's New */}
        <div id="whats-new" className="scroll-mt-ds-4">
          <h2 className="text-sm font-semibold mb-3">What's New</h2>
          <div className="space-y-3">
            {recentUpdates.map((update, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-sm">{update.title}</h3>
                  <Badge variant="outline" className="text-xs">{formatDisplayDate(update.date)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{update.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Contact Form */}
        <div id="contact" className="scroll-mt-ds-4">
          <h2 className="text-sm font-semibold mb-3">Still need help?</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Support</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium block mb-1.5">Name</label>
                    <Input
                      name="name"
                      placeholder="Your name"
                      value={formData.name}
                      onChange={handleFormChange}
                      required
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1.5">Email</label>
                    <Input
                      name="email"
                      type="email"
                      placeholder="your@email.com"
                      value={formData.email}
                      onChange={handleFormChange}
                      required
                      className="h-9"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5">Subject</label>
                  <Input
                    name="subject"
                    placeholder="What is this about?"
                    value={formData.subject}
                    onChange={handleFormChange}
                    required
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5">Message</label>
                  <textarea
                    name="message"
                    placeholder="Describe your issue or question..."
                    value={formData.message}
                    onChange={handleFormChange}
                    required
                    className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="flex items-center justify-between">
                  {submitMessage && (
                    <p className="text-xs text-ds-success">{submitMessage}</p>
                  )}
                  <Button type="submit" className="ml-auto">
                    Send Message
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
