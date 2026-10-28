import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/api_client_provider.dart';
import '../../../core/utils/api_error.dart';
import 'profile_repository.dart';

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.watch(dioProvider));
});

class ProfileState {
  final bool isLoading;
  final Map<String, dynamic>? profile;
  final List<Map<String, dynamic>> documents;
  final String? error;

  /// True while a document upload is in flight.
  final bool isUploading;

  /// Upload progress 0..1, or null when unknown / not uploading.
  final double? uploadProgress;

  const ProfileState({
    this.isLoading = false,
    this.profile,
    this.documents = const [],
    this.error,
    this.isUploading = false,
    this.uploadProgress,
  });

  ProfileState copyWith({
    bool? isLoading,
    Map<String, dynamic>? profile,
    List<Map<String, dynamic>>? documents,
    String? error,
    bool? isUploading,
    double? uploadProgress,
    bool clearUploadProgress = false,
  }) {
    return ProfileState(
      isLoading: isLoading ?? this.isLoading,
      profile: profile ?? this.profile,
      documents: documents ?? this.documents,
      error: error,
      isUploading: isUploading ?? this.isUploading,
      uploadProgress:
          clearUploadProgress ? null : (uploadProgress ?? this.uploadProgress),
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

  /// Uploads a document, then refreshes the list. Returns an error message,
  /// or null on success.
  Future<String?> uploadDocument({
    required String type,
    required String filePath,
    required String fileName,
    String? expiryDate,
  }) async {
    state = state.copyWith(isUploading: true, clearUploadProgress: true);
    try {
      await _repo.uploadDocument(
        type: type,
        filePath: filePath,
        fileName: fileName,
        expiryDate: expiryDate,
        onProgress: (sent, total) {
          if (!mounted || total <= 0) return;
          state = state.copyWith(
            isUploading: true,
            uploadProgress: sent / total,
          );
        },
      );
      if (!mounted) return null;
      state = state.copyWith(isUploading: false, clearUploadProgress: true);
      await loadDocuments();
      return null;
    } catch (e) {
      final message = extractApiError(e, fallback: 'Upload failed. Try again.');
      if (mounted) {
        state = state.copyWith(isUploading: false, clearUploadProgress: true);
      }
      return message;
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
