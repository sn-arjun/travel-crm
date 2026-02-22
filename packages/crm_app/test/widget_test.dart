import 'package:flutter_test/flutter_test.dart';
import 'package:crm_app/features/auth/data/auth_state.dart';
import 'package:crm_app/features/invoices/data/invoice_state.dart';

void main() {
  // ══════════════════════════════════════════════════════════════
  // Auth State Tests
  // ══════════════════════════════════════════════════════════════
  group('AuthState', () {
    test('initial state has correct defaults', () {
      const state = AuthState();
      expect(state.status, AuthStatus.initial);
      expect(state.user, isNull);
      expect(state.tenants, isNull);
      expect(state.selectedTenant, isNull);
      expect(state.email, isNull);
      expect(state.error, isNull);
    });

    test('copyWith updates specific fields', () {
      const state = AuthState();
      final updated = state.copyWith(
        status: AuthStatus.loading,
        email: 'test@example.com',
      );
      expect(updated.status, AuthStatus.loading);
      expect(updated.email, 'test@example.com');
      expect(updated.user, isNull);
    });

    test('copyWith preserves existing fields', () {
      const state = AuthState(
        status: AuthStatus.authenticated,
        email: 'test@example.com',
      );
      final updated = state.copyWith(status: AuthStatus.loading);
      expect(updated.status, AuthStatus.loading);
      expect(updated.email, 'test@example.com');
    });

    test('clearError removes error but preserves state', () {
      const state = AuthState(
        status: AuthStatus.unauthenticated,
        email: 'test@example.com',
        error: 'Invalid password',
      );
      final cleared = state.clearError();
      expect(cleared.error, isNull);
      expect(cleared.email, 'test@example.com');
      expect(cleared.status, AuthStatus.unauthenticated);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Invoice List State Tests
  // ══════════════════════════════════════════════════════════════
  group('InvoiceListState', () {
    test('initial state has correct defaults', () {
      const state = InvoiceListState();
      expect(state.status, InvoiceListStatus.initial);
      expect(state.invoices, isEmpty);
      expect(state.pagination, isNull);
      expect(state.search, '');
      expect(state.statusFilter, isNull);
      expect(state.typeFilter, isNull);
      expect(state.sortBy, 'createdAt');
      expect(state.sortOrder, 'desc');
      expect(state.selectedIds, isEmpty);
      expect(state.totalOutstanding, 0);
      expect(state.totalOverdue, 0);
      expect(state.totalPaidThisMonth, 0);
    });

    test('copyWith updates fields', () {
      const state = InvoiceListState();
      final updated = state.copyWith(
        status: InvoiceListStatus.loaded,
        search: 'INV-001',
        statusFilter: 'paid',
      );
      expect(updated.status, InvoiceListStatus.loaded);
      expect(updated.search, 'INV-001');
      expect(updated.statusFilter, 'paid');
    });

    test('clearFilters resets filter fields', () {
      const state = InvoiceListState(
        statusFilter: 'draft',
        typeFilter: 'tax_invoice',
        startDate: null,
        endDate: null,
      );
      final cleared = state.copyWith(clearFilters: true);
      expect(cleared.statusFilter, isNull);
      expect(cleared.typeFilter, isNull);
      expect(cleared.startDate, isNull);
      expect(cleared.endDate, isNull);
    });

    test('hasMore delegates to pagination', () {
      const state = InvoiceListState();
      expect(state.hasMore, isFalse);
    });

    test('currentPage defaults to 1', () {
      const state = InvoiceListState();
      expect(state.currentPage, 1);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Invoice Detail State Tests
  // ══════════════════════════════════════════════════════════════
  group('InvoiceDetailState', () {
    test('initial state', () {
      const state = InvoiceDetailState();
      expect(state.status, InvoiceDetailStatus.initial);
      expect(state.invoice, isNull);
      expect(state.payments, isEmpty);
      expect(state.error, isNull);
    });

    test('balanceDue calculates correctly', () {
      const state = InvoiceDetailState(
        invoice: {'total': 118000, 'paidAmount': 50000},
      );
      expect(state.balanceDue, 68000.0);
    });

    test('balanceDue handles zero payment', () {
      const state = InvoiceDetailState(
        invoice: {'total': 100000, 'paidAmount': 0},
      );
      expect(state.balanceDue, 100000.0);
    });

    test('balanceDue handles full payment', () {
      const state = InvoiceDetailState(
        invoice: {'total': 50000, 'paidAmount': 50000},
      );
      expect(state.balanceDue, 0.0);
    });

    test('balanceDue returns 0 when invoice is null', () {
      const state = InvoiceDetailState();
      expect(state.balanceDue, 0.0);
    });

    test('balanceDue handles missing paidAmount', () {
      const state = InvoiceDetailState(
        invoice: {'total': 100000},
      );
      expect(state.balanceDue, 100000.0);
    });

    test('balanceDue handles missing total', () {
      const state = InvoiceDetailState(
        invoice: {'paidAmount': 50000},
      );
      expect(state.balanceDue, -50000.0);
    });

    test('balanceDue handles integer values', () {
      const state = InvoiceDetailState(
        invoice: {'total': 100, 'paidAmount': 30},
      );
      expect(state.balanceDue, 70.0);
    });

    test('copyWith preserves existing data', () {
      const state = InvoiceDetailState(
        status: InvoiceDetailStatus.loaded,
        invoice: {'total': 100},
        payments: [{'id': 'p1'}],
      );
      final updated = state.copyWith(
        error: 'Something went wrong',
      );
      expect(updated.invoice, isNotNull);
      expect(updated.payments.length, 1);
      expect(updated.error, 'Something went wrong');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Payment List State Tests
  // ══════════════════════════════════════════════════════════════
  group('PaymentListState', () {
    test('initial state', () {
      const state = PaymentListState();
      expect(state.status, InvoiceListStatus.initial);
      expect(state.payments, isEmpty);
      expect(state.search, '');
      expect(state.sortBy, 'createdAt');
      expect(state.sortOrder, 'desc');
    });

    test('clearFilters resets filter fields', () {
      const state = PaymentListState(
        typeFilter: 'bank_transfer',
        methodFilter: 'upi',
      );
      final cleared = state.copyWith(clearFilters: true);
      expect(cleared.typeFilter, isNull);
      expect(cleared.methodFilter, isNull);
    });

    test('hasMore defaults to false', () {
      const state = PaymentListState();
      expect(state.hasMore, isFalse);
    });

    test('currentPage defaults to 1', () {
      const state = PaymentListState();
      expect(state.currentPage, 1);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Auth Status Enum Tests
  // ══════════════════════════════════════════════════════════════
  group('AuthStatus', () {
    test('has all expected values', () {
      expect(AuthStatus.values, contains(AuthStatus.initial));
      expect(AuthStatus.values, contains(AuthStatus.loading));
      expect(AuthStatus.values, contains(AuthStatus.unauthenticated));
      expect(AuthStatus.values, contains(AuthStatus.tenantResolved));
      expect(AuthStatus.values, contains(AuthStatus.authenticated));
      expect(AuthStatus.values.length, 5);
    });
  });
}
