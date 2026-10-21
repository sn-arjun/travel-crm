import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/storage/hive_storage.dart';
import 'profile_provider.dart';
import 'profile_repository.dart';

/// The signed-in person's crew role (`driver`, `tour_leader`, `both`).
///
/// Answers from the copy saved on the phone first, then asks the profile
/// endpoint (and saves the answer), so the trip list can show a tour leader
/// badge without signal. A failure keeps the saved value, or `driver`.
final crewRoleProvider = FutureProvider<String>((ref) async {
  String? saved;
  try {
    saved = HiveStorage.crewRole;
  } catch (_) {}
  try {
    final role = await ref.watch(profileRepositoryProvider).getCrewRole();
    try {
      HiveStorage.crewRole = role;
    } catch (_) {}
    return role;
  } catch (_) {
    return ProfileRepository.crewRoleOf({'crewRole': saved});
  }
});
