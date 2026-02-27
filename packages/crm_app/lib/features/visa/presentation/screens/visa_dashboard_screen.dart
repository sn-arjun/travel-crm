import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/theme.dart';
import '../../data/models/visa_application.dart';
import '../providers/visa_provider.dart';

class VisaDashboardScreen extends ConsumerWidget {
  const VisaDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(visaListProvider);

    if (state.isLoading && state.visas.isEmpty) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    // Group visas by status
    final groupedVisas = <VisaStatus, List<VisaApplication>>{};
    for (var status in VisaStatus.values) {
      groupedVisas[status] = [];
    }
    
    for (var visa in state.visas) {
      groupedVisas[visa.status]?.add(visa);
    }

    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => context.pop()),
                const SizedBox(width: 8),
                Text('Visa Pipeline', style: Theme.of(context).textTheme.headlineMedium),
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.all(24.0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: VisaStatus.values.map((status) => 
                  _buildKanbanColumn(context, status, groupedVisas[status]!)
                ).toList(),
              ),
            ),
          )
        ],
      ),
    );
  }

  Widget _buildKanbanColumn(BuildContext context, VisaStatus status, List<VisaApplication> visas) {
    return Container(
      width: 300,
      margin: const EdgeInsets.only(right: AppTheme.spacingLg),
      decoration: BoxDecoration(
        color: AppTheme.surfaceLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.colorGrey200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(16.0),
            decoration: BoxDecoration(
              color: _getStatusColor(status).withValues(alpha: 0.1),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  status.name.toUpperCase().replaceAll('_', ' '),
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: _getStatusColor(status)
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: _getStatusColor(status).withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text('${visas.length}', style: TextStyle(color: _getStatusColor(status), fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(AppTheme.spacingSm),
              itemCount: visas.length,
              itemBuilder: (context, index) {
                final visa = visas[index];
                return _VisaCard(visa: visa);
              },
            ),
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(VisaStatus status) {
    return switch (status) {
      VisaStatus.notStarted => Colors.grey,
      VisaStatus.documentsCollecting => Colors.orange,
      VisaStatus.applied => Colors.blue,
      VisaStatus.processing => Colors.purple,
      VisaStatus.approved => Colors.green,
      VisaStatus.rejected => Colors.red,
    };
  }
}

class _VisaCard extends StatelessWidget {
  final VisaApplication visa;

  const _VisaCard({required this.visa});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      margin: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: InkWell(
        onTap: () => context.go('/visas/${visa.id}'),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                visa.destinationCountry,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              const SizedBox(height: 4),
              Text(
                visa.applicationNumber ?? 'VISA-${visa.id.substring(0, 6).toUpperCase()}',
                style: TextStyle(color: AppTheme.colorGrey500, fontSize: 12),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(visa.visaType.name.toUpperCase(), style: const TextStyle(fontSize: 10, color: AppTheme.primaryColor)),
                  ),
                  if (visa.expectedDate != null)
                    Row(
                       children: [
                         const Icon(Icons.flight_takeoff, size: 12, color: AppTheme.colorGrey500),
                         const SizedBox(width: 4),
                         Text(visa.expectedDate!, style: const TextStyle(fontSize: 10, color: AppTheme.colorGrey500)),
                       ],
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
