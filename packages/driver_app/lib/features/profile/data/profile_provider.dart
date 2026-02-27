import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/api_client_provider.dart';
import 'profile_repository.dart';

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.watch(dioProvider));
});

class ProfileState {
  final bool isLoading;
  final Map<String, dynamic>? profile;
  final List<Map<String, dynamic>> documents;
  final String? error;

  const ProfileState({
    this.isLoading = false,
    this.profile,
    this.documents = const [],
    this.error,
  });

  ProfileState copyWith({
    bool? isLoading,
    Map<String, dynamic>? profile,
    List<Map<String, dynamic>>? documents,
    String? error,
  }) {
    return ProfileState(
      isLoading: isLoading ?? this.isLoading,
      profile: profile ?? this.profile,
      documents: documents ?? this.documents,
      error: error,
    );
  }
}

final profileProvider =
    StateNotifierProvider<ProfileNotifier, ProfileState>((ref) {
  return ProfileNotifier(ref.watch(profileRepositoryProvider));
});

class ProfileNotifier extends StateNotifier<ProfileState> {
  final ProfileRepository _repo;

  ProfileNotifier(this._repo) : super(const ProfileState()) {
    loadProfile();
  }

  Future<void> loadProfile() async {
    state = state.copyWith(isLoading: true);
    try {
      final response = await _repo.getProfile();
      state = state.copyWith(
        isLoading: false,
        profile: response['data'],
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> updateProfile(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true);
    try {
      final response = await _repo.updateProfile(data);
      state = state.copyWith(
        isLoading: false,
        profile: response['data'],
      );
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<void> loadDocuments() async {
    try {
      final response = await _repo.getDocuments();
      final docs = (response['data'] as List? ?? [])
          .cast<Map<String, dynamic>>();
      state = state.copyWith(documents: docs);
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}
