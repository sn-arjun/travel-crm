'use client';

import { ArrowLeft, MessageSquare, MoreHorizontal } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Timeline, type TimelineItem } from '@/components/ui/timeline';
import { PageContainer } from '@/components/layout/page-container';

import { SendMessageDialog } from '../communication/send-message-dialog';

export interface DetailAction {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
}

export interface RelatedList {
  /** Tab-panel heading. */
  title: string;
  /** Rendered inside a SectionCard on the Related tab. */
  content: React.ReactNode;
  action?: React.ReactNode;
}

export interface DetailPageProps<T> {
  entity: T;
  title: string;
  subtitle?: string;
  /** Status badge shown beside the title. */
  status?: React.ReactNode;

  onBack?: () => void;
  actions?: DetailAction[];
  /** Buttons rendered before the actions dropdown. */
  primaryActions?: React.ReactNode;

  /** Overview tab content — usually a grid of SectionCards. */
  overview: React.ReactNode;

  /** Activity tab. Omit to hide the tab. */
  activity?: TimelineItem[];
  activityLoading?: boolean;

  /** Related tab. Omit to hide the tab. */
  related?: RelatedList[];

  /** Documents tab. Omit to hide the tab. */
  documents?: React.ReactNode;

  /**
   * Enables the "Send message" action. All outbound communication routes
   * through the Communication Hub — never mailto:, wa.me, or tel:.
   */
  messaging?: {
    recipientId: string;
    recipientName: string;
    email?: string;
    phone?: string;
    /** Called after a message was sent, e.g. to refetch the page's activity. */
    onSent?: () => void;
  };

  className?: string;
}

/**
 * The detail archetype: header with status and actions, tabbed body
 * (Overview / Activity / Related / Documents), and Communication Hub messaging.
 */
export function DetailPage<T>({
  title,
  subtitle,
  status,
  onBack,
  actions = [],
  primaryActions,
  overview,
  activity,
  activityLoading,
  related,
  documents,
  messaging,
  className,
}: DetailPageProps<T>) {
  const [messageOpen, setMessageOpen] = React.useState(false);

  return (
    <PageContainer className={className}>
      <PageHeader
        title={title}
        description={subtitle}
        status={status}
        back={
          onBack && (
            <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Go back">
              <ArrowLeft aria-hidden="true" />
            </Button>
          )
        }
        actions={
          <>
            {messaging && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMessageOpen(true)}
                className="gap-ds-2"
              >
                <MessageSquare aria-hidden="true" />
                Send message
              </Button>
            )}
            {primaryActions}
            {actions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm" aria-label="More actions">
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {actions.map((action, i) => (
                    <React.Fragment key={`${action.label}-${i}`}>
                      {action.separatorBefore && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onSelect={action.onSelect}
                        disabled={action.disabled}
                        variant={action.destructive ? 'destructive' : 'default'}
                      >
                        {action.icon}
                        {action.label}
                      </DropdownMenuItem>
                    </React.Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {activity && <TabsTrigger value="activity">Activity</TabsTrigger>}
          {related && related.length > 0 && <TabsTrigger value="related">Related</TabsTrigger>}
          {documents && <TabsTrigger value="documents">Documents</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-ds-4">
          {overview}
        </TabsContent>

        {activity && (
          <TabsContent value="activity" className="mt-ds-4">
            <SectionCard title="Activity">
              <Timeline
                items={activity}
                loading={activityLoading}
                emptyState={
                  <EmptyState
                    title="No activity yet"
                    description="Calls, emails, and updates will appear here."
                  />
                }
              />
            </SectionCard>
          </TabsContent>
        )}

        {related && related.length > 0 && (
          <TabsContent value="related" className="mt-ds-4">
            <div className="flex flex-col gap-ds-4">
              {related.map((list) => (
                <SectionCard key={list.title} title={list.title} actions={list.action} flush>
                  {list.content}
                </SectionCard>
              ))}
            </div>
          </TabsContent>
        )}

        {documents && (
          <TabsContent value="documents" className="mt-ds-4">
            <SectionCard title="Documents">{documents}</SectionCard>
          </TabsContent>
        )}
      </Tabs>

      {messaging && (
        <SendMessageDialog
          open={messageOpen}
          onOpenChange={setMessageOpen}
          onSent={messaging.onSent}
          contact={{
            id: messaging.recipientId,
            name: messaging.recipientName,
            email: messaging.email,
            phone: messaging.phone,
          }}
        />
      )}
    </PageContainer>
  );
}
