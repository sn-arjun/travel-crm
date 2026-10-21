import 'package:flutter/material.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import 'package:shared/shared.dart';
import '../../../../core/constants/app_colors.dart';

/// Boarded / expected seats: for one stop (when [atStop] is given) and for the
/// whole trip.
class HeadcountBar extends StatelessWidget {
  final TripHeadcount overall;
  final TripStopHeadcount? atStop;

  const HeadcountBar({super.key, required this.overall, this.atStop});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final success = AppSemantic.of(context).success;

    Widget row(String label, int boarded, int expected, int noShow, Key key) {
      final value = expected == 0 ? 0.0 : boarded / expected;
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Column(
          key: key,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(label,
                    style: text.labelMedium
                        ?.copyWith(color: scheme.onSurfaceVariant)),
                const Spacer(),
                Text(
                  l10n.headcountBoarded(boarded, expected),
                  style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: value,
                minHeight: 8,
                color: success.color,
                backgroundColor: scheme.surfaceContainerHighest,
              ),
            ),
            if (noShow > 0)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  l10n.headcountNoShow(noShow),
                  style: text.bodySmall?.copyWith(
                    color: AppSemantic.of(context).danger.color,
                  ),
                ),
              ),
          ],
        ),
      );
    }

    return Card(
      key: const Key('headcount'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: Column(
          children: [
            if (atStop != null)
              row(l10n.headcountThisStop, atStop!.boarded, atStop!.expected,
                  atStop!.noShow, const Key('headcount-stop')),
            row(l10n.headcountOverall, overall.boarded, overall.expected,
                overall.noShow, const Key('headcount-overall')),
          ],
        ),
      ),
    );
  }
}
