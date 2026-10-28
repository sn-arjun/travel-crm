'use client';

import * as React from 'react';

import { BarChart, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { ReportPageTemplate } from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  ReportPanel,
  ReportPanelGrid,
  ReportSection,
  ReportTable,
  formatCount,
  formatDecimal,
  formatMonthKey,
  formatPercent,
  formatReportCurrency,
  formatReportMoney,
  humanize,
  sumBy,
  useUserNames,
} from '@/components/domain/reports/shared';

interface TeamRow {
  team_member: string;
  department: string | null;
  total_leads: number;
  won_deals: number;
  lost_deals: number;
  total_revenue: number;
  completed_tasks: number;
  conversion_rate: number;
}

interface IndividualRow {
  assigned_to: string | null;
  month: string;
  total_leads: number;
  won_deals: number;
  revenue: number;
  conversion_rate: number;
  avg_days_to_close: number;
}

interface ResponseRow {
  assigned_to: string | null;
  total_leads: number;
  avg_response_hours: number;
}

interface ActivityRow {
  team_member: string | null;
  type: string;
  activity_count: number;
}

interface TaskRow {
  assigned_to: string | null;
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  overdue_tasks: number;
  completion_rate: number;
}

function OverviewTab() {
  return (
    <ReportSection<TeamRow>
      reportId="team_dashboard"
      kpis={(rows) => [
        { label: 'Total Leads', value: formatCount(sumBy(rows, (r) => r.total_leads)) },
        { label: 'Deals Won', value: formatCount(sumBy(rows, (r) => r.won_deals)) },
        { label: 'Total Revenue', value: formatReportCurrency(sumBy(rows, (r) => r.total_revenue)) },
        { label: 'Team Members', value: formatCount(rows.length) },
      ]}
    >
      {(rows) => {
        const ranked = [...rows].sort((a, b) => b.total_revenue - a.total_revenue);
        return (
          <>
            <ReportPanel title="Revenue by team member">
              <BarChart
                data={ranked}
                categoryKey="team_member"
                series={[{ dataKey: 'total_revenue', label: 'Revenue' }]}
                valueFormatter={(v) => formatReportCurrency(v)}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Team leaderboard">
              <ReportTable
                caption="Team leaderboard"
                rows={ranked}
                columns={[
                  { key: 'team_member', header: 'Team member' },
                  { key: 'department', header: 'Department' },
                  { key: 'total_leads', header: 'Leads', align: 'right', cell: (r) => formatCount(r.total_leads) },
                  { key: 'won_deals', header: 'Won', align: 'right', cell: (r) => formatCount(r.won_deals) },
                  { key: 'lost_deals', header: 'Lost', align: 'right', cell: (r) => formatCount(r.lost_deals) },
                  { key: 'total_revenue', header: 'Revenue', align: 'right', cell: (r) => formatReportMoney(r.total_revenue) },
                  { key: 'completed_tasks', header: 'Tasks done', align: 'right', cell: (r) => formatCount(r.completed_tasks) },
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

function IndividualTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<IndividualRow> reportId="individual_performance">
      {(rows) => {
        const data = rows.map((r) => ({ ...r, owner: nameOf(r.assigned_to), label: formatMonthKey(r.month) }));
        // One bar group per month, one series per person would need pivoting; chart revenue per person instead.
        const byPerson = new Map<string, { owner: string; revenue: number; won_deals: number }>();
        for (const r of data) {
          const cur = byPerson.get(r.owner) ?? { owner: r.owner, revenue: 0, won_deals: 0 };
          cur.revenue += r.revenue;
          cur.won_deals += r.won_deals;
          byPerson.set(r.owner, cur);
        }
        return (
          <>
            <ReportPanel title="Revenue by person">
              <BarChart
                data={[...byPerson.values()]}
                categoryKey="owner"
                series={[{ dataKey: 'revenue', label: 'Revenue' }]}
                valueFormatter={(v) => formatReportCurrency(v)}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Performance by month">
              <ReportTable
                caption="Individual performance by month"
                rows={data}
                columns={[
                  { key: 'owner', header: 'Team member' },
                  { key: 'label', header: 'Month' },
                  { key: 'total_leads', header: 'Leads', align: 'right', cell: (r) => formatCount(r.total_leads) },
                  { key: 'won_deals', header: 'Won', align: 'right', cell: (r) => formatCount(r.won_deals) },
                  { key: 'revenue', header: 'Revenue', align: 'right', cell: (r) => formatReportMoney(r.revenue) },
                  { key: 'conversion_rate', header: 'Conversion', align: 'right', cell: (r) => formatPercent(r.conversion_rate) },
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

function ResponseTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<ResponseRow> reportId="response_time_by_user">
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: nameOf(r.assigned_to) }));
        return (
          <ReportPanelGrid>
            <ReportPanel title="Average response time (hours)">
              <BarChart
                data={data}
                categoryKey="label"
                series={[{ dataKey: 'avg_response_hours', label: 'Hours' }]}
                valueFormatter={(v) => formatDecimal(v)}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Response time details">
              <ReportTable
                caption="Response time by user"
                rows={data}
                columns={[
                  { key: 'label', header: 'Team member' },
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

function ActivityTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<ActivityRow>
      reportId="activity_report"
      kpis={(rows) => [
        { label: 'Activities', value: formatCount(sumBy(rows, (r) => r.activity_count)) },
        { label: 'Active Members', value: formatCount(new Set(rows.map((r) => r.team_member ?? '')).size) },
        { label: 'Activity Types', value: formatCount(new Set(rows.map((r) => r.type)).size) },
      ]}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, owner: nameOf(r.team_member), label: humanize(r.type) }));
        const byPerson = new Map<string, { owner: string; activity_count: number }>();
        for (const r of data) {
          const cur = byPerson.get(r.owner) ?? { owner: r.owner, activity_count: 0 };
          cur.activity_count += r.activity_count;
          byPerson.set(r.owner, cur);
        }
        return (
          <>
            <ReportPanel title="Activities by team member">
              <BarChart
                data={[...byPerson.values()]}
                categoryKey="owner"
                series={[{ dataKey: 'activity_count', label: 'Activities' }]}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Activity details">
              <ReportTable
                caption="Activity report"
                rows={data}
                columns={[
                  { key: 'owner', header: 'Team member' },
                  { key: 'label', header: 'Activity type' },
                  { key: 'activity_count', header: 'Count', align: 'right', cell: (r) => formatCount(r.activity_count) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

function TasksTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<TaskRow>
      reportId="task_completion"
      kpis={(rows) => {
        const total = sumBy(rows, (r) => r.total_tasks);
        return [
          { label: 'Tasks', value: formatCount(total) },
          { label: 'Completed', value: formatCount(sumBy(rows, (r) => r.completed_tasks)) },
          { label: 'Overdue', value: formatCount(sumBy(rows, (r) => r.overdue_tasks)) },
          { label: 'Completion Rate', value: formatPercent(total > 0 ? (sumBy(rows, (r) => r.completed_tasks) / total) * 100 : 0, 0) },
        ];
      }}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: nameOf(r.assigned_to) }));
        return (
          <>
            <ReportPanel title="Task status by team member">
              <BarChart
                data={data}
                categoryKey="label"
                stacked
                series={[
                  { dataKey: 'completed_tasks', label: 'Completed' },
                  { dataKey: 'pending_tasks', label: 'Pending' },
                  { dataKey: 'overdue_tasks', label: 'Overdue' },
                ]}
              />
            </ReportPanel>
            <ReportPanel title="Task completion details">
              <ReportTable
                caption="Task completion"
                rows={data}
                columns={[
                  { key: 'label', header: 'Team member' },
                  { key: 'total_tasks', header: 'Tasks', align: 'right', cell: (r) => formatCount(r.total_tasks) },
                  { key: 'completed_tasks', header: 'Completed', align: 'right', cell: (r) => formatCount(r.completed_tasks) },
                  { key: 'pending_tasks', header: 'Pending', align: 'right', cell: (r) => formatCount(r.pending_tasks) },
                  { key: 'overdue_tasks', header: 'Overdue', align: 'right', cell: (r) => formatCount(r.overdue_tasks) },
                  { key: 'completion_rate', header: 'Completion', align: 'right', cell: (r) => formatPercent(r.completion_rate, 0) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

export default function TeamReportsPage() {
  return (
    <ReportPageTemplate
      title="Team Performance Reports"
      description="How each team member is doing on leads, deals, response time and tasks"
      renderExport={(ctx) => (
        <ReportExportButton
          reportId="team_dashboard"
          params={ctx.params}
          filenamePrefix="team-report"
          rangeLabel={ctx.rangeLabel}
        />
      )}
    >
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="dashboard">Overview</TabsTrigger>
          <TabsTrigger value="individual">Individual Performance</TabsTrigger>
          <TabsTrigger value="response">Response Time</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="tasks">Task Completion</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><OverviewTab /></TabsContent>
        <TabsContent value="individual"><IndividualTab /></TabsContent>
        <TabsContent value="response"><ResponseTab /></TabsContent>
        <TabsContent value="activity"><ActivityTab /></TabsContent>
        <TabsContent value="tasks"><TasksTab /></TabsContent>
      </Tabs>
    </ReportPageTemplate>
  );
}
