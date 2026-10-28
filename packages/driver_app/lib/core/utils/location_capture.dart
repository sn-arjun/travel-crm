import 'package:geolocator/geolocator.dart';

/// Why a location could not be captured.
enum LocationFailure {
  /// The device's location switch is off.
  serviceDisabled,

  /// Permission was refused; the driver can be asked again.
  denied,

  /// Permission was refused permanently; only system settings can fix it.
  deniedForever,

  /// Permission is fine but no fix was obtained (timeout, hardware error).
  unavailable,
}

class LocationResult {
  final Position? position;
  final LocationFailure? failure;

  const LocationResult.success(Position this.position) : failure = null;
  const LocationResult.failure(LocationFailure this.failure) : position = null;

  bool get ok => position != null;
}

/// Human readable explanation for a [LocationFailure].
String locationFailureMessage(LocationFailure failure) {
  switch (failure) {
    case LocationFailure.serviceDisabled:
      return 'Location is turned off. Turn it on to continue.';
    case LocationFailure.denied:
      return 'Location permission is needed to record where you are.';
    case LocationFailure.deniedForever:
      return 'Location permission is blocked. Allow it in the app settings.';
    case LocationFailure.unavailable:
      return 'Could not get your location. Move to an open area and retry.';
  }
}

/// Checks the location service and permission, then reads the current
/// position. Never throws.
Future<LocationResult> captureLocation() async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return const LocationResult.failure(LocationFailure.serviceDisabled);
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever) {
      return const LocationResult.failure(LocationFailure.deniedForever);
    }
    if (permission == LocationPermission.denied) {
      return const LocationResult.failure(LocationFailure.denied);
    }

    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 20),
      ),
    );
    return LocationResult.success(position);
  } catch (_) {
    return const LocationResult.failure(LocationFailure.unavailable);
  }
}
