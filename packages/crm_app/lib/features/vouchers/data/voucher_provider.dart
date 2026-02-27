import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../auth/data/auth_provider.dart';

import 'models/voucher.dart';
import 'repositories/voucher_repository.dart';
import 'voucher_state.dart';

final voucherRepositoryProvider = Provider<VoucherRepository>(
  (ref) => VoucherRepository(apiClient: ref.read(apiClientProvider)),
);

final voucherListProvider = StateNotifierProvider<VoucherListNotifier, VoucherListState>(
  (ref) => VoucherListNotifier(repository: ref.read(voucherRepositoryProvider)),
);

class VoucherListNotifier extends StateNotifier<VoucherListState> {
  final VoucherRepository _repository;

  VoucherListNotifier({required VoucherRepository repository})
      : _repository = repository,
        super(const VoucherListState());

  Future<void> load({bool refresh = false}) async {
    if (state.status == VoucherListStatus.loading) return;

    state = state.copyWith(
      status: VoucherListStatus.loading,
      vouchers: refresh ? [] : state.vouchers,
      currentPage: refresh ? 1 : state.currentPage,
    );

    try {
      final response = await _repository.getVouchers(
        page: state.currentPage,
        search: state.search,
        type: state.typeFilter,
        status: state.statusFilter,
        leadId: state.leadIdFilter,
      );

      state = state.copyWith(
        status: VoucherListStatus.loaded,
        vouchers: response.data,
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: VoucherListStatus.error,
        error: e is ApiException ? e.message : 'Failed to load vouchers',
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == VoucherListStatus.loading) return;

    state = state.copyWith(currentPage: state.currentPage + 1, status: VoucherListStatus.loading);

    try {
      final response = await _repository.getVouchers(
        page: state.currentPage,
        search: state.search,
        type: state.typeFilter,
        status: state.statusFilter,
        leadId: state.leadIdFilter,
      );

      state = state.copyWith(
        status: VoucherListStatus.loaded,
        vouchers: [...state.vouchers, ...(response.data as Iterable<Voucher>)],
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: VoucherListStatus.error,
        error: e is ApiException ? e.message : 'Failed to load next page',
      );
    }
  }

  void setSearch(String search) {
    state = state.copyWith(search: search, currentPage: 1);
    load(refresh: true);
  }

  void setFilter({String? type, String? status, String? leadId}) {
    state = state.copyWith(
      typeFilter: type,
      statusFilter: status,
      leadIdFilter: leadId,
      currentPage: 1,
    );
    load(refresh: true);
  }

  void clearFilters() {
    state = state.copyWith(
      typeFilter: null,
      statusFilter: null,
      leadIdFilter: null,
      search: '',
      currentPage: 1,
    );
    load(refresh: true);
  }
}

final voucherDetailProvider = StateNotifierProvider.family<VoucherDetailNotifier, VoucherDetailState, String>(
  (ref, id) => VoucherDetailNotifier(
    id: id,
    repository: ref.read(voucherRepositoryProvider),
  ),
);

class VoucherDetailNotifier extends StateNotifier<VoucherDetailState> {
  final String _id;
  final VoucherRepository _repository;

  VoucherDetailNotifier({required String id, required VoucherRepository repository})
      : _id = id,
        _repository = repository,
        super(const VoucherDetailState());

  Future<void> load() async {
    state = state.copyWith(status: VoucherDetailStatus.loading);
    try {
      final voucher = await _repository.getVoucher(_id);
      state = state.copyWith(status: VoucherDetailStatus.loaded, voucher: voucher);
    } catch (e) {
      state = state.copyWith(
        status: VoucherDetailStatus.error,
        error: e is ApiException ? e.message : 'Failed to load voucher',
      );
    }
  }

  Future<void> updateStatus(String status) async {
    try {
      await _repository.updateStatus(_id, status);
      // Reload the full voucher to get the updated state
      await load();
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Failed to update status',
      );
    }
  }
}
