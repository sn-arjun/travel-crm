class TripListState {
  final bool isLoading;
  final List<Map<String, dynamic>> trips;
  final String? error;
  final bool hasMore;

  /// Last page successfully loaded (0 = nothing loaded yet).
  final int page;

  const TripListState({
    this.isLoading = false,
    this.trips = const [],
    this.error,
    this.hasMore = true,
    this.page = 0,
  });

  TripListState copyWith({
    bool? isLoading,
    List<Map<String, dynamic>>? trips,
    String? error,
    bool? hasMore,
    int? page,
  }) {
    return TripListState(
      isLoading: isLoading ?? this.isLoading,
      trips: trips ?? this.trips,
      error: error,
      hasMore: hasMore ?? this.hasMore,
      page: page ?? this.page,
    );
  }
}

class TripDetailState {
  final bool isLoading;
  final Map<String, dynamic>? trip;
  final String? error;
  final bool isActionLoading;

  const TripDetailState({
    this.isLoading = false,
    this.trip,
    this.error,
    this.isActionLoading = false,
  });

  TripDetailState copyWith({
    bool? isLoading,
    Map<String, dynamic>? trip,
    String? error,
    bool? isActionLoading,
  }) {
    return TripDetailState(
      isLoading: isLoading ?? this.isLoading,
      trip: trip ?? this.trip,
      error: error,
      isActionLoading: isActionLoading ?? this.isActionLoading,
    );
  }
}
