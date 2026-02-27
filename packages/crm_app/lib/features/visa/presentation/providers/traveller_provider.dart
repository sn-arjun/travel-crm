import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:freezed_annotation/freezed_annotation.dart';
import '../../data/models/traveller.dart';
import '../../data/repositories/traveller_repository.dart';

part 'traveller_provider.freezed.dart';

@freezed
abstract class TravellerListState with _$TravellerListState {
  const factory TravellerListState({
    @Default([]) List<Traveller> travellers,
    @Default(true) bool isLoading,
    String? error,
  }) = _TravellerListState;
}

class TravellerListNotifier extends StateNotifier<TravellerListState> {
  final TravellerRepository _repository;

  TravellerListNotifier(this._repository) : super(const TravellerListState()) {
    loadTravellers();
  }

  Future<void> loadTravellers({String? contactId, bool refresh = false}) async {
    if (!refresh && state.isLoading && state.travellers.isNotEmpty) return;

    state = state.copyWith(isLoading: true, error: null);

    try {
      final response = await _repository.getTravellers(contactId: contactId);
      
      state = state.copyWith(
        travellers: response.data,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        error: e.toString(),
        isLoading: false,
      );
    }
  }

  Future<void> deleteTraveller(String id) async {
    try {
      await _repository.deleteTraveller(id);
      loadTravellers(refresh: true);
    } catch (e) {
      throw Exception('Failed to delete traveller: $e');
    }
  }
}

final travellerListProvider =
    StateNotifierProvider<TravellerListNotifier, TravellerListState>((ref) {
  final repository = ref.watch(travellerRepositoryProvider);
  return TravellerListNotifier(repository);
});
