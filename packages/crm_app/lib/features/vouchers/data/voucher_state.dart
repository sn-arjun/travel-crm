import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:shared/shared.dart';

import 'models/voucher.dart';

part 'voucher_state.freezed.dart';

enum VoucherListStatus { initial, loading, loaded, error }

@freezed
abstract class VoucherListState with _$VoucherListState {
  const factory VoucherListState({
    @Default(VoucherListStatus.initial) VoucherListStatus status,
    @Default([]) List<Voucher> vouchers,
    PaginationMeta? pagination,
    @Default('') String search,
    String? typeFilter,
    String? statusFilter,
    String? leadIdFilter,
    @Default(1) int currentPage,
    String? error,
  }) = _VoucherListState;

  const VoucherListState._();

  bool get hasMore =>
      pagination != null && currentPage < (pagination?.totalPages ?? 1);
}

enum VoucherDetailStatus { initial, loading, loaded, error }

@freezed
abstract class VoucherDetailState with _$VoucherDetailState {
  const factory VoucherDetailState({
    @Default(VoucherDetailStatus.initial) VoucherDetailStatus status,
    Voucher? voucher,
    String? error,
  }) = _VoucherDetailState;
}
