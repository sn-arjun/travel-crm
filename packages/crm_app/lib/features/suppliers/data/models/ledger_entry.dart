import 'package:freezed_annotation/freezed_annotation.dart';

part 'ledger_entry.freezed.dart';
part 'ledger_entry.g.dart';

@freezed
abstract class LedgerEntry with _$LedgerEntry {
  const factory LedgerEntry({
    required String id,
    required String date,
    required String description,
    @Default(0.0) double debitAmount,
    @Default(0.0) double creditAmount,
    @Default(0.0) double runningBalance,
    required String entryType,
    @Default(false) bool isReconciled,
  }) = _LedgerEntry;

  factory LedgerEntry.fromJson(Map<String, dynamic> json) => _$LedgerEntryFromJson(json);
}
