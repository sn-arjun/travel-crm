'use client';

import * as React from 'react';

import { AreaChart, BarChart, PieChart, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { ReportPageTemplate } from '@/components/domain/report-page-template';
import {
  ReportBadge,
  ReportExportButton,
  ReportPanel,
  ReportPanelGrid,
  ReportSection,
  ReportTable,
  deltaOf,
  formatCount,
  formatDecimal,
  formatDestinations,
  formatMonthKey,
  formatPercent,
  formatReportCurrency,
  formatReportMoney,
  humanize,
  sumBy,
  useUserNames,
  type ReportTone,
} from '@/components/domain/reports/shared';
import { formatDisplayDate } from '@/lib/dates';

interface PipelineRow {
  status: string;
  lead_count: number;
  total_budget_potential: number;
  avg_days_in_stage: number;
}

interface AgeingRow {
  lead_id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  priority: string | null;
  budget: number | null;
  days_in_pipeline: number;
  health_color: string;
}

interface SourceRow {
  source: string | null;
  total_leads: number;
  won_leads: number;
  lost_leads: number;
  total_revenue: number;
  conversion_rate: number;
}

interface ResponseRow {
  assigned_to: string | null;
  total_leads: number;
  avg_response_hours: number;
}

interface FollowupRow {
  assigned_to: string | null;
  total_leads: number;
  leads_with_followup: number;
  compliance_rate: number;
  overdue_followups: number;
}

interface HotLeadRow {
  lead_id: string;
  title: string;
  destination: string | null;
  budget: number | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
  age_days: number;
}

interface LostRow {
  lost_reason: string | null;
  assigned_to: string | null;
  count: number;
  lost_value: number;
  avg_lost_deal_size: number;
}

interface VelocityRow {
  month: string;
  new_leads: number;
  qualified_won_leads: number;
  avg_days_to_close: number;
}

const CLOSED = new Set(['won', 'lost']);

const HEALTH_TONE: Record<string, ReportTone> = { green: 'success', yellow: 'warning', red: 'danger' };
const HEALTH_LABEL: Record<string, string> = { green: 'Healthy', yellow: 'Slowing', red: 'At risk' };

function PipelineTab() {
  return (
    <ReportSection<PipelineRow>
      reportId="pipeline_summary"
      comparable
      kpis={(rows, prev) => {
        const open = rows.filter((r) => !CLOSED.has(r.status));
        const won = rows.find((r) => r.status === 'won')?.lead_count ?? 0;
        const total = sumBy(rows, (r) => r.lead_count);
        return [
          { label: 'Total Leads', value: formatCount(total), delta: deltaOf(rows, prev, (r) => r.lead_count) },
          { label: 'Open Leads', value: formatCount(sumBy(open, (r) => r.lead_count)) },
          { label: 'Pipeline Value', value: formatReportCurrency(sumBy(open, (r) => r.total_budget_potential)), hint: 'Open leads only' },
          { label: 'Win Rate', value: formatPercent(total > 0 ? (won / total) * 100 : 0), hint: 'Won / all leads' },
        ];
      }}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: humanize(r.status) }));
        return (
          <>
            <ReportPanelGrid>
              <ReportPanel title="Leads by stage">
                <BarChart data={data} categoryKey="label" series={[{ dataKey: 'lead_count', label: 'Leads' }]} showLegend={false} />
              </ReportPanel>
              <ReportPanel title="Budget potential by stage">
                <PieChart data={data} dataKey="total_budget_potential" nameKey="label" donut valueFormatter={(v) => formatReportCurrency(v)} />
              </ReportPanel>
            </ReportPanelGrid>
            <ReportPanel title="Pipeline summary">
              <ReportTable
                caption="Pipeline summary"
                rows={data}
                columns={[
                  { key: 'label', header: 'Stage' },
                  { key: 'lead_count', header: 'Leads', align: 'right', cell: (r) => formatCount(r.lead_count) },
                  { key: 'total_budget_potential', header: 'Budget potential', align: 'right', cell: (r) => formatReportMoney(r.total_budget_potential) },
                  { key: 'avg_days_in_stage', header: 'Avg days in stage', align: 'right', cell: (r) => formatDecimal(r.avg_days_in_stage) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

function AgeingTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<AgeingRow>
      reportId="lead_ageing"
      kpis={(rows) => [
        { label: 'Open Leads', value: formatCount(rows.length) },
        { label: 'Avg Age', value: `${formatDecimal(rows.length ? sumBy(rows, (r) => r.days_in_pipeline) / rows.length : 0)} days` },
        { label: 'At Risk', value: formatCount(rows.filter((r) => r.health_color === 'red').length), hint: 'Stuck for too long' },
        { label: 'Healthy', value: formatCount(rows.filter((r) => r.health_color === 'green').length) },
      ]}
    >
      {(rows) => (
        <ReportPanel title="Lead ageing" description="Open leads by days in the pipeline">
          <ReportTable
            caption="Lead ageing"
            rows={rows}
            columns={[
              { key: 'title', header: 'Lead' },
              { key: 'status', header: 'Stage', cell: (r) => humanize(r.status) },
              { key: 'assigned_to', header: 'Owner', cell: (r) => nameOf(r.assigned_to) },
              { key: 'priority', header: 'Priority', cell: (r) => humanize(r.priority) },
              { key: 'budget', header: 'Budget', align: 'right', cell: (r) => (r.budget ? formatReportMoney(r.budget) : '—') },
              { key: 'days_in_pipeline', header: 'Days open', align: 'right', cell: (r) => formatCount(r.days_in_pipeline) },
              {
                key: 'health_color',
                header: 'Health',
                cell: (r) => <ReportBadge tone={HEALTH_TONE[r.health_color] ?? 'neutral'}>{HEALTH_LABEL[r.health_color] ?? humanize(r.health_color)}</ReportBadge>,
              },
            ]}
          />
        </ReportPanel>
      )}
    </ReportSection>
  );
}

function SourceTab() {
  return (
    <ReportSection<SourceRow> reportId="lead_source_analysis">
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: humanize(r.source) }));
        return (
          <>
            <ReportPanelGrid>
              <ReportPanel title="Leads by source">
                <PieChart data={data} dataKey="total_leads" nameKey="label" donut />
              </ReportPanel>
              <ReportPanel title="Conversion rate by source">
                <BarChart
                  data={data}
                  categoryKey="label"
                  series={[{ dataKey: 'conversion_rate', label: 'Conversion rate' }]}
                  valueFormatter={(v) => formatPercent(v, 0)}
                  showLegend={false}
                />
              </ReportPanel>
            </ReportPanelGrid>
            <ReportPanel title="Source details">
              <ReportTable
                caption="Lead source analysis"
                rows={data}
                columns={[
                  { key: 'label', header: 'Source' },
                  { key: 'total_leads', header: 'Leads', align: 'right', cell: (r) => formatCount(r.total_leads) },
                  { key: 'won_leads', header: 'Won', align: 'right', cell: (r) => formatCount(r.won_leads) },
                  { key: 'lost_leads', header: 'Lost', align: 'right', cell: (r) => formatCount(r.lost_leads) },
                  { key: 'total_revenue', header: 'Revenue', align: 'right', cell: (r) => formatReportMoney(r.total_revenue) },
                  { key: 'conversion_rate', header: 'Conversion', align: 'right', cell: (r) => formatPercent(r.conversion_rate) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

function ResponseTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<ResponseRow> reportId="lead_response_time">
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: nameOf(r.assigned_to) }));
        return (
          <ReportPanelGrid>
            <ReportPanel title="Average first-response time (hours)">
              <BarChart
                data={data}
                categoryKey="label"
                series={[{ dataKey: 'avg_response_hours', label: 'Hours' }]}
                valueFormatter={(v) => formatDecimal(v)}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Response details">
              <ReportTable
                caption="Lead response time"
                rows={data}
                columns={[
                  { key: 'label', header: 'Owner' },
                  { key: 'total_leads', header: 'Leads', align: 'right', cell: (r) => formatCount(r.total_leads) },
                  { key: 'avg_response_hours', header: 'Avg response (hours)', align: 'right', cell: (r) => formatDecimal(r.avg_response_hours) },
                ]}
              />
            </ReportPanel>
          </ReportPanelGrid>
        );
      }}
    </ReportSection>
  );
}

function FollowupTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<FollowupRow>
      reportId="followup_compliance"
      kpis={(rows) => {
        const leads = sumBy(rows, (r) => r.total_leads);
        const withFollowup = sumBy(rows, (r) => r.leads_with_followup);
        return [
          { label: 'Leads', value: formatCount(leads) },
          { label: 'With Follow-up', value: formatCount(withFollowup) },
          { label: 'Compliance', value: formatPercent(leads > 0 ? (withFollowup / leads) * 100 : 0, 0) },
          { label: 'Overdue Follow-ups', value: formatCount(sumBy(rows, (r) => r.overdue_followups)), invertDelta: true },
        ];
      }}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: nameOf(r.assigned_to) }));
        return (
          <>
            <ReportPanel title="Follow-up compliance by owner">
              <BarChart
                data={data}
                categoryKey="label"
                series={[{ dataKey: 'compliance_rate', label: 'Compliance rate' }]}
                valueFormatter={(v) => formatPercent(v, 0)}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Compliance details">
              <ReportTable
                caption="Follow-up compliance"
                rows={data}
                columns={[
                  { key: 'label', header: 'Owner' },
                  { key: 'total_leads', header: 'Leads', align: 'right', cell: (r) => formatCount(r.total_leads) },
                  { key: 'leads_with_followup', header: 'With follow-up', align: 'right', cell: (r) => formatCount(r.leads_with_followup) },
                  { key: 'compliance_rate', header: 'Compliance', align: 'right', cell: (r) => formatPercent(r.compliance_rate, 0) },
                  { key: 'overdue_followups', header: 'Overdue', align: 'right', cell: (r) => formatCount(r.overdue_followups) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

function HotLeadsTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<HotLeadRow>
      reportId="hot_leads"
      emptyMessage="There are no hot leads right now."
      kpis={(rows) => [
        { label: 'Hot Leads', value: formatCount(rows.length) },
        { label: 'Combined Budget', value: formatReportCurrency(sumBy(rows, (r) => r.budget)) },
        { label: 'Avg Age', value: `${formatDecimal(rows.length ? sumBy(rows, (r) => r.age_days) / rows.length : 0)} days` },
      ]}
    >
      {(rows) => (
        <ReportPanel title="Hot leads">
          <ReportTable
            caption="Hot leads"
            rows={rows}
            columns={[
              { key: 'title', header: 'Lead' },
              { key: 'destination', header: 'Destination', cell: (r) => formatDestinations(r.destination) },
              { key: 'status', header: 'Stage', cell: (r) => humanize(r.status) },
              { key: 'assigned_to', header: 'Owner', cell: (r) => nameOf(r.assigned_to) },
              { key: 'budget', header: 'Budget', align: 'right', cell: (r) => (r.budget ? formatReportMoney(r.budget) : '—') },
              { key: 'created_at', header: 'Created', cell: (r) => formatDisplayDate(r.created_at) },
              { key: 'age_days', header: 'Age (days)', align: 'right', cell: (r) => formatCount(r.age_days) },
            ]}
          />
        </ReportPanel>
      )}
    </ReportSection>
  );
}

function LostTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<LostRow>
      reportId="lost_analysis"
      emptyMessage="No leads were lost in this period."
      kpis={(rows) => [
        { label: 'Lost Leads', value: formatCount(sumBy(rows, (r) => r.count)) },
        { label: 'Lost Value', value: formatReportCurrency(sumBy(rows, (r) => r.lost_value)) },
        { label: 'Distinct Reasons', value: formatCount(new Set(rows.map((r) => r.lost_reason ?? '')).size) },
      ]}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: r.lost_reason ?? 'No reason recorded' }));
        return (
          <ReportPanelGrid>
            <ReportPanel title="Lost reasons">
              <PieChart data={data} dataKey="count" nameKey="label" donut />
            </ReportPanel>
            <ReportPanel title="Lost deal details">
              <ReportTable
                caption="Lost deals"
                rows={data}
                columns={[
                  { key: 'label', header: 'Reason' },
                  { key: 'assigned_to', header: 'Owner', cell: (r) => nameOf(r.assigned_to) },
                  { key: 'count', header: 'Leads', align: 'right', cell: (r) => formatCount(r.count) },
                  { key: 'lost_value', header: 'Lost value', align: 'right', cell: (r) => formatReportMoney(r.lost_value) },
                ]}
              />
            </ReportPanel>
          </ReportPanelGrid>
        );
      }}
    </ReportSection>
  );
}

function VelocityTab() {
  return (
    <ReportSection<VelocityRow> reportId="lead_velocity">
      {(rows) => {
        const data = [...rows]
          .sort((a, b) => a.month.localeCompare(b.month))
          .map((r) => ({ ...r, label: formatMonthKey(r.month) }));
        return (
          <>
            <ReportPanel title="New leads and won leads by month">
              <AreaChart
                data={data}
                categoryKey="label"
                series={[
                  { dataKey: 'new_leads', label: 'New leads' },
                  { dataKey: 'qualified_won_leads', label: 'Won leads' },
                ]}
              />
            </ReportPanel>
            <ReportPanel title="Lead velocity">
              <ReportTable
                caption="Lead velocity"
                rows={[...data].reverse()}
                columns={[
                  { key: 'label', header: 'Month' },
                  { key: 'new_leads', header: 'New leads', align: 'right', cell: (r) => formatCount(r.new_leads) },
                  { key: 'qualified_won_leads', header: 'Won leads', align: 'right', cell: (r) => formatCount(r.qualified_won_leads) },
                  { key: 'avg_days_to_close', header: 'Avg days to close', align: 'right', cell: (r) => formatDecimal(r.avg_days_to_close) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

export default function LeadReportsPage() {
  return (
    <ReportPageTemplate
      title="Lead Reports"
      description="Pipeline health, ageing, sources and follow-up discipline"
      showCompare
      renderExport={(ctx) => (
        <ReportExportButton
          reportId="pipeline_summary"
          params={ctx.params}
          filenamePrefix="lead-report"
          rangeLabel={ctx.rangeLabel}
        />
      )}
    >
      <Tabs defaultValue="pipeline" className="w-full">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="ageing">Ageing</TabsTrigger>
          <TabsTrigger value="source">Source</TabsTrigger>
          <TabsTrigger value="response">Response</TabsTrigger>
          <TabsTrigger value="followup">Follow-up</TabsTrigger>
          <TabsTrigger value="hotleads">Hot Leads</TabsTrigger>
          <TabsTrigger value="lost">Lost</TabsTrigger>
          <TabsTrigger value="velocity">Velocity</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline"><PipelineTab /></TabsContent>
        <TabsContent value="ageing"><AgeingTab /></TabsContent>
        <TabsContent value="source"><SourceTab /></TabsContent>
        <TabsContent value="response"><ResponseTab /></TabsContent>
        <TabsContent value="followup"><FollowupTab /></TabsContent>
        <TabsContent value="hotleads"><HotLeadsTab /></TabsContent>
        <TabsContent value="lost"><LostTab /></TabsContent>
        <TabsContent value="velocity"><VelocityTab /></TabsContent>
      </Tabs>
    </ReportPageTemplate>
  );
}
