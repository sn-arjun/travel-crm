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

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(
              position != null
                  ? Icons.location_on
                  : Icons.location_searching,
              size: 48,
              color: position != null ? AppColors.success : Colors.grey,
            ),
            const SizedBox(height: 12),
            if (loading)
              Text(l10n.gettingLocation,
                  style: TextStyle(color: Colors.grey[600]))
            else if (failure != null) ...[
              Text(
                locationFailureMessage(failure!),
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.error),
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
                style: TextStyle(color: Colors.grey[600], fontSize: 13),
              ),
          ],
        ),
      ),
    );
  }
}
