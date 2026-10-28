import 'package:url_launcher/url_launcher.dart';
import '../storage/hive_storage.dart';

class MapLauncher {
  MapLauncher._();

  static Future<void> navigate({
    required double lat,
    required double lng,
    String? address,
  }) async {
    final pref = HiveStorage.preferredNavApp;

    if (pref == 'waze') {
      final launched = await _launchWaze(lat, lng);
      if (launched) return;
    }

    // Default: Google Maps
    final launched = await _launchGoogleMaps(lat, lng, address);
    if (!launched && address != null) {
      // Fallback to address-based URL
      final url = Uri.parse(
        'https://www.google.com/maps/dir/?api=1&destination=${Uri.encodeComponent(address)}',
      );
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  /// Opens directions to a free-text [address] (used when the trip has no
  /// coordinates). Returns false when nothing could handle the link.
  static Future<bool> openAddress(String address) async {
    if (address.trim().isEmpty) return false;
    final url = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=${Uri.encodeComponent(address)}',
    );
    try {
      return await launchUrl(url, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> _launchGoogleMaps(
      double lat, double lng, String? address) async {
    final url = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng',
    );
    if (await canLaunchUrl(url)) {
      return launchUrl(url, mode: LaunchMode.externalApplication);
    }
    return false;
  }

  static Future<bool> _launchWaze(double lat, double lng) async {
    final url = Uri.parse('https://waze.com/ul?ll=$lat,$lng&navigate=yes');
    if (await canLaunchUrl(url)) {
      return launchUrl(url, mode: LaunchMode.externalApplication);
    }
    return false;
  }
}
