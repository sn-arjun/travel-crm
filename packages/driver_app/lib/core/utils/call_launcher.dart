import 'package:url_launcher/url_launcher.dart';

/// Opens the phone dialer (`tel:`) for [phone]. Returns false when the device
/// has no dialer or the number is empty; never throws.
Future<bool> callPhone(String phone) async {
  final number = phone.replaceAll(RegExp(r'[^0-9+]'), '');
  if (number.isEmpty) return false;
  try {
    return await launchUrl(Uri(scheme: 'tel', path: number));
  } catch (_) {
    return false;
  }
}
