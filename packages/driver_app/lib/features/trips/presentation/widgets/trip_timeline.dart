import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/trip_view.dart';

/// One step of the trip journey.
class TimelineStep {
  /// Backend status this step represents (`assigned`, `accepted`, ...).
  final String status;
  final String label;

  /// Local time the step happened, or null when it has not happened yet.
  final DateTime? at;

  /// True once the trip has reached this step.
  final bool done;

  /// True for the most recent step reached.
  final bool current;

  const TimelineStep({
    required this.status,
    required this.label,
    required this.at,
    required this.done,
    required this.current,
  });
}

const _journey = <(String, String)>[
  ('assigned', 'Assigned'),
  ('accepted', 'Accepted'),
  ('en_route', 'En route'),
  ('started', 'Checked in / Started'),
  ('completed', 'Completed'),
];

/// Builds the status steps for a trip from its timestamps and, when the
/// detail endpoint provides it, the raw `timeline` entries. Pure function so
/// it can be unit-tested.
List<TimelineStep> buildTimelineSteps(Map<String, dynamic> trip) {
  final view = TripView(trip);
  final status = view.status;

  // Earliest entry per status from the detail endpoint's timeline.
  final fromEntries = <String, DateTime>{};
  final entries = trip['timeline'];
  if (entries is List) {
    for (final e in entries) {
      if (e is! Map) continue;
      final s = e['status']?.toString();
      final raw = e['createdAt']?.toString();
      final at = raw == null ? null : DateTime.tryParse(raw)?.toLocal();
      if (s == null || at == null) continue;
      final existing = fromEntries[s];
      if (existing == null || at.isBefore(existing)) fromEntries[s] = at;
    }
  }

  DateTime? timeFor(String s) {
    switch (s) {
      case 'assigned':
        return fromEntries['assigned'] ?? view.assignedAt;
      case 'accepted':
        return view.acceptedAt ?? fromEntries['accepted'];
      case 'en_route':
        return view.enRouteAt ?? fromEntries['en_route'];
      case 'started':
        return view.startedAt ?? fromEntries['started'];
      case 'completed':
        return view.completedAt ?? fromEntries['completed'];
    }
    return fromEntries[s];
  }

  final terminalOff = status == 'cancelled' || status == 'rejected';
  final effective = status == 'in_progress' ? 'started' : status;
  final reachedIndex = _journey.indexWhere((s) => s.$1 == effective);

  final steps = <TimelineStep>[];
  for (var i = 0; i < _journey.length; i++) {
    final (s, label) = _journey[i];
    final at = timeFor(s);
    // A step up to the current status has happened even if the backend sent
    // no timestamp for it; the assigned step always has happened.
    final reached = s == 'assigned' || i <= reachedIndex || at != null;
    // A cancelled / rejected trip only lists the steps it actually reached.
    if (terminalOff && !reached) continue;
    steps.add(TimelineStep(
      status: s,
      label: label,
      at: at,
      done: reached,
      current: !terminalOff && reachedIndex == i,
    ));
  }

  if (terminalOff) {
    steps.add(TimelineStep(
      status: status,
      label: status == 'cancelled' ? 'Cancelled' : 'Rejected',
      at: timeFor(status),
      done: true,
      current: true,
    ));
  }
  return steps;
}

/// Vertical timeline of the trip's status events with local times.
class TripTimeline extends StatelessWidget {
  final List<TimelineStep> steps;

  const TripTimeline({super.key, required this.steps});

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('trip-timeline'),
      children: [
        for (var i = 0; i < steps.length; i++)
          _TimelineRow(
            step: steps[i],
            isFirst: i == 0,
            isLast: i == steps.length - 1,
            nextDone: i + 1 < steps.length && steps[i + 1].done,
          ),
      ],
    );
  }
}

class _TimelineRow extends StatelessWidget {
  final TimelineStep step;
  final bool isFirst;
  final bool isLast;
  final bool nextDone;

  const _TimelineRow({
    required this.step,
    required this.isFirst,
    required this.isLast,
    required this.nextDone,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final style = TripStatusStyle.of(context, step.status);
    final done = step.done;
    final dotColor = done ? style.color : scheme.outline;
    final lineColor = nextDone ? style.color : scheme.outlineVariant;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 28,
            child: Column(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: done ? style.container : Colors.transparent,
                    border: Border.all(
                      color: dotColor,
                      width: step.current ? 2.5 : 1.5,
                    ),
                  ),
                  child: done
                      ? Icon(
                          step.current ? style.icon : Icons.check,
                          size: 15,
                          color: style.color,
                        )
                      : null,
                ),
                if (!isLast)
                  Expanded(
                    child: Container(width: 2, color: lineColor),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 18, top: 3),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step.label,
                    style: text.titleSmall?.copyWith(
                      color: done
                          ? scheme.onSurface
                          : scheme.onSurfaceVariant,
                      fontWeight:
                          step.current ? FontWeight.w700 : FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    step.at != null
                        ? '${TripView.formatDate(step.at!)} · '
                            '${TripView.formatTime(step.at!)}'
                        : 'Pending',
                    style: text.bodySmall
                        ?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
