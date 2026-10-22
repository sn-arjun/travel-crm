'use client';

import * as React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { KanbanBoard } from '@/components/domain/kanban-board';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DateTimePicker } from '@/components/ui/date-picker';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { followUpsApi } from '@/lib/api/follow-ups';
import { leadsApi } from '@/lib/api/leads';
import { formatWholeCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';
import {
  EMPTY_BOARD, STATUS_COLORS, boardFromResponse, boardParams, boardReducer, columnValueLabel, hasMore, isMove, locateLead,
  needsLostReason, needsWonConfirmation, type BoardFilters, type BoardLead,
} from '@/lib/lead-board';

import { LeadAssignDialog } from '../lead-assign-dialog';
import { LeadCard } from './lead-card';

type LoadState = 'loading' | 'ready' | 'error';
type FollowUpType = 'call' | 'email' | 'whatsapp' | 'visit' | 'sms';

const FOLLOW_UP_TYPES: FollowUpType[] = ['call', 'email', 'whatsapp', 'visit', 'sms'];

/** The Leads page as a pipeline: a column per status, cards moved by drag and drop or by "Move to…". */
export function LeadBoard({
  filters,
  hasFilters,
  refreshKey,
  onTotalChange,
}: {
  filters: BoardFilters;
  hasFilters: boolean;
  refreshKey: number;
  onTotalChange?: (total: number) => void;
}) {
  const t = useT();
  const [board, dispatch] = React.useReducer(boardReducer, EMPTY_BOARD);
  const [loadState, setLoadState] = React.useState<LoadState>('loading');
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState<Record<string, boolean>>({});
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(() => new Set());
  const [announcement, setAnnouncement] = React.useState('');
  const [lostFor, setLostFor] = React.useState<{ lead: BoardLead; to: string } | null>(null);
  const [assignId, setAssignId] = React.useState<string | null>(null);
  const [followUpFor, setFollowUpFor] = React.useState<BoardLead | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const boardRef = React.useRef(board);
  boardRef.current = board;
  const requestRef = React.useRef(0);
  const draggedRef = React.useRef<string | null>(null);
  const pendingRef = React.useRef<Set<string>>(new Set());
  const hasLoadedRef = React.useRef(false);

  const statusLabel = React.useCallback((status: string) => t(`pipeline.status.${status}`), [t]);
  const paramsKey = JSON.stringify(boardParams(filters));

  const load = React.useCallback(async (silent: boolean) => {
    const id = ++requestRef.current;
    if (!silent) {
      if (hasLoadedRef.current) setRefreshing(true);
      else setLoadState('loading');
    }
    try {
      const res = await leadsApi.board(boardParams(filters));
      if (id !== requestRef.current) return;
      dispatch({ type: 'replace', state: boardFromResponse(res) });
      hasLoadedRef.current = true;
      setLoadState('ready');
    } catch {
      if (id !== requestRef.current) return;
      if (!hasLoadedRef.current) setLoadState('error');
      else toast.error(t('pipeline.board.loadFailed'));
    } finally {
      if (id === requestRef.current) setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the params key stands for the filters
  }, [paramsKey, t]);

  React.useEffect(() => {
    void load(false);
  }, [load, refreshKey]);

  const total = React.useMemo(() => board.columns.reduce((sum, c) => sum + c.count, 0), [board.columns]);
  React.useEffect(() => {
    if (loadState === 'ready') onTotalChange?.(total);
  }, [total, loadState, onTotalChange]);

  function announce(message: string) {
    // A changed text is what a screen reader announces.
    setAnnouncement((prev) => (prev === message ? `${message} ` : message));
  }

  function setPending(id: string, on: boolean) {
    if (on) pendingRef.current.add(id);
    else pendingRef.current.delete(id);
    setPendingIds(new Set(pendingRef.current));
  }

  /** Applies the move at once, then asks the status route; a refusal puts the card back. */
  async function applyMove(lead: BoardLead, to: string, reason?: string) {
    const at = locateLead(boardRef.current.columns, lead.id);
    if (!at || !isMove(at.status, to)) return;
    setPending(lead.id, true);
    dispatch({ type: 'move', leadId: lead.id, to });
    try {
      await leadsApi.updateStatus(lead.id, { status: to, ...(reason ? { reason } : {}) });
      const message = t('pipeline.move.done', { title: lead.title, status: statusLabel(to) });
      toast.success(message);
      announce(message);
    } catch (err) {
      dispatch({ type: 'rollback', leadId: lead.id, from: at.status, to, index: at.index });
      const why = err instanceof Error && err.message ? err.message : t('pipeline.move.failedGeneric');
      const message = t('pipeline.move.failed', { title: lead.title, reason: why });
      toast.error(message);
      announce(message);
    } finally {
      setPending(lead.id, false);
    }
  }

  /** The one entry for a drop and for "Move to…": Lost asks for a reason, Won for a confirmation. */
  async function requestMove(leadId: string, to: string) {
    const at = locateLead(boardRef.current.columns, leadId);
    if (!at || !isMove(at.status, to)) return;
    if (pendingRef.current.has(leadId)) {
      toast.info(t('pipeline.move.busy', { title: at.lead.title }));
      return;
    }
    if (needsLostReason(to)) {
      setLostFor({ lead: at.lead, to });
      return;
    }
    if (needsWonConfirmation(to)) {
      const ok = await confirm({
        title: t('pipeline.won.title', { title: at.lead.title }),
        description: t('pipeline.won.description'),
        confirmLabel: t('pipeline.won.confirm'),
      });
      if (!ok) return;
    }
    await applyMove(at.lead, to);
  }

  async function loadMore(status: string) {
    const col = boardRef.current.columns.find((c) => c.status === status);
    if (!col || loadingMore[status]) return;
    setLoadingMore((m) => ({ ...m, [status]: true }));
    try {
      const res = boardFromResponse(await leadsApi.board(boardParams(filters, { status, page: col.page + 1 })));
      const next = res.columns.find((c) => c.status === status);
      if (next) dispatch({ type: 'append', status, leads: next.leads, count: next.count });
    } catch {
      toast.error(t('pipeline.column.loadFailed'));
    } finally {
      setLoadingMore((m) => ({ ...m, [status]: false }));
    }
  }

  function handleDragStart(lead: BoardLead, e: React.DragEvent) {
    draggedRef.current = lead.id;
    setDraggingId(lead.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', lead.id);
  }

  function handleDragEnd() {
    draggedRef.current = null;
    setDraggingId(null);
  }

  function handleDrop(columnId: string, e: React.DragEvent) {
    const leadId = draggedRef.current || e.dataTransfer.getData('text/plain');
    draggedRef.current = null;
    setDraggingId(null);
    if (leadId) void requestMove(leadId, columnId);
  }

  if (loadState === 'loading') return <BoardSkeleton label={t('pipeline.board.label')} />;

  if (loadState === 'error') {
    return (
      <div role="alert" className="flex flex-col items-center gap-ds-3 rounded-ds-lg border border-dashed border-ds-border bg-ds-surface-sunken p-ds-8 text-center">
        <AlertCircle className="size-6 text-ds-danger" aria-hidden="true" />
        <p className="text-sm text-ds-foreground-muted">{t('pipeline.board.loadFailed')}</p>
        <Button size="sm" variant="outline" onClick={() => void load(false)}>{t('pipeline.board.retry')}</Button>
      </div>
    );
  }

  if (board.columns.length === 0) {
    return <p className="rounded-ds-lg border border-dashed border-ds-border bg-ds-surface-sunken p-ds-8 text-center text-sm text-ds-foreground-muted">{t('pipeline.board.noColumns')}</p>;
  }

  const format = (amount: number, currency: string) => formatWholeCurrency(amount, currency);

  return (
    <section aria-label={t('pipeline.board.label')} data-testid="lead-board" aria-busy={refreshing || undefined} className={refreshing ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <p className="sr-only">{t('pipeline.board.hint')}</p>
      <p role="status" aria-live="polite" className="sr-only" data-testid="lead-board-status">{announcement}</p>

      <KanbanBoard
        onDropItem={handleDrop}
        columns={board.columns.map((col) => {
          const targets = board.columns
            .filter((c) => c.status !== col.status)
            .map((c) => ({ status: c.status, label: statusLabel(c.status), color: STATUS_COLORS[c.status] ?? 'var(--ds-foreground-muted)' }));
          const value = board.showValue ? columnValueLabel(col, format) : { amount: '', otherCurrency: 0 };
          const remaining = col.count - col.leads.length;
          return {
            id: col.status,
            title: statusLabel(col.status),
            color: STATUS_COLORS[col.status] ?? 'var(--ds-foreground-muted)',
            count: col.count,
            value: value.amount || undefined,
            valueNote: value.otherCurrency > 0 ? t('pipeline.column.otherCurrency', { count: value.otherCurrency }) : undefined,
            valueTitle: value.otherCurrency > 0 ? t('pipeline.column.otherCurrencyHint', { count: value.otherCurrency }) : undefined,
            isEmpty: col.leads.length === 0,
            empty: (
              <p className="py-ds-6 text-center text-xs text-ds-foreground-muted" data-testid={`board-empty-${col.status}`}>
                {hasFilters ? t('pipeline.column.emptyFiltered') : t('pipeline.column.empty')}
              </p>
            ),
            children: col.leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                statusLabel={statusLabel(col.status)}
                boardCurrency={board.currency}
                showValue={board.showValue}
                moveTargets={targets}
                dragging={draggingId === lead.id}
                pending={pendingIds.has(lead.id)}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onMove={(id, status) => void requestMove(id, status)}
                onAssign={(l) => setAssignId(l.id)}
                onFollowUp={setFollowUpFor}
              />
            )),
            footer: hasMore(col) ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!!loadingMore[col.status]}
                aria-label={t('pipeline.column.loadMoreLabel', { status: statusLabel(col.status), remaining })}
                data-testid={`board-load-more-${col.status}`}
                onClick={() => void loadMore(col.status)}
              >
                {loadingMore[col.status] && <Loader2 className="animate-spin" aria-hidden="true" />}
                {t('pipeline.column.loadMore')}
              </Button>
            ) : undefined,
          };
        })}
      />

      {confirmDialog}

      <LostReasonDialog
        target={lostFor}
        onCancel={() => setLostFor(null)}
        onConfirm={(reason) => {
          const target = lostFor;
          setLostFor(null);
          if (target) void applyMove(target.lead, target.to, reason);
        }}
      />

      <LeadAssignDialog
        open={assignId !== null}
        onOpenChange={(open) => { if (!open) setAssignId(null); }}
        leadIds={assignId ? [assignId] : []}
        onAssigned={() => void load(true)}
      />

      <FollowUpDialog lead={followUpFor} onClose={() => setFollowUpFor(null)} />
    </section>
  );
}

function BoardSkeleton({ label }: { label: string }) {
  return (
    <div className="flex gap-ds-4 overflow-x-auto" aria-busy="true" aria-label={label} data-testid="lead-board-skeleton">
      {[0, 1, 2, 3, 4].map((col) => (
        <div key={col} className="w-80 shrink-0 space-y-ds-3 rounded-ds-lg border border-dashed border-ds-border bg-ds-surface-sunken p-ds-3">
          <Skeleton className="h-4 w-24" />
          {[0, 1, 2].slice(0, 3 - (col % 2)).map((i) => <Skeleton key={i} className="h-28 w-full rounded-ds-md" />)}
        </div>
      ))}
    </div>
  );
}

/** Asks why the lead is lost; cancelling leaves the lead where it was (nothing moved yet). */
function LostReasonDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: { lead: BoardLead; to: string } | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const t = useT();
  const [reason, setReason] = React.useState('');
  React.useEffect(() => {
    if (target) setReason('');
  }, [target]);

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-md" data-testid="lost-reason-dialog">
        <DialogHeader>
          <DialogTitle>{t('pipeline.lost.title', { title: target?.lead.title ?? '' })}</DialogTitle>
          <DialogDescription>{t('pipeline.lost.description')}</DialogDescription>
        </DialogHeader>
        <form
          id="lost-reason-form"
          className="space-y-ds-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) onConfirm(reason.trim());
          }}
        >
          <Label htmlFor="lost-reason">{t('pipeline.lost.reasonLabel')}</Label>
          <Textarea
            id="lost-reason"
            autoFocus
            rows={3}
            value={reason}
            placeholder={t('pipeline.lost.reasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && reason.trim()) onConfirm(reason.trim());
            }}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="submit" form="lost-reason-form" variant="destructive" disabled={!reason.trim()}>{t('pipeline.lost.confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Schedules a follow-up for the lead without leaving the board. */
function FollowUpDialog({ lead, onClose }: { lead: BoardLead | null; onClose: () => void }) {
  const t = useT();
  const [when, setWhen] = React.useState<Date | undefined>(undefined);
  const [type, setType] = React.useState<FollowUpType>('call');
  const [notes, setNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (lead) {
      setWhen(undefined);
      setType('call');
      setNotes('');
    }
  }, [lead]);

  async function save() {
    if (!lead || !when) return;
    setSaving(true);
    try {
      await followUpsApi.create({ leadId: lead.id, scheduledAt: when.toISOString(), type, notes: notes || undefined });
      toast.success(t('pipeline.followUp.saved'));
      onClose();
    } catch {
      toast.error(t('pipeline.followUp.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={lead !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="board-follow-up-dialog">
        <DialogHeader>
          <DialogTitle>{t('pipeline.followUp.title')}</DialogTitle>
          <DialogDescription>{t('pipeline.followUp.description', { title: lead?.title ?? '' })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-ds-4">
          <div className="grid grid-cols-2 gap-ds-4">
            <div className="space-y-ds-2">
              <Label>{t('pipeline.followUp.when')}</Label>
              <DateTimePicker value={when} onChange={setWhen} placeholder={t('pipeline.followUp.whenPlaceholder')} minDate={new Date()} />
            </div>
            <div className="space-y-ds-2">
              <Label>{t('pipeline.followUp.type')}</Label>
              <Select value={type} onValueChange={(v) => setType(v as FollowUpType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_TYPES.map((kind) => (
                    <SelectItem key={kind} value={kind}>{t(`pipeline.followUp.type.${kind}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-ds-2">
            <Label>{t('pipeline.followUp.notes')}</Label>
            <Textarea rows={3} value={notes} placeholder={t('pipeline.followUp.notesPlaceholder')} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={() => void save()} disabled={saving || !when}>
            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
            {t('pipeline.followUp.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
