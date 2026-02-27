import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/theme.dart';
import '../../../../core/widgets/data/app_data_table.dart';
import '../../../../core/widgets/forms/app_dropdown.dart';
import '../../data/models/visa_application.dart';
import '../providers/visa_provider.dart';

class VisaListScreen extends ConsumerWidget {
  const VisaListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(visaListProvider);
    final notifier = ref.read(visaListProvider.notifier);

    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Visa Applications', style: Theme.of(context).textTheme.headlineMedium),
                ElevatedButton(
                  onPressed: () => context.go('/visas/new'),
                  child: const Text('New Application'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppTheme.spacingLg),
            child: Row(
              children: [
                SizedBox(
                  width: 250,
                  child: AppDropdown<String?>(
                    label: 'Filter by Status',
                    value: state.statusFilter,
                    displayStringFor: (s) => s?.toUpperCase().replaceAll('_', ' ') ?? 'ALL',
                    items: [null, ...VisaStatus.values.map((s) => s.name)],
                    onChanged: (v) => notifier.setFilter(v),
                  ),
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed: () => context.go('/visas/dashboard'),
                  icon: const Icon(Icons.dashboard_outlined),
                  label: const Text('View Pipeline'),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Expanded(
            child: (state.isLoading && state.visas.isEmpty)
              ? const Center(child: CircularProgressIndicator())
              : AppDataTable<VisaApplication>(
              rows: state.visas,
              columns: [
                AppDataColumn(
                  title: 'Application No.',
                  field: 'id',
                  cellBuilder: (value) {
                    final visa = value as VisaApplication;
                    return InkWell(
                      onTap: () => context.go('/visas/${visa.id}'),
                      child: Text(
                        visa.applicationNumber ?? 'VISA-${visa.id.substring(0, 6).toUpperCase()}',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
                      ),
                    );
                  }
                ),
                AppDataColumn(
                  title: 'Destination / Type',
                  field: 'type',
                  cellBuilder: (value) {
                    final visa = value as VisaApplication;
                    return Text('${visa.destinationCountry}\n${visa.visaType.name.toUpperCase()}');
                  }
                ),
                AppDataColumn(
                  title: 'Traveller',
                  field: 'traveller',
                  cellBuilder: (value) {
                    final visa = value as VisaApplication;
                    return Text(visa.travellerId);
                  }
                ),
                AppDataColumn(
                  title: 'Status',
                  field: 'status',
                  cellBuilder: (value) {
                    final visa = value as VisaApplication;
                    return _StatusBadge(status: visa.status);
                  }
                ),
                AppDataColumn(
                  title: 'Actions',
                  field: 'actions',
                  cellBuilder: (value) {
                    final visa = value as VisaApplication;
                    return IconButton(
                      icon: const Icon(Icons.edit, size: 20),
                      color: AppTheme.primaryColor,
                      onPressed: () => context.go('/visas/${visa.id}/edit'),
                    );
                  }
                ),
              ],
              rowValueFor: (visa, field) => visa,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final VisaStatus status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      VisaStatus.notStarted => Colors.grey,
      VisaStatus.documentsCollecting => Colors.orange,
      VisaStatus.applied => Colors.blue,
      VisaStatus.processing => Colors.purple,
      VisaStatus.approved => Colors.green,
      VisaStatus.rejected => Colors.red,
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        status.name.toUpperCase().replaceAll('_', ' '),
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold),
      ),
    );
  }
}
