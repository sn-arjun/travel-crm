import 'package:flutter/material.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import 'package:shared/shared.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/utils/map_launcher.dart';
import '../../data/trip_view.dart';

/// The stops of a coach trip in order: time, name, documents-check badge and
/// status, with Arrived / Depart for the stop the coach is at and a navigate
/// button.
class StopTimeline extends StatelessWidget {
  final List<TripStop> stops;

  /// Seats boarded / expected per stop id, when passengers are known.
  final TripHeadcount? headcount;

  /// Tap on a stop card (opens the stop screen). Null when the person cannot
  /// see passengers.
  final ValueChanged<TripStop>? onOpen;
  final ValueChanged<TripStop> onArrive;
  final ValueChanged<TripStop> onDepart;

  /// False once the trip is completed or cancelled: no more actions.
  final bool actionsEnabled;

  const StopTimeline({
    super.key,
    required this.stops,
    required this.onArrive,
    required this.onDepart,
    this.headcount,
    this.onOpen,
    this.actionsEnabled = true,
  });

  @override
  Widget build(BuildContext context) {
    // The stop the crew works on: the first one that is not departed or skipped.
    final current = stops.indexWhere(
      (s) => s.status == 'pending' || s.status == 'arrived',
    );
    return Column(
      key: const Key('stop-timeline'),
      children: [
        for (var i = 0; i < stops.length; i++)
          _StopRow(
            stop: stops[i],
            isLast: i == stops.length - 1,
            isCurrent: actionsEnabled && i == current,
            counts: headcount?.byStop
                .where((h) => h.stopId == stops[i].id)
                .firstOrNull,
            onOpen: onOpen,
            onArrive: onArrive,
            onDepart: onDepart,
          ),
      ],
    );
  }
}

class _StopRow extends StatelessWidget {
  final TripStop stop;
  final bool isLast;
  final bool isCurrent;
  final TripStopHeadcount? counts;
  final ValueChanged<TripStop>? onOpen;
  final ValueChanged<TripStop> onArrive;
  final ValueChanged<TripStop> onDepart;

  const _StopRow({
    required this.stop,
    required this.isLast,
    required this.isCurrent,
    required this.counts,
    required this.onOpen,
    required this.onArrive,
    required this.onDepart,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final semantic = AppSemantic.of(context);
    final s = stop;
    final at = TripView.parseTime(s.scheduledAt);

    final done = s.status == 'departed';
    final arrived = s.status == 'arrived';
    final dot = done
        ? semantic.success.color
        : arrived
            ? semantic.info.color
            : scheme.outline;
    final statusLabel = switch (s.status) {
      'arrived' => l10n.stopStatusArrived,
      'departed' => l10n.stopStatusDeparted,
      'skipped' => l10n.stopStatusSkipped,
      _ => l10n.stopStatusPending,
    };

    final hasPlace = (s.lat != null && s.lng != null) ||
        (s.address ?? '').trim().isNotEmpty;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 22,
            child: Column(
              children: [
                const SizedBox(height: 18),
                Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: done || arrived ? dot : null,
                    border: Border.all(color: dot, width: 3),
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(width: 2, color: scheme.outlineVariant),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Card(
                key: Key('stop-card-${s.id}'),
                margin: EdgeInsets.zero,
                clipBehavior: Clip.antiAlias,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(
                    color: isCurrent ? scheme.primary : scheme.outlineVariant,
                    width: isCurrent ? 1.5 : 1,
                  ),
                ),
                child: InkWell(
                  onTap: onOpen == null ? null : () => onOpen!(s),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (at != null)
                                    Text(TripView.formatTime(at),
                                        key: Key('stop-time-${s.id}'),
                                        style: text.labelLarge?.copyWith(
                                            color: scheme.onSurfaceVariant)),
                                  Text(s.name,
                                      style: text.titleMedium?.copyWith(
                                          fontWeight: FontWeight.w700)),
                                  if ((s.address ?? '').isNotEmpty)
                                    Text(s.address!,
                                        style: text.bodySmall?.copyWith(
                                            color: scheme.onSurfaceVariant)),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              statusLabel,
                              key: Key('stop-status-${s.id}'),
                              style: text.labelMedium?.copyWith(
                                color: dot,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        if (s.documentsCheck || counts != null) ...[
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 4,
                            children: [
                              if (s.documentsCheck)
                                _Pill(
                                  key: Key('stop-docs-${s.id}'),
                                  icon: Icons.fact_check_outlined,
                                  label: l10n.documentsCheckBadge,
                                  tone: semantic.warning,
                                ),
                              if (counts != null && counts!.expected > 0)
                                _Pill(
                                  key: Key('stop-count-${s.id}'),
                                  icon: Icons.people_outline,
                                  label: l10n.headcountBoarded(
                                      counts!.boarded, counts!.expected),
                                  tone: semantic.success,
                                ),
                            ],
                          ),
                        ],
                        if (hasPlace || isCurrent) ...[
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              if (hasPlace)
                                OutlinedButton.icon(
                                  key: Key('stop-navigate-${s.id}'),
                                  onPressed: () => _navigate(s),
                                  icon: const Icon(Icons.navigation_outlined,
                                      size: 18),
                                  label: Text(l10n.navigate),
                                  style: OutlinedButton.styleFrom(
                                      minimumSize: const Size(64, 44)),
                                ),
                              const Spacer(),
                              if (isCurrent && s.status == 'pending')
                                FilledButton(
                                  key: Key('stop-arrive-${s.id}'),
                                  onPressed: () => onArrive(s),
                                  style: FilledButton.styleFrom(
                                      minimumSize: const Size(96, 44)),
                                  child: Text(l10n.stopArrived),
                                ),
                              if (isCurrent && s.status == 'arrived')
                                FilledButton(
                                  key: Key('stop-depart-${s.id}'),
                                  onPressed: () => onDepart(s),
                                  style: FilledButton.styleFrom(
                                      minimumSize: const Size(96, 44)),
                                  child: Text(l10n.stopDepart),
                                ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static void _navigate(TripStop s) {
    if (s.lat != null && s.lng != null) {
      MapLauncher.navigate(lat: s.lat!, lng: s.lng!, address: s.address);
    } else if ((s.address ?? '').trim().isNotEmpty) {
      MapLauncher.openAddress(s.address!);
    }
  }
}

class _Pill extends StatelessWidget {
  final IconData icon;
  final String label;
  final SemanticTone tone;

  const _Pill({super.key, required this.icon, required this.label, required this.tone});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: tone.container,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: tone.color),
          const SizedBox(width: 4),
          Text(label,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: tone.onContainer)),
        ],
      ),
    );
  }
}
