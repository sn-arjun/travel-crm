import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/report_providers.dart';
import '../../data/models/report_state.dart';
import '../widgets/report_data_table.dart';

class ReportScreenTemplate extends ConsumerStatefulWidget {
  final String reportId;
  final String title;
  final Widget Function(BuildContext context, ReportResult data) chartBuilder;
  final List<ReportColumnDef>? tableColumnsOverride;

  const ReportScreenTemplate({
    super.key,
    required this.reportId,
    required this.title,
    required this.chartBuilder,
    this.tableColumnsOverride,
  });

  @override
  ConsumerState<ReportScreenTemplate> createState() => _ReportScreenTemplateState();
}

class _ReportScreenTemplateState extends ConsumerState<ReportScreenTemplate> {
  // 0 = Chart view, 1 = Table view
  int _viewMode = 0; 
  bool _isComparing = false;

  void _showDateFilterSheet() {
    // A simplified bottom sheet to pick date preset
    showModalBottomSheet(
      context: context,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: const Text('This Week'),
                onTap: () {
                  ref.read(reportFilterProvider.notifier).update((state) => {...state, 'date_preset': 'this_week'});
                  Navigator.pop(ctx);
                },
              ),
              ListTile(
                title: const Text('This Month'),
                onTap: () {
                  ref.read(reportFilterProvider.notifier).update((state) => {...state, 'date_preset': 'this_month'});
                  Navigator.pop(ctx);
                },
              ),
              ListTile(
                title: const Text('This Year'),
                onTap: () {
                  ref.read(reportFilterProvider.notifier).update((state) => {...state, 'date_preset': 'this_year'});
                  Navigator.pop(ctx);
                },
              ),
              // Add more as needed...
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final reportAsync = ref.watch(reportResultProvider(widget.reportId));
    final filters = ref.watch(reportFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.download),
            tooltip: 'Export Report',
            onSelected: (format) async {
              try {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Starting $format export...')),
                );
                await ref.read(reportRepositoryProvider).exportReport(
                  widget.reportId,
                  filters,
                  format,
                );
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('$format export completed! Check your downloads.')),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Export failed: $e')),
                  );
                }
              }
            },
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'excel',
                child: Text('Download as Excel'),
              ),
              const PopupMenuItem(
                value: 'pdf',
                child: Text('Download as PDF'),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: Theme.of(context).colorScheme.surface,
            child: Row(
              children: [
                ActionChip(
                  avatar: const Icon(Icons.calendar_today, size: 16),
                  label: Text(filters['date_preset']?.replaceAll('_', ' ').toUpperCase() ?? 'DATE LTM'),
                  onPressed: _showDateFilterSheet,
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: const Text('Compare'),
                  selected: _isComparing,
                  onSelected: (val) {
                    setState(() => _isComparing = val);
                    ref.read(reportFilterProvider.notifier).update((state) => {
                      ...state,
                      'compare': val ? 'true' : '',
                    });
                  },
                ),
                const Spacer(),
                SegmentedButton<int>(
                  segments: const [
                    ButtonSegment(value: 0, icon: Icon(Icons.bar_chart)),
                    ButtonSegment(value: 1, icon: Icon(Icons.table_chart)),
                  ],
                  selected: {_viewMode},
                  onSelectionChanged: (val) {
                    setState(() => _viewMode = val.first);
                  },
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          
          // Content Area
          Expanded(
            child: reportAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, stack) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 48, color: Colors.red),
                      const SizedBox(height: 16),
                      Text('Error loading report', style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 8),
                      Text(err.toString(), textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: () => ref.invalidate(reportResultProvider(widget.reportId)),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
              data: (result) {
                if (result.data.isEmpty) {
                  return const Center(child: Text('No data found for the selected period.'));
                }

                // If period comparison exists and it's a summary row, show KPI cards here
                // We'll leave this to individual screens or abstract later, keeping template simple for now.

                if (_viewMode == 0) {
                  // Chart View
                  return Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: widget.chartBuilder(context, result),
                  );
                } else {
                  // Table View
                  final tableCols = widget.tableColumnsOverride ?? result.columns;
                  return Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: ReportDataTable(
                      columns: tableCols,
                      data: result.data,
                      previousPeriodData: result.previousPeriod,
                      groupByColumn: filters['group_by']?.toString(),
                      onDrillDown: (columnKey, row) {
                        final colDef = tableCols.firstWhere((c) => c.name == columnKey);
                        if (colDef.drillDown != null) {
                          final config = colDef.drillDown!;
                          Map<String, String> queryParams = {};
                          config.paramsMapping.forEach((targetParam, sourceCol) {
                            queryParams[targetParam] = row[sourceCol]?.toString() ?? '';
                          });
                          final uri = Uri(path: '/reports/${config.reportId}', queryParameters: queryParams);
                          context.push(uri.toString());
                        }
                      },
                    ),
                  );
                }
              },
            ),
          ),
        ],
      ),
    );
  }
}
