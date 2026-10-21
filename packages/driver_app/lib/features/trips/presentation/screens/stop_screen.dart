import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import 'package:shared/shared.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../data/trip_provider.dart';
import '../../data/trip_view.dart';
import '../widgets/headcount_bar.dart';
import '../widgets/passenger_tile.dart';

/// One stop of a coach trip: who boards here, boarded / no-show ticks, the
/// documents check, the head count and "Complete stop".
///
/// Ticks show at once and are sent in order, also without signal.
class StopScreen extends ConsumerWidget {
  final String tripId;
  final String stopId;

  const StopScreen({super.key, required this.tripId, required this.stopId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(tripDetailProvider(tripId));
    final pending = ref.watch(pendingCheckinsProvider(tripId));
    final trip = state.trip;

    if (trip == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.stopsTitle)),
        body: state.isLoading
            ? const Center(child: CircularProgressIndicator())
            : StateMessage(
                icon: Icons.cloud_off_outlined,
                isError: true,
                title: l10n.tripLoadError,
                message: state.error,
                actionLabel: l10n.retry,
                onAction: () =>
                    ref.read(tripDetailProvider(tripId).notifier).loadDetail(),
              ),
      );
    }

    final view = TripView(trip);
    final stop = view.stops.where((s) => s.id == stopId).firstOrNull;
    if (stop == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.stopsTitle)),
        body: StateMessage(
          key: const Key('stop-gone'),
          icon: Icons.location_off_outlined,
          title: l10n.stopGone,
        ),
      );
    }

    final all = view.passengers ?? const <TripPassenger>[];
    final here = all.where((p) => p.tripStopId == stop.id).toList();
    final headcount = view.headcount;
    final atStop = headcount?.byStop
        .where((h) => h.stopId == stop.id)
        .firstOrNull;
    final notTicked = here.where((p) => p.boarding == 'pending').length;
    final notifier = ref.read(tripDetailProvider(tripId).notifier);
    final closed = const {'completed', 'cancelled'}.contains(view.status);

    return Scaffold(
      appBar: AppBar(title: Text(stop.name)),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
            16, 12, 16, 96 + MediaQuery.of(context).padding.bottom),
        children: [
          if (state.fromCache)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InfoBanner(
                key: const Key('offline-banner'),
                icon: Icons.cloud_off_outlined,
                message: l10n.savedTripNoSignal,
              ),
            ),
          if (pending > 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InfoBanner(
                key: const Key('pending-banner'),
                icon: Icons.sync,
                message: l10n.changesWaiting(pending),
              ),
            ),
          if (headcount != null) ...[
            HeadcountBar(overall: headcount, atStop: atStop),
            const SizedBox(height: 12),
          ],
          Text(
            l10n.passengersAtStop,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          if (here.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text(
                  l10n.noPassengersAtStop,
                  key: const Key('no-passengers'),
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ),
            ),
          for (final p in here)
            PassengerTile(
              passenger: p,
              showDocuments: stop.documentsCheck,
              onBoarding: closed
                  ? (_) {}
                  : (b) => notifier.tickPassenger(p.id, boarding: b),
              onDocuments: closed
                  ? (_) {}
                  : (v) => notifier.tickPassenger(p.id, documentsChecked: v),
            ),
        ],
      ),
      bottomNavigationBar: closed || stop.status == 'departed'
          ? null
          : Container(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                border: Border(
                  top: BorderSide(
                      color: Theme.of(context).colorScheme.outlineVariant),
                ),
              ),
              child: SafeArea(
                top: false,
                child: FilledButton(
                  key: const Key('complete-stop'),
                  onPressed: () async {
                    if (notTicked > 0 &&
                        !await _confirm(context, l10n, notTicked)) {
                      return;
                    }
                    await notifier.departStop(stop.id);
                    if (context.mounted) context.pop();
                  },
                  style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48)),
                  child: Text(l10n.completeStop),
                ),
              ),
            ),
    );
  }

  Future<bool> _confirm(
      BuildContext context, AppLocalizations l10n, int count) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.completeStopPendingTitle),
        content: Text(l10n.completeStopPendingBody(count)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            key: const Key('confirm-complete-stop'),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.completeStop),
          ),
        ],
      ),
    );
    return ok ?? false;
  }
}
