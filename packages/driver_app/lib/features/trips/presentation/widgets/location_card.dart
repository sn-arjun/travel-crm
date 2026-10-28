import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/utils/location_capture.dart';

/// GPS status card shared by the check-in and check-out screens.
///
/// Shows the captured coordinates (4 decimals) once a fix exists, or a clear
/// message plus the right recovery action when permission is denied or the
/// location service is off.
class LocationCard extends StatelessWidget {
  final Position? position;
  final bool loading;
  final LocationFailure? failure;
  final VoidCallback onRetry;
  final Key coordsKey;

  const LocationCard({
    super.key,
    required this.position,
    required this.loading,
    required this.failure,
    required this.onRetry,
    required this.coordsKey,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final semantic = AppSemantic.of(context);
    final text = Theme.of(context).textTheme;

    final hasFix = position != null;
    final failed = failure != null && !loading;
    final tone = hasFix
        ? semantic.success
        : failed
            ? semantic.danger
            : null;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: tone?.container ?? scheme.primaryContainer,
                shape: BoxShape.circle,
              ),
              child: loading
                  ? Padding(
                      padding: const EdgeInsets.all(22),
                      child: CircularProgressIndicator(
                        strokeWidth: 3,
                        color: scheme.primary,
                      ),
                    )
                  : Icon(
                      hasFix
                          ? Icons.location_on
                          : failed
                              ? Icons.location_off_outlined
                              : Icons.location_searching,
                      size: 36,
                      color: tone?.color ?? scheme.primary,
                    ),
            ),
            const SizedBox(height: 14),
            if (loading)
              Text(l10n.gettingLocation,
                  style: text.bodyLarge
                      ?.copyWith(color: scheme.onSurfaceVariant))
            else if (failure != null) ...[
              Text(
                locationFailureMessage(failure!),
                textAlign: TextAlign.center,
                style: text.bodyMedium?.copyWith(color: semantic.danger.color),
              ),
              const SizedBox(height: 8),
              if (failure == LocationFailure.deniedForever)
                TextButton(
                  onPressed: Geolocator.openAppSettings,
                  child: const Text('Open app settings'),
                )
              else if (failure == LocationFailure.serviceDisabled)
                TextButton(
                  onPressed: Geolocator.openLocationSettings,
                  child: const Text('Turn on location'),
                ),
              TextButton(
                onPressed: onRetry,
                child: Text(l10n.retryLocation),
              ),
            ] else if (position != null)
              Text(
                '${position!.latitude.toStringAsFixed(4)}, '
                '${position!.longitude.toStringAsFixed(4)}',
                key: coordsKey,
                style: text.titleMedium
                    ?.copyWith(color: scheme.onSurfaceVariant),
              ),
          ],
        ),
      ),
    );
  }
}
