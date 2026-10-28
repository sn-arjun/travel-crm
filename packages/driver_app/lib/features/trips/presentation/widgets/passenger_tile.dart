import 'package:flutter/material.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import 'package:shared/shared.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/utils/call_launcher.dart';
import '../../../../core/utils/phone.dart';

/// One passenger on the stop screen: name, seats, Boarded / No-show buttons and
/// the documents-checked mark.
///
/// The documents toggle shows inline when [showDocuments] (the stop checks
/// documents); elsewhere it is in the "more" menu.
class PassengerTile extends StatelessWidget {
  final TripPassenger passenger;
  final bool showDocuments;

  /// Called with `boarded`, `no_show` or `pending` (a second tap on the active
  /// button undoes the tick).
  final ValueChanged<String> onBoarding;
  final ValueChanged<bool> onDocuments;

  const PassengerTile({
    super.key,
    required this.passenger,
    required this.showDocuments,
    required this.onBoarding,
    required this.onDocuments,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final semantic = AppSemantic.of(context);
    final p = passenger;
    final boarded = p.boarding == 'boarded';
    final noShow = p.boarding == 'no_show';
    final phone = p.phone;

    ButtonStyle style(bool on, SemanticTone tone) => OutlinedButton.styleFrom(
          minimumSize: const Size(64, 44),
          backgroundColor: on ? tone.container : null,
          foregroundColor: on ? tone.onContainer : scheme.onSurface,
          side: BorderSide(color: on ? tone.color : scheme.outline),
        );

    return Card(
      key: Key('passenger-${p.id}'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.name,
                          style: text.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w600)),
                      Text(
                        [
                          if (p.seats > 1) l10n.passengerSeats(p.seats),
                          if (phone != null && phone.isNotEmpty)
                            formatPhoneDisplay(phone),
                        ].join(' · '),
                        style: text.bodySmall
                            ?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                if (phone != null && phone.isNotEmpty)
                  IconButton(
                    key: Key('passenger-${p.id}-call'),
                    tooltip: l10n.callPassenger,
                    icon: const Icon(Icons.call_outlined),
                    onPressed: () => callPhone(phone),
                  ),
                if (!showDocuments)
                  PopupMenuButton<String>(
                    key: Key('passenger-${p.id}-menu'),
                    tooltip: l10n.passengerMore,
                    onSelected: (v) {
                      if (v == 'documents') onDocuments(!p.documentsChecked);
                    },
                    itemBuilder: (_) => [
                      CheckedPopupMenuItem<String>(
                        key: Key('passenger-${p.id}-documents'),
                        value: 'documents',
                        checked: p.documentsChecked,
                        child: Text(l10n.documentsChecked),
                      ),
                    ],
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    key: Key('passenger-${p.id}-boarded'),
                    onPressed: () => onBoarding(boarded ? 'pending' : 'boarded'),
                    style: style(boarded, semantic.success),
                    icon: Icon(
                        boarded ? Icons.check_circle : Icons.check_circle_outline,
                        size: 18),
                    label: Text(l10n.passengerBoarded),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    key: Key('passenger-${p.id}-no-show'),
                    onPressed: () => onBoarding(noShow ? 'pending' : 'no_show'),
                    style: style(noShow, semantic.danger),
                    icon: Icon(noShow ? Icons.cancel : Icons.cancel_outlined,
                        size: 18),
                    label: Text(l10n.passengerNoShow),
                  ),
                ),
              ],
            ),
            if (showDocuments)
              SwitchListTile(
                key: Key('passenger-${p.id}-documents'),
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.documentsChecked),
                value: p.documentsChecked,
                onChanged: onDocuments,
              ),
          ],
        ),
      ),
    );
  }
}
