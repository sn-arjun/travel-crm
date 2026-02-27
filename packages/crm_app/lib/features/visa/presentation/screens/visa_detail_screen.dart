import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../app/theme.dart';
import '../../../../core/widgets/forms/app_text_field.dart';
import '../../data/models/visa_application.dart';
import '../../data/models/visa_checklist_item.dart';
import '../providers/visa_provider.dart';

class VisaDetailScreen extends ConsumerStatefulWidget {
  final String visaId;

  const VisaDetailScreen({super.key, required this.visaId});

  @override
  ConsumerState<VisaDetailScreen> createState() => _VisaDetailScreenState();
}

class _VisaDetailScreenState extends ConsumerState<VisaDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(visaDetailProvider(widget.visaId));

    if (state.isLoading && state.visa == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (state.error != null && state.visa == null) {
      return Scaffold(body: Center(child: Text('Error: ${state.error}')));
    }

    final visa = state.visa!;

    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
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
                    Text('Visa Application: ${visa.destinationCountry}', style: Theme.of(context).textTheme.headlineMedium),
                  ],
                ),
                ElevatedButton(
                  onPressed: () => context.go('/visas/${visa.id}/edit'),
                  child: const Text('Edit'),
                ),
              ],
            ),
          ),
          
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppTheme.spacingLg),
            child: Row(
              children: [
                 Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppTheme.primaryColor.withValues(alpha: 0.5)),
                    ),
                    child: Text(
                      visa.status.name.toUpperCase().replaceAll('_', ' '),
                      style: const TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.bold),
                    ),
                 ),
                 const SizedBox(width: AppTheme.spacingMd),
                 Text('Type: ${visa.visaType.name.toUpperCase()}'),
                 const SizedBox(width: AppTheme.spacingMd),
                 Text('Traveller: ${visa.travellerId}'),
              ],
            ),
          ),
          
          const SizedBox(height: AppTheme.spacingLg),
          TabBar(
            controller: _tabController,
            labelColor: AppTheme.primaryColor,
            unselectedLabelColor: AppTheme.colorGrey500,
            indicatorColor: AppTheme.primaryColor,
            tabs: const [
              Tab(text: 'Overview'),
              Tab(text: 'Document Checklist'),
              Tab(text: 'Internal Notes'),
            ],
          ),
          
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildOverviewTab(visa),
                _buildChecklistTab(state.checklist),
                _buildNotesTab(state.notes),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOverviewTab(VisaApplication visa) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              children: [
                _buildInfoSection('Application Details', [
                  _InfoRow('Destination', visa.destinationCountry),
                  _InfoRow('Visa Type', visa.visaType.name.toUpperCase()),
                  _InfoRow('Entry Type', visa.visaEntryType?.name.toUpperCase() ?? '-'),
                  _InfoRow('Application No.', visa.applicationNumber ?? '-'),
                  _InfoRow('Embassy', visa.embassyName ?? '-'),
                ]),
                const SizedBox(height: AppTheme.spacingLg),
                if (visa.visaNumber != null)
                  _buildInfoSection('Issued Visa', [
                    _InfoRow('Visa Number', visa.visaNumber ?? '-'),
                    _InfoRow('Issue Date', visa.visaIssueDate ?? '-'),
                    _InfoRow('Expiry Date', visa.visaExpiryDate ?? '-'),
                  ]),
              ],
            ),
          ),
          const SizedBox(width: AppTheme.spacingLg),
          Expanded(
            child: Column(
              children: [
                _buildInfoSection('Timeline', [
                  _InfoRow('Expected Travel Date', visa.expectedDate ?? '-'),
                  _InfoRow('Applied Date', visa.appliedDate ?? '-'),
                  _InfoRow('Appointment Date', visa.appointmentDate ?? '-'),
                  if (visa.approvedDate != null) _InfoRow('Approved Date', visa.approvedDate!),
                  if (visa.rejectedDate != null) _InfoRow('Rejected Date', visa.rejectedDate!),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoSection(String title, List<Widget> children) {
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

  Widget _buildChecklistTab(List<VisaChecklistItem> checklist) {
    if (checklist.isEmpty) {
      return const Center(child: Text('No checklist items found. Check configuration.'));
    }

    return ListView.builder(
      padding: const EdgeInsets.all(24.0),
      itemCount: checklist.length,
      itemBuilder: (context, index) {
        final item = checklist[index];
        return Card(
          elevation: 0,
          margin: const EdgeInsets.only(bottom: AppTheme.spacingMd),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: BorderSide(
              color: item.isReceived ? AppTheme.successColor.withValues(alpha: 0.5) : AppTheme.colorGrey200,
            ),
          ),
           child: CheckboxListTile(
            title: Text(item.documentName, style: TextStyle(
              fontWeight: FontWeight.bold,
              decoration: item.isReceived ? TextDecoration.lineThrough : null,
            )),
            subtitle: item.description != null ? Text(item.description!) : null,
            value: item.isReceived,
            activeColor: AppTheme.successColor,
            onChanged: (bool? val) {
              if (val != null) {
                ref.read(visaDetailProvider(widget.visaId).notifier).updateChecklistItem(item.id, val);
              }
            },
            secondary: item.isRequired ? const Icon(Icons.star, color: Colors.amber, size: 16) : null,
          ),
        );
      },
    );
  }

  Widget _buildNotesTab(List<VisaNote> notes) {
    final noteController = TextEditingController();

    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: AppTextField(
                   controller: noteController,
                   label: 'Add a new note...',
                ),
              ),
              const SizedBox(width: AppTheme.spacingMd),
              Padding(
                padding: const EdgeInsets.only(top: 24.0),
                child: ElevatedButton.icon(
                  onPressed: () {
                    if (noteController.text.isNotEmpty) {
                      ref.read(visaDetailProvider(widget.visaId).notifier).addNote(noteController.text);
                      noteController.clear();
                    }
                  },
                  icon: const Icon(Icons.send),
                  label: const Text('Post'),
                ),
              )
            ],
          ),
          const SizedBox(height: AppTheme.spacingLg),
          const Divider(),
          const SizedBox(height: AppTheme.spacingLg),
          Expanded(
            child: notes.isEmpty
              ? const Center(child: Text('No internal notes yet.'))
              : ListView.builder(
                  itemCount: notes.length,
                  itemBuilder: (context, index) {
                    final note = notes[index];
                    return Card(
                      margin: const EdgeInsets.only(bottom: AppTheme.spacingMd),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(note.createdBy ?? 'System', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                                Text(
                                  note.createdAt != null ? DateFormat.yMMMd().add_jm().format(note.createdAt!) : '-',
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppTheme.colorGrey500),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppTheme.spacingSm),
                            Text(note.content),
                          ],
                        ),
                      ),
                    );
                  },
                ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  
  const _InfoRow(this.label, this.value);
  
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 140, child: Text(label, style: const TextStyle(color: AppTheme.colorGrey500))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}
