import 'package:flutter/material.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/layout/app_section_card.dart';

/// Displays lead details as a set of AppSectionCards:
/// Trip Info, Preferences, Budget, and Source/Type.
class LeadInfoCards extends StatelessWidget {
  final LeadModel lead;

  const LeadInfoCards({super.key, required this.lead});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _TripInfoCard(lead: lead),
        const SizedBox(height: AppTheme.spacingMd),
        _PreferencesCard(lead: lead),
        const SizedBox(height: AppTheme.spacingMd),
        _SourceCard(lead: lead),
      ],
    );
  }
}

// ── Trip Info ──────────────────────────────────────────────────

class _TripInfoCard extends StatelessWidget {
  final LeadModel lead;
  const _TripInfoCard({required this.lead});

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      title: 'Trip Details',
      child: Column(
        children: [
          _Row(
            icon: Icons.flight_takeoff_outlined,
            label: 'Destinations',
            value: lead.destinations.isEmpty
                ? '—'
                : lead.destinations.join(', '),
          ),
          _Row(
            icon: Icons.calendar_today_outlined,
            label: 'Travel Date',
            value: lead.travelDate,
          ),
          if (lead.returnDate != null)
            _Row(
              icon: Icons.calendar_month_outlined,
              label: 'Return Date',
              value: lead.returnDate!,
            ),
          _Row(
            icon: Icons.people_outline,
            label: 'Passengers',
            value:
                '${lead.paxAdults} Adult${lead.paxAdults != 1 ? 's' : ''}'
                '${lead.paxChildren > 0 ? ', ${lead.paxChildren} Child' : ''}'
                '${lead.paxChildren > 1 ? 'ren' : ''}'
                '${lead.paxInfants > 0 ? ', ${lead.paxInfants} Infant${lead.paxInfants != 1 ? 's' : ''}' : ''}',
          ),
          _Row(
            icon: Icons.category_outlined,
            label: 'Trip Type',
            value: _capitalise(lead.tripType),
          ),
        ],
      ),
    );
  }
}

// ── Preferences ────────────────────────────────────────────────

class _PreferencesCard extends StatelessWidget {
  final LeadModel lead;
  const _PreferencesCard({required this.lead});

  @override
  Widget build(BuildContext context) {
    final hasPrefs = lead.travelClass != null ||
        lead.hotelPreference != null ||
        lead.mealPreference != null ||
        lead.passportAvailable != null;

    if (!hasPrefs && lead.specialRequirements == null) {
      return const SizedBox.shrink();
    }

    return AppSectionCard(
      title: 'Preferences',
      child: Column(
        children: [
          if (lead.budget != null)
            _Row(
              icon: Icons.currency_rupee_outlined,
              label: 'Budget',
              value:
                  '${lead.currency} ${lead.budget!.toStringAsFixed(0)}',
            ),
          if (lead.travelClass != null)
            _Row(
              icon: Icons.airline_seat_recline_extra_outlined,
              label: 'Travel Class',
              value: _capitalise(lead.travelClass!),
            ),
          if (lead.hotelPreference != null)
            _Row(
              icon: Icons.hotel_outlined,
              label: 'Hotel',
              value: _capitalise(lead.hotelPreference!),
            ),
          if (lead.mealPreference != null)
            _Row(
              icon: Icons.restaurant_outlined,
              label: 'Meals',
              value: _capitalise(lead.mealPreference!),
            ),
          if (lead.passportAvailable != null)
            _Row(
              icon: Icons.book_outlined,
              label: 'Passport',
              value: lead.passportAvailable! ? 'Available' : 'Not Available',
            ),
          if (lead.specialRequirements != null)
            _Row(
              icon: Icons.note_outlined,
              label: 'Special Requirements',
              value: lead.specialRequirements!,
            ),
        ],
      ),
    );
  }
}

// ── Source/Type ────────────────────────────────────────────────

class _SourceCard extends StatelessWidget {
  final LeadModel lead;
  const _SourceCard({required this.lead});

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      title: 'Lead Info',
      child: Column(
        children: [
          _Row(
            icon: Icons.input_outlined,
            label: 'Source',
            value: _capitalise(lead.source),
          ),
          if (lead.createdByName != null)
            _Row(
              icon: Icons.person_add_outlined,
              label: 'Created By',
              value: lead.createdByName!,
            ),
          if (lead.createdAt != null)
            _Row(
              icon: Icons.access_time_outlined,
              label: 'Created',
              value: lead.createdAt!.split('T').first,
            ),
        ],
      ),
    );
  }
}

// ── Shared row widget ──────────────────────────────────────────

class _Row extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _Row({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: AppTheme.spacingSm),
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(
            child: Text(value, style: theme.textTheme.bodySmall),
          ),
        ],
      ),
    );
  }
}

String _capitalise(String s) =>
    s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1).replaceAll('_', ' ')}';
