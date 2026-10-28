'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarClock, ExternalLink, MapPin, UserPlus, User, Users } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { cn } from '@/lib/utils';
import { formatDisplayDate } from '@/lib/dates';
import { formatWholeCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { leadAmount, leadCurrency, type BoardLead } from '@/lib/lead-board';

import { MoveToMenu, type MoveTarget } from './move-to-menu';

function initialsOf(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? '' : '';
  return (first + last).toUpperCase();
}

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'info'> = { hot: 'danger', warm: 'warning', cold: 'info' };

/** One lead on the board: draggable, with hover actions and a "Move to…" menu for the keyboard. */
export function LeadCard({
  lead,
  statusLabel,
  boardCurrency,
  showValue,
  moveTargets,
  dragging,
  pending,
  onDragStart,
  onDragEnd,
  onMove,
  onAssign,
  onFollowUp,
}: {
  lead: BoardLead;
  statusLabel: string;
  boardCurrency: string;
  showValue: boolean;
  moveTargets: MoveTarget[];
  dragging: boolean;
  pending: boolean;
  onDragStart: (lead: BoardLead, event: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (leadId: string, status: string) => void;
  onAssign: (lead: BoardLead) => void;
  onFollowUp: (lead: BoardLead) => void;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const amount = leadAmount(lead);
  const currency = leadCurrency(lead, boardCurrency);
  const destination = lead.destinations?.length ? lead.destinations.join(', ') : '';
  const travelDate = lead.travelDate ? formatDisplayDate(lead.travelDate, 'short') : '';
  const owner = lead.assignedToName || '';
  const priority = lead.priority && PRIORITY_TONE[lead.priority] ? lead.priority : null;

  return (
    <div
      role="group"
      aria-label={lead.title}
      aria-busy={pending || undefined}
      data-testid="lead-card"
      data-lead-id={lead.id}
      draggable={!pending}
      onDragStart={(e) => onDragStart(lead, e)}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative rounded-ds-md border border-ds-border bg-ds-surface p-ds-3 shadow-ds-1 transition-[box-shadow,opacity,transform] duration-150',
        'cursor-grab hover:shadow-ds-2 active:cursor-grabbing',
        'focus-within:border-ds-primary',
        dragging && 'opacity-40',
        pending && 'opacity-70',
      )}
    >
      <div
        className={cn(
          'absolute end-ds-2 top-ds-2 flex items-center gap-0.5 rounded-ds-md border border-ds-border bg-ds-surface p-0.5 shadow-ds-2',
          'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
          menuOpen && 'opacity-100',
        )}
      >
        <Button asChild variant="ghost" size="icon-xs">
          <Link href={`/leads/${lead.id}`} draggable={false} aria-label={t('pipeline.card.openLabel', { title: lead.title })} title={t('pipeline.card.open')}>
            <ExternalLink aria-hidden="true" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t('pipeline.card.assignLabel', { title: lead.title })}
          title={t('pipeline.card.assign')}
          onClick={() => onAssign(lead)}
        >
          <UserPlus aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t('pipeline.card.followUpLabel', { title: lead.title })}
          title={t('pipeline.card.followUp')}
          onClick={() => onFollowUp(lead)}
        >
          <CalendarClock aria-hidden="true" />
        </Button>
        <MoveToMenu
          title={lead.title}
          currentLabel={statusLabel}
          targets={moveTargets}
          disabled={pending}
          onMove={(status) => onMove(lead.id, status)}
          onOpenChange={setMenuOpen}
        />
      </div>

      <Link
        href={`/leads/${lead.id}`}
        draggable={false}
        className="line-clamp-2 rounded-ds-sm text-sm font-semibold leading-snug text-ds-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ds-ring"
      >
        {lead.title}
      </Link>

      <div className="mt-ds-2 space-y-1 text-xs text-ds-foreground-muted">
        <p className="flex items-center gap-ds-1 truncate">
          <User className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{lead.contactName || t('pipeline.card.noContact')}</span>
        </p>
        {destination && (
          <p className="flex items-center gap-ds-1 truncate">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{destination}</span>
          </p>
        )}
        {travelDate && (
          <p className="flex items-center gap-ds-1">
            <CalendarClock className="size-3 shrink-0" aria-hidden="true" />
            <span>{t('pipeline.card.travels', { date: travelDate })}</span>
          </p>
        )}
      </div>

      {(lead.seats || priority) && (
        <div className="mt-ds-2 flex flex-wrap items-center gap-ds-1">
          {lead.seats ? (
            <Tag tone={lead.seatStatus === 'confirmed' ? 'success' : 'info'} data-testid="lead-card-seats" title={lead.seatStatus === 'confirmed' ? t('pipeline.card.seatsConfirmed', { count: lead.seats }) : t('pipeline.card.seatsHeld', { count: lead.seats })}>
              <Users className="size-3" aria-hidden="true" />
              {t('pipeline.card.seats', { count: lead.seats })}
            </Tag>
          ) : null}
          {priority && <Tag tone={PRIORITY_TONE[priority]}>{t(`pipeline.card.priority.${priority}`)}</Tag>}
        </div>
      )}

      <div className="mt-ds-3 flex items-center justify-between gap-ds-2">
        <div className="flex min-w-0 items-center gap-ds-2" title={owner ? t('pipeline.card.owner', { name: owner }) : t('pipeline.card.unassigned')}>
          <Avatar className="size-6">
            <AvatarFallback className="text-ds-xs">{owner ? initialsOf(owner) : '?'}</AvatarFallback>
          </Avatar>
          <span className="max-w-24 truncate text-xs text-ds-foreground-muted">{owner || t('pipeline.card.unassigned')}</span>
        </div>
        {showValue && amount > 0 && (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-ds-foreground">{formatWholeCurrency(amount, currency)}</span>
        )}
      </div>
    </div>
  );
}
