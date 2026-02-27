import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/theme.dart';
import '../../../../core/widgets/data/app_data_table.dart';
import '../../data/models/traveller.dart';
import '../providers/traveller_provider.dart';

class TravellerListScreen extends ConsumerWidget {
  const TravellerListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(travellerListProvider);

    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Travellers', style: Theme.of(context).textTheme.headlineMedium),
                ElevatedButton(
                  onPressed: () => context.go('/travellers/new'),
                  child: const Text('Add Traveller'),
                ),
              ],
            ),
          ),
          Expanded(
            child: (state.isLoading && state.travellers.isEmpty)
              ? const Center(child: CircularProgressIndicator())
              : AppDataTable<Traveller>(
              rows: state.travellers,
              columns: [
                AppDataColumn(
                  title: 'Name',
                  field: 'name',
                  cellBuilder: (value) {
                    final traveller = value as Traveller;
                    return InkWell(
                      onTap: () => context.go('/travellers/${traveller.id}'),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            '${traveller.firstName} ${traveller.lastName}',
                            style: const TextStyle(fontWeight: FontWeight.w500, color: AppTheme.primaryColor),
                          ),
                          if (traveller.passportNumber != null)
                            Text(
                              'PP: ${traveller.passportNumber}',
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppTheme.colorGrey500),
                            ),
                        ],
                      ),
                    );
                  }
                ),
                AppDataColumn(
                  title: 'Passport / Nationality',
                  field: 'nationality',
                  cellBuilder: (value) {
                    final traveller = value as Traveller;
                    return Text(traveller.nationality ?? '-');
                  }
                ),
                AppDataColumn(
                  title: 'Contact Details',
                  field: 'contact',
                  cellBuilder: (value) {
                    final traveller = value as Traveller;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                         if (traveller.emergencyContactPhone != null)
                            Text('Emerg: ${traveller.emergencyContactPhone}'),
                         if (traveller.emergencyContactPhone == null && traveller.contactId != null)
                            const Text('Linked to Contact', style: TextStyle(color: AppTheme.successColor, fontSize: 12)),
                      ],
                    );
                  }
                ),
                AppDataColumn(
                  title: 'Actions',
                  field: 'actions',
                  cellBuilder: (value) {
                    final traveller = value as Traveller;
                    return Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit, size: 20),
                          color: AppTheme.primaryColor,
                          onPressed: () => context.go('/travellers/${traveller.id}/edit'),
                        ),
                      ],
                    );
                  }
                ),
              ],
              rowValueFor: (traveller, field) => traveller,
            ),
          ),
        ],
      ),
    );
  }
}
