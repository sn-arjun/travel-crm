'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Plus, Mail, MessageSquare, Phone, Copy, Edit, Trash2, AlertCircle, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { FilterBar } from '@/components/domain/filter-bar';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useApiMutation } from '@/hooks/use-api';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';

export default function TemplatesPage() {
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('');

  const { items: templates, loading, loadingMore, total, error, sentinelRef, refetch } = useInfiniteScroll<MessageTemplate>({
    fetcher: (page, limit) =>
      templatesApi.list({
        search: search || undefined,
        channel: typeFilter || undefined,
        category: categoryFilter || undefined,
        page,
        limit,
      }),
    limit: 24,
  });

  const { mutate: deleteTemplate } = useApiMutation(
    (id: string) => templatesApi.delete(id),
  );

  const { mutate: createDuplicate } = useApiMutation(
    (tpl: MessageTemplate) =>
      templatesApi.create({
        channel: tpl.channel,
        name: `${tpl.name} (Copy)`,
        subject: tpl.subject,
        content: tpl.content,
        category: tpl.category,
        language: tpl.language,
      }),
  );

  const handleDelete = async (id: string, name: string) => {
    const result = await deleteTemplate(id);
    if (result) {
      toast.success(`Template "${name}" deleted`);
      refetch();
    } else {
      toast.error('Failed to delete template');
    }
  };

  const handleDuplicate = async (tpl: MessageTemplate) => {
    const result = await createDuplicate(tpl);
    if (result) {
      toast.success('Template duplicated');
      refetch();
    } else {
      toast.error('Failed to duplicate template');
    }
  };

  const activeFilters = [
    ...(typeFilter ? [{ id: 'channel', label: 'Channel', value: typeFilter }] : []),
    ...(categoryFilter ? [{ id: 'category', label: 'Category', value: categoryFilter }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Message Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '...' : `${total} templates`}
          </p>
        </div>
        <Button asChild>
          <Link href="/communication/templates/new">
            <Plus className="h-4 w-4 mr-1.5" /> Create Template
          </Link>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b flex-wrap">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search templates..."
          activeFilters={activeFilters}
          onRemoveFilter={(id) => {
            if (id === 'channel') setTypeFilter('');
            if (id === 'category') setCategoryFilter('');
          }}
          onClearFilters={() => { setTypeFilter(''); setCategoryFilter(''); }}
          actions={
            <div className="flex items-center gap-2">
              <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="All Channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="greeting">Greeting / Welcome</SelectItem>
                  <SelectItem value="follow_up">Follow-up</SelectItem>
                  <SelectItem value="quotation">Quotation / Proposal</SelectItem>
                  <SelectItem value="booking">Booking Confirmation</SelectItem>
                  <SelectItem value="reminder">Payment Reminder</SelectItem>
                  <SelectItem value="wish">Thank You / Wish</SelectItem>
                  <SelectItem value="offer">Promotional / Offer</SelectItem>
                  <SelectItem value="visa">Visa / Travel Docs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full gap-4 text-muted-foreground">
            <AlertCircle className="h-6 w-6" />
            <p>Failed to load templates</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No templates found</p>
            <p className="text-sm mb-4">Create your first message template to get started</p>
            <Button asChild>
              <Link href="/communication/templates/new">
                <Plus className="h-4 w-4 mr-1.5" /> Create Template
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow flex flex-col">
                  <CardContent className="p-4 flex-1 flex flex-col">
                    <div className="mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-sm line-clamp-1">{template.name}</h3>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0">
                              <span className="text-muted-foreground text-sm">⋯</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDuplicate(template)}>
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
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(template.id, template.name)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {template.channel === 'email' && <Mail className="h-3 w-3 mr-1" />}
                          {template.channel === 'sms' && <Phone className="h-3 w-3 mr-1" />}
                          {template.channel === 'whatsapp' && <MessageSquare className="h-3 w-3 mr-1" />}
                          {template.channel.toUpperCase()}
                        </Badge>
                        {template.category && (
                          <Badge variant="secondary" className="text-[10px]">
                            {template.category}
                          </Badge>
                        )}
                        {template.language && template.language !== 'en' && (
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {template.language}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground flex-1 line-clamp-3 mb-4">
                      {template.subject ? `[${template.subject}] ` : ''}
                      {template.content}
                    </p>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(template.content);
                          toast.success('Template content copied');
                        }}
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" asChild>
                        <Link href={`/communication/templates/${template.id}/edit`}>
                          <Edit className="h-3 w-3 mr-1" /> Edit
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="flex items-center justify-center py-6">
              {loadingMore && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
