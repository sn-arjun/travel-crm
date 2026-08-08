// Archetypes — every feature screen is one of these
export { ListPage } from './list-page';
export type { ListPageProps, ListFilter, BulkAction } from './list-page';
export { EntityForm, FormRow } from './entity-form';
export type { EntityFormProps, FormSection, FormRowProps } from './entity-form';
export { DetailPage } from './detail-page';
export type { DetailPageProps, DetailAction, RelatedList } from './detail-page';
export { RelationCombobox } from './relation-combobox';
export type { RelationComboboxProps, RelationPage } from './relation-combobox';
export { StatCard } from './stat-card';
export { PipelineCard } from './pipeline-card';
export { KanbanBoard } from './kanban-board';
export { ActivityTimeline } from './activity-timeline';
// Legacy table — kept for existing pages. New work uses DataTable from '@/components/ui'.
export { DataTable as LegacyDataTable } from './data-table';
export type { Column as LegacyColumn } from './data-table';
export { FilterBar } from './filter-bar';
export { FileUpload } from './file-upload';
