import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../app/theme.dart';
import '../providers/traveller_provider.dart';

class TravellerDetailScreen extends ConsumerStatefulWidget {
  final String travellerId;

  const TravellerDetailScreen({super.key, required this.travellerId});

  @override
  ConsumerState<TravellerDetailScreen> createState() => _TravellerDetailScreenState();
}

class _TravellerDetailScreenState extends ConsumerState<TravellerDetailScreen> {
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      // Just ensure the provider is warm, though ideally we'd have a specific detail provider
      // For now, we rely on the list or fetch it directly.
      await ref.read(travellerListProvider.notifier).loadTravellers();
      if (mounted) setState(() => _isLoading = false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (_error != null) return Scaffold(body: Center(child: Text('Error: $_error')));

    final travellers = ref.watch(travellerListProvider).travellers;
    final traveller = travellers.cast().firstWhere((t) => t.id == widget.travellerId, orElse: () => null);

    if (traveller == null) {
      return const Scaffold(body: Center(child: Text('Traveller not found')));
    }

    return Scaffold(
      body: SingleChildScrollView(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => context.pop()),
                      const SizedBox(width: 8),
                      Text('${traveller.firstName} ${traveller.lastName}', style: Theme.of(context).textTheme.headlineMedium),
                    ],
                  ),
                  ElevatedButton(
                    onPressed: () => context.go('/travellers/${traveller.id}/edit'),
                    child: const Text('Edit'),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24.0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 2,
                    child: Column(
                      children: [
                        _buildSection(
                          'Personal Details',
                          [
                            _DetailRow('Full Name (Passport)', traveller.fullNamePassport),
                            _DetailRow('Date of Birth', traveller.dateOfBirth ?? '-'),
                            _DetailRow('Gender', traveller.gender ?? '-'),
                            _DetailRow('Nationality', traveller.nationality ?? '-'),
                          ],
                        ),
                        const SizedBox(height: AppTheme.spacingLg),
                        _buildSection(
                          'Passport Information',
                          [
                            _DetailRow('Passport Number', traveller.passportNumber ?? '-'),
                            _DetailRow('Issuing Country', traveller.passportIssuingCountry ?? '-'),
                            _DetailRow('Issue Date', traveller.passportIssueDate ?? '-'),
                            _DetailRow('Expiry Date', traveller.passportExpiryDate ?? '-'),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppTheme.spacingLg),
                  Expanded(
                    flex: 1,
                    child: Column(
                      children: [
                        _buildSection(
                          'Preferences & Notes',
                          [
                            _DetailRow('Meal', traveller.mealPreference ?? '-'),
                            _DetailRow('Seat', traveller.seatPreference ?? '-'),
                            _DetailRow('Room', traveller.roomPreference ?? '-'),
                            _DetailRow('Frequent Flyer', traveller.frequentFlyerNumbers ?? '-'),
                            const SizedBox(height: 8),
                            const Text('Medical Notes:', style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.colorGrey500)),
                            Text(traveller.medicalNotes?.isNotEmpty == true ? traveller.medicalNotes! : '-'),
                          ],
                        ),
                        const SizedBox(height: AppTheme.spacingLg),
                        _buildSection(
                          'Emergency Contact',
                          [
                            _DetailRow('Name', traveller.emergencyContactName ?? '-'),
                            _DetailRow('Phone', traveller.emergencyContactPhone ?? '-'),
                            _DetailRow('Relation', traveller.emergencyContactRelationship ?? '-'),
                          ],
                        ),
                        const SizedBox(height: AppTheme.spacingLg),
                        _buildSection(
                          'System Info',
                          [
                            _DetailRow('Linked Contact', traveller.contactId != null ? 'Yes' : 'No'),
                            _DetailRow('Added On', traveller.createdAt != null ? DateFormat.yMMMd().format(traveller.createdAt!) : '-'),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(String title, List<Widget> children) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const Divider(),
            const SizedBox(height: AppTheme.spacingMd),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;

  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(label, style: const TextStyle(color: AppTheme.colorGrey500)),
          ),
          Expanded(
            child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}
