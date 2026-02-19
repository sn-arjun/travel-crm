import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  int _currentStep = 0;

  static const _steps = [
    _StepInfo(title: 'Company Details', icon: Icons.business),
    _StepInfo(title: 'Upload Logo', icon: Icons.image),
    _StepInfo(title: 'Invite Team', icon: Icons.group_add),
    _StepInfo(title: 'Import Contacts', icon: Icons.contacts),
    _StepInfo(title: 'Create First Lead', icon: Icons.leaderboard),
  ];

  void _next() {
    if (_currentStep < _steps.length - 1) {
      setState(() => _currentStep++);
    } else {
      context.go('/dashboard');
    }
  }

  void _previous() {
    if (_currentStep > 0) {
      setState(() => _currentStep--);
    }
  }

  void _skip() {
    context.go('/dashboard');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 700),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                // Header
                const SizedBox(height: 16),
                Icon(Icons.flight_takeoff, size: 36, color: theme.colorScheme.primary),
                const SizedBox(height: 8),
                Text('Set up TravelCRM Pro', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 24),

                // Step indicator
                _StepIndicator(steps: _steps, currentStep: _currentStep),
                const SizedBox(height: 32),

                // Step content
                Expanded(
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: _buildStepContent(theme),
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // Navigation
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _currentStep > 0
                        ? OutlinedButton.icon(
                            onPressed: _previous,
                            icon: const Icon(Icons.arrow_back, size: 16),
                            label: const Text('Back'),
                          )
                        : const SizedBox.shrink(),
                    Row(
                      children: [
                        TextButton(onPressed: _skip, child: const Text('Skip Setup')),
                        const SizedBox(width: 12),
                        FilledButton(
                          onPressed: _next,
                          child: Text(_currentStep == _steps.length - 1 ? 'Finish' : 'Continue'),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStepContent(ThemeData theme) {
    switch (_currentStep) {
      case 0:
        return _CompanyDetailsStep();
      case 1:
        return _LogoUploadStep();
      case 2:
        return _InviteTeamStep();
      case 3:
        return _ImportContactsStep();
      case 4:
        return _CreateLeadStep();
      default:
        return const SizedBox.shrink();
    }
  }
}

class _StepInfo {
  final String title;
  final IconData icon;
  const _StepInfo({required this.title, required this.icon});
}

class _StepIndicator extends StatelessWidget {
  final List<_StepInfo> steps;
  final int currentStep;

  const _StepIndicator({required this.steps, required this.currentStep});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: List.generate(steps.length * 2 - 1, (index) {
        if (index.isOdd) {
          // Connector line
          final stepBefore = index ~/ 2;
          return Expanded(
            child: Container(
              height: 2,
              color: stepBefore < currentStep
                  ? theme.colorScheme.primary
                  : theme.colorScheme.outlineVariant,
            ),
          );
        }

        final stepIndex = index ~/ 2;
        final step = steps[stepIndex];
        final isCompleted = stepIndex < currentStep;
        final isCurrent = stepIndex == currentStep;

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isCompleted || isCurrent
                    ? theme.colorScheme.primary
                    : theme.colorScheme.surfaceContainerHighest,
              ),
              child: Center(
                child: isCompleted
                    ? Icon(Icons.check, size: 18, color: theme.colorScheme.onPrimary)
                    : Icon(step.icon, size: 18, color: isCurrent ? theme.colorScheme.onPrimary : theme.colorScheme.onSurfaceVariant),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              step.title,
              style: theme.textTheme.labelSmall?.copyWith(
                color: isCurrent ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant,
                fontWeight: isCurrent ? FontWeight.w600 : FontWeight.normal,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        );
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Step 1: Company Details
// ---------------------------------------------------------------------------
class _CompanyDetailsStep extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Company Details', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Tell us about your travel business.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: 24),
          const TextField(decoration: InputDecoration(labelText: 'Company Name', border: OutlineInputBorder(), prefixIcon: Icon(Icons.business))),
          const SizedBox(height: 16),
          const TextField(decoration: InputDecoration(labelText: 'Phone', border: OutlineInputBorder(), prefixIcon: Icon(Icons.phone))),
          const SizedBox(height: 16),
          const TextField(decoration: InputDecoration(labelText: 'Website (optional)', border: OutlineInputBorder(), prefixIcon: Icon(Icons.language))),
          const SizedBox(height: 16),
          const TextField(
            maxLines: 3,
            decoration: InputDecoration(labelText: 'Address', border: OutlineInputBorder(), prefixIcon: Icon(Icons.location_on)),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Step 2: Logo Upload
// ---------------------------------------------------------------------------
class _LogoUploadStep extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text('Upload Logo', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Text('Add your company logo for invoices and documents.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 32),
        Container(
          width: 200,
          height: 200,
          decoration: BoxDecoration(
            border: Border.all(color: theme.colorScheme.outlineVariant, width: 2),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_upload_outlined, size: 48, color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5)),
              const SizedBox(height: 12),
              Text('Click to upload', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.primary)),
              const SizedBox(height: 4),
              Text('PNG, JPG up to 2MB', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ],
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Step 3: Invite Team
// ---------------------------------------------------------------------------
class _InviteTeamStep extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Invite Your Team', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Add team members to collaborate.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: 24),
          _InviteRow(),
          const SizedBox(height: 12),
          _InviteRow(),
          const SizedBox(height: 12),
          _InviteRow(),
          const SizedBox(height: 16),
          TextButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add another'),
          ),
        ],
      ),
    );
  }
}

class _InviteRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(
          flex: 3,
          child: TextField(decoration: InputDecoration(labelText: 'Email', border: OutlineInputBorder(), isDense: true)),
        ),
        const SizedBox(width: 12),
        Expanded(
          flex: 2,
          child: DropdownButtonFormField<String>(
            decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
            hint: const Text('Role'),
            items: const [
              DropdownMenuItem(value: 'sales_manager', child: Text('Sales Manager')),
              DropdownMenuItem(value: 'salesperson', child: Text('Salesperson')),
              DropdownMenuItem(value: 'operations', child: Text('Operations')),
              DropdownMenuItem(value: 'accountant', child: Text('Accountant')),
              DropdownMenuItem(value: 'view_only', child: Text('View Only')),
            ],
            onChanged: (_) {},
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Step 4: Import Contacts
// ---------------------------------------------------------------------------
class _ImportContactsStep extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text('Import Contacts', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Text('Import your existing contacts from a CSV file.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 32),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            border: Border.all(color: theme.colorScheme.outlineVariant, width: 2),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            children: [
              Icon(Icons.upload_file, size: 48, color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5)),
              const SizedBox(height: 12),
              Text('Drag & drop a CSV file or click to browse', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.primary)),
              const SizedBox(height: 8),
              Text('Supported: .csv, .xlsx', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () {},
          icon: const Icon(Icons.download, size: 16),
          label: const Text('Download template'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Step 5: Create First Lead
// ---------------------------------------------------------------------------
class _CreateLeadStep extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Create Your First Lead', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Get started by creating a sample lead.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: 24),
          const TextField(decoration: InputDecoration(labelText: 'Client Name', border: OutlineInputBorder(), prefixIcon: Icon(Icons.person))),
          const SizedBox(height: 16),
          const TextField(decoration: InputDecoration(labelText: 'Destination', border: OutlineInputBorder(), prefixIcon: Icon(Icons.flight_takeoff))),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextField(
                  decoration: InputDecoration(
                    labelText: 'Travel Date',
                    border: const OutlineInputBorder(),
                    prefixIcon: const Icon(Icons.calendar_today),
                    suffixIcon: IconButton(icon: const Icon(Icons.edit_calendar), onPressed: () {}),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              const Expanded(
                child: TextField(decoration: InputDecoration(labelText: 'Budget', border: OutlineInputBorder(), prefixIcon: Icon(Icons.currency_rupee))),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const TextField(
            maxLines: 3,
            decoration: InputDecoration(labelText: 'Notes (optional)', border: OutlineInputBorder()),
          ),
        ],
      ),
    );
  }
}
