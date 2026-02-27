import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:shared/shared.dart';
import '../../../auth/data/auth_provider.dart';
import '../repositories/flyer_template_repository.dart';
import '../repositories/image_library_repository.dart';
import '../repositories/segment_repository.dart';
import '../repositories/branding_repository.dart';
import '../repositories/campaign_repository.dart';
import '../repositories/flyer_repository.dart';

part 'marketing_providers.freezed.dart';

// ============================================================================
// REPOSITORY PROVIDERS
// ============================================================================

final flyerTemplateRepositoryProvider = Provider<FlyerTemplateRepository>(
  (ref) => FlyerTemplateRepository(ref.watch(apiClientProvider)),
);

final imageLibraryRepositoryProvider = Provider<ImageLibraryRepository>(
  (ref) => ImageLibraryRepository(ref.watch(apiClientProvider)),
);

final segmentRepositoryProvider = Provider<SegmentRepository>(
  (ref) => SegmentRepository(ref.watch(apiClientProvider)),
);

final brandingRepositoryProvider = Provider<BrandingRepository>(
  (ref) => BrandingRepository(ref.watch(apiClientProvider)),
);

final marketingCampaignRepositoryProvider =
    Provider<MarketingCampaignRepository>(
      (ref) => MarketingCampaignRepository(ref.watch(apiClientProvider)),
    );

final flyerRepositoryProvider = Provider<FlyerRepository>(
  (ref) => FlyerRepository(ref.watch(apiClientProvider)),
);

// ============================================================================
// FLYER TEMPLATE LIST STATE
// ============================================================================

@freezed
abstract class FlyerTemplateListState with _$FlyerTemplateListState {
  const factory FlyerTemplateListState({
    @Default([]) List<FlyerTemplateModel> templates,
    @Default(true) bool isLoading,
    String? error,
    @Default(1) int currentPage,
    @Default(1) int totalPages,
    @Default(0) int totalItems,
    String? searchQuery,
    String? categoryFilter,
    String? sizePresetFilter,
  }) = _FlyerTemplateListState;
}

class FlyerTemplateListNotifier extends StateNotifier<FlyerTemplateListState> {
  final FlyerTemplateRepository _repository;

  FlyerTemplateListNotifier(this._repository)
    : super(const FlyerTemplateListState()) {
    loadTemplates();
  }

  Future<void> loadTemplates({bool refresh = false}) async {
    if (refresh) {
      state = state.copyWith(currentPage: 1, isLoading: true, error: null);
    } else {
      state = state.copyWith(isLoading: true, error: null);
    }

    try {
      final response = await _repository.getTemplates(
        page: state.currentPage,
        limit: 20,
        search: state.searchQuery,
        category: state.categoryFilter,
        sizePreset: state.sizePresetFilter,
      );

      final totalPages = response.pagination?.totalPages ?? 1;
      final newTemplates = refresh
          ? response.data
          : [...state.templates, ...response.data];

      state = state.copyWith(
        templates: newTemplates,
        totalPages: totalPages == 0 ? 1 : totalPages,
        totalItems: response.pagination?.total ?? 0,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }

  void loadNextPage() {
    if (!state.isLoading && state.currentPage < state.totalPages) {
      state = state.copyWith(currentPage: state.currentPage + 1);
      loadTemplates();
    }
  }

  void updateFilters({String? search, String? category, String? sizePreset}) {
    state = state.copyWith(
      searchQuery: search ?? state.searchQuery,
      categoryFilter: category,
      sizePresetFilter: sizePreset,
      currentPage: 1,
      templates: [],
    );
    loadTemplates();
  }
}

final flyerTemplateListProvider =
    StateNotifierProvider<FlyerTemplateListNotifier, FlyerTemplateListState>((
      ref,
    ) {
      return FlyerTemplateListNotifier(
        ref.watch(flyerTemplateRepositoryProvider),
      );
    });

// ============================================================================
// SEGMENT LIST STATE
// ============================================================================

@freezed
abstract class SegmentListState with _$SegmentListState {
  const factory SegmentListState({
    @Default([]) List<ContactSegmentModel> segments,
    @Default(true) bool isLoading,
    String? error,
    @Default(1) int currentPage,
    @Default(1) int totalPages,
    String? searchQuery,
  }) = _SegmentListState;
}

class SegmentListNotifier extends StateNotifier<SegmentListState> {
  final SegmentRepository _repository;

  SegmentListNotifier(this._repository) : super(const SegmentListState()) {
    loadSegments();
  }

  Future<void> loadSegments({bool refresh = false}) async {
    if (refresh) {
      state = state.copyWith(currentPage: 1, isLoading: true, error: null);
    } else {
      state = state.copyWith(isLoading: true, error: null);
    }

    try {
      final response = await _repository.getSegments(
        page: state.currentPage,
        limit: 20,
        search: state.searchQuery,
      );

      final totalPages = response.pagination?.totalPages ?? 1;
      final newSegments = refresh
          ? response.data
          : [...state.segments, ...response.data];

      state = state.copyWith(
        segments: newSegments,
        totalPages: totalPages == 0 ? 1 : totalPages,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }

  void search(String query) {
    state = state.copyWith(searchQuery: query, currentPage: 1, segments: []);
    loadSegments();
  }
}

final segmentListProvider =
    StateNotifierProvider<SegmentListNotifier, SegmentListState>((ref) {
      return SegmentListNotifier(ref.watch(segmentRepositoryProvider));
    });

// ============================================================================
// CAMPAIGN LIST STATE
// ============================================================================

@freezed
abstract class CampaignListState with _$CampaignListState {
  const factory CampaignListState({
    @Default([]) List<MarketingCampaignModel> campaigns,
    @Default(true) bool isLoading,
    String? error,
    @Default(1) int currentPage,
    @Default(1) int totalPages,
    String? typeFilter,
    String? statusFilter,
    String? searchQuery,
  }) = _CampaignListState;
}

class CampaignListNotifier extends StateNotifier<CampaignListState> {
  final MarketingCampaignRepository _repository;

  CampaignListNotifier(this._repository) : super(const CampaignListState()) {
    loadCampaigns();
  }

  Future<void> loadCampaigns({bool refresh = false}) async {
    if (refresh) {
      state = state.copyWith(currentPage: 1, isLoading: true, error: null);
    } else {
      state = state.copyWith(isLoading: true, error: null);
    }

    try {
      final response = await _repository.getCampaigns(
        page: state.currentPage,
        limit: 20,
        type: state.typeFilter,
        status: state.statusFilter,
        search: state.searchQuery,
      );

      final totalPages = response.pagination?.totalPages ?? 1;
      final newCampaigns = refresh
          ? response.data
          : [...state.campaigns, ...response.data];

      state = state.copyWith(
        campaigns: newCampaigns,
        totalPages: totalPages == 0 ? 1 : totalPages,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }

  void updateFilters({String? type, String? status, String? search}) {
    state = state.copyWith(
      typeFilter: type,
      statusFilter: status,
      searchQuery: search ?? state.searchQuery,
      currentPage: 1,
      campaigns: [],
    );
    loadCampaigns();
  }
}

final campaignListProvider =
    StateNotifierProvider<CampaignListNotifier, CampaignListState>((ref) {
      return CampaignListNotifier(
        ref.watch(marketingCampaignRepositoryProvider),
      );
    });

// ============================================================================
// BRANDING STATE
// ============================================================================

@freezed
abstract class BrandingState with _$BrandingState {
  const factory BrandingState({
    TenantBrandingModel? branding,
    @Default(true) bool isLoading,
    String? error,
  }) = _BrandingState;
}

class BrandingNotifier extends StateNotifier<BrandingState> {
  final BrandingRepository _repository;

  BrandingNotifier(this._repository) : super(const BrandingState()) {
    loadBranding();
  }

  Future<void> loadBranding() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final branding = await _repository.getBranding();
      state = state.copyWith(branding: branding, isLoading: false);
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }

  Future<void> updateBranding(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final branding = await _repository.updateBranding(data);
      state = state.copyWith(branding: branding, isLoading: false);
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }
}

final brandingProvider = StateNotifierProvider<BrandingNotifier, BrandingState>(
  (ref) {
    return BrandingNotifier(ref.watch(brandingRepositoryProvider));
  },
);

// ============================================================================
// GENERATED FLYER LIST STATE
// ============================================================================

@freezed
abstract class FlyerListState with _$FlyerListState {
  const factory FlyerListState({
    @Default([]) List<GeneratedFlyerModel> flyers,
    @Default(true) bool isLoading,
    String? error,
    @Default(1) int currentPage,
    @Default(1) int totalPages,
    String? searchQuery,
  }) = _FlyerListState;
}

class FlyerListNotifier extends StateNotifier<FlyerListState> {
  final FlyerRepository _repository;

  FlyerListNotifier(this._repository) : super(const FlyerListState()) {
    loadFlyers();
  }

  Future<void> loadFlyers({bool refresh = false}) async {
    if (refresh) {
      state = state.copyWith(currentPage: 1, isLoading: true, error: null);
    } else {
      state = state.copyWith(isLoading: true, error: null);
    }

    try {
      final response = await _repository.getFlyers(
        page: state.currentPage,
        limit: 20,
        search: state.searchQuery,
      );

      final totalPages = response.pagination?.totalPages ?? 1;
      final newFlyers = refresh
          ? response.data
          : [...state.flyers, ...response.data];

      state = state.copyWith(
        flyers: newFlyers,
        totalPages: totalPages == 0 ? 1 : totalPages,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }

  void search(String query) {
    state = state.copyWith(searchQuery: query, currentPage: 1, flyers: []);
    loadFlyers();
  }
}

final flyerListProvider =
    StateNotifierProvider<FlyerListNotifier, FlyerListState>((ref) {
      return FlyerListNotifier(ref.watch(flyerRepositoryProvider));
    });
