import 'package:flutter_test/flutter_test.dart';
import 'package:shared/shared.dart';

void main() {
  // ══════════════════════════════════════════════════════════════
  // ID Utils
  // ══════════════════════════════════════════════════════════════
  group('ID Utils', () {
    test('generateId returns a valid UUIDv7 string', () {
      final id = generateId();
      expect(id.length, 36);
      expect(id.contains('-'), isTrue);
      // UUIDv7 format: 8-4-4-4-12
      final parts = id.split('-');
      expect(parts.length, 5);
      expect(parts[0].length, 8);
      expect(parts[1].length, 4);
      expect(parts[2].length, 4);
      expect(parts[3].length, 4);
      expect(parts[4].length, 12);
    });

    test('generateId produces unique values', () {
      final ids = List.generate(100, (_) => generateId());
      final unique = ids.toSet();
      expect(unique.length, 100);
    });

    test('generateId produces time-sortable IDs', () {
      final id1 = generateId();
      final id2 = generateId();
      expect(id1.compareTo(id2), lessThanOrEqualTo(0));
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Validators
  // ══════════════════════════════════════════════════════════════
  group('Validators', () {
    group('required', () {
      test('returns error for null', () {
        expect(Validators.required(null), isNotNull);
      });

      test('returns error for empty string', () {
        expect(Validators.required(''), isNotNull);
      });

      test('returns error for whitespace only', () {
        expect(Validators.required('   '), isNotNull);
      });

      test('returns null for valid input', () {
        expect(Validators.required('hello'), isNull);
      });

      test('uses custom field name in error message', () {
        final error = Validators.required(null, 'Name');
        expect(error, contains('Name'));
      });
    });

    group('email', () {
      test('returns error for null', () {
        expect(Validators.email(null), isNotNull);
      });

      test('returns error for empty string', () {
        expect(Validators.email(''), isNotNull);
      });

      test('returns error for invalid email', () {
        expect(Validators.email('invalid'), isNotNull);
        expect(Validators.email('user@'), isNotNull);
        expect(Validators.email('@domain.com'), isNotNull);
      });

      test('returns null for valid email', () {
        expect(Validators.email('user@example.com'), isNull);
        expect(Validators.email('test.user@domain.co.in'), isNull);
        expect(Validators.email('user+tag@example.com'), isNull);
      });
    });

    group('phone', () {
      test('returns null for null (optional)', () {
        expect(Validators.phone(null), isNull);
      });

      test('returns null for empty (optional)', () {
        expect(Validators.phone(''), isNull);
      });

      test('returns error for too short phone', () {
        expect(Validators.phone('12345'), isNotNull);
      });

      test('returns null for valid phone', () {
        expect(Validators.phone('+919876543210'), isNull);
        expect(Validators.phone('1234567890'), isNull);
      });
    });

    group('password', () {
      test('returns error for null', () {
        expect(Validators.password(null), isNotNull);
      });

      test('returns error for empty', () {
        expect(Validators.password(''), isNotNull);
      });

      test('returns error for short password', () {
        expect(Validators.password('Ab1!'), isNotNull);
      });

      test('returns error for no uppercase', () {
        expect(Validators.password('abcdefg1!'), isNotNull);
      });

      test('returns error for no lowercase', () {
        expect(Validators.password('ABCDEFG1!'), isNotNull);
      });

      test('returns error for no number', () {
        expect(Validators.password('Abcdefgh!'), isNotNull);
      });

      test('returns error for no special character', () {
        expect(Validators.password('Abcdefg1'), isNotNull);
      });

      test('returns null for strong password', () {
        expect(Validators.password('Admin@123'), isNull);
        expect(Validators.password('P@ssw0rd!'), isNull);
      });
    });

    group('number', () {
      test('returns null for null (optional)', () {
        expect(Validators.number(null), isNull);
      });

      test('returns error for non-numeric', () {
        expect(Validators.number('abc'), isNotNull);
      });

      test('returns null for valid numbers', () {
        expect(Validators.number('123'), isNull);
        expect(Validators.number('12.5'), isNull);
        expect(Validators.number('-10'), isNull);
      });
    });

    group('positiveNumber', () {
      test('returns error for negative', () {
        expect(Validators.positiveNumber('-5'), isNotNull);
      });

      test('returns null for zero', () {
        expect(Validators.positiveNumber('0'), isNull);
      });

      test('returns null for positive', () {
        expect(Validators.positiveNumber('100'), isNull);
      });
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Date Utils
  // ══════════════════════════════════════════════════════════════
  group('AppDateUtils', () {
    test('parse returns null for null', () {
      expect(AppDateUtils.parse(null), isNull);
    });

    test('parse returns null for empty', () {
      expect(AppDateUtils.parse(''), isNull);
    });

    test('parse returns DateTime for valid ISO', () {
      final result = AppDateUtils.parse('2026-02-22T10:00:00Z');
      expect(result, isNotNull);
      expect(result!.year, 2026);
      expect(result.month, 2);
      expect(result.day, 22);
    });

    test('parse returns null for invalid string', () {
      expect(AppDateUtils.parse('not-a-date'), isNull);
    });

    test('toIso returns UTC ISO 8601', () {
      final date = DateTime(2026, 2, 22, 10, 30);
      final iso = AppDateUtils.toIso(date);
      expect(iso, contains('2026-02-22'));
      expect(iso, endsWith('Z'));
    });

    test('formatDate formats dd/MM/yyyy', () {
      final date = DateTime(2026, 2, 22);
      expect(AppDateUtils.formatDate(date), '22/02/2026');
    });

    test('formatDate returns empty for null', () {
      expect(AppDateUtils.formatDate(null), '');
    });

    test('timeAgo returns just now for recent', () {
      final now = DateTime.now().toUtc();
      expect(AppDateUtils.timeAgo(now), 'just now');
    });

    test('timeAgo returns minutes', () {
      final fiveMin = DateTime.now().toUtc().subtract(const Duration(minutes: 5));
      expect(AppDateUtils.timeAgo(fiveMin), '5m ago');
    });

    test('timeAgo returns hours', () {
      final threeH = DateTime.now().toUtc().subtract(const Duration(hours: 3));
      expect(AppDateUtils.timeAgo(threeH), '3h ago');
    });

    test('timeAgo returns days', () {
      final twoD = DateTime.now().toUtc().subtract(const Duration(days: 2));
      expect(AppDateUtils.timeAgo(twoD), '2d ago');
    });

    test('timeAgo returns empty for null', () {
      expect(AppDateUtils.timeAgo(null), '');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Currency Utils
  // ══════════════════════════════════════════════════════════════
  group('CurrencyUtils', () {
    test('format INR with rupee symbol', () {
      final result = CurrencyUtils.format(100000.50);
      expect(result, contains('\u20B9'));
    });

    test('format USD with dollar symbol', () {
      final result = CurrencyUtils.format(1000.00, currency: 'USD');
      expect(result, contains('\$'));
    });

    test('formatCompact shows K for thousands', () {
      final result = CurrencyUtils.formatCompact(5000.0);
      expect(result, contains('K'));
    });

    test('formatCompact shows L for lakhs', () {
      final result = CurrencyUtils.formatCompact(500000.0);
      expect(result, contains('L'));
    });

    test('formatCompact shows Cr for crores', () {
      final result = CurrencyUtils.formatCompact(10000000.0);
      expect(result, contains('Cr'));
    });
  });

  // ══════════════════════════════════════════════════════════════
  // API Exception
  // ══════════════════════════════════════════════════════════════
  group('ApiException', () {
    test('isUnauthorized for 401', () {
      const ex = ApiException(message: 'Unauthorized', statusCode: 401);
      expect(ex.isUnauthorized, isTrue);
      expect(ex.isForbidden, isFalse);
    });

    test('isForbidden for 403', () {
      const ex = ApiException(message: 'Forbidden', statusCode: 403);
      expect(ex.isForbidden, isTrue);
    });

    test('isNotFound for 404', () {
      const ex = ApiException(message: 'Not Found', statusCode: 404);
      expect(ex.isNotFound, isTrue);
    });

    test('isServerError for 500+', () {
      const ex = ApiException(message: 'Error', statusCode: 500);
      expect(ex.isServerError, isTrue);
    });

    test('isServerError false for client errors', () {
      const ex = ApiException(message: 'Error', statusCode: 400);
      expect(ex.isServerError, isFalse);
    });

    test('toString includes code and message', () {
      const ex = ApiException(message: 'Test', statusCode: 404);
      expect(ex.toString(), contains('404'));
      expect(ex.toString(), contains('Test'));
    });

    test('NetworkException default message', () {
      const ex = NetworkException();
      expect(ex.message, contains('internet'));
    });

    test('TimeoutException default message', () {
      const ex = TimeoutException();
      expect(ex.message, contains('timed out'));
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Contact Model
  // ══════════════════════════════════════════════════════════════
  group('ContactModel', () {
    test('fromJson with required fields', () {
      final json = {'id': 'id1', 'name': 'John', 'type': 'customer'};
      final contact = ContactModel.fromJson(json);
      expect(contact.id, 'id1');
      expect(contact.name, 'John');
      expect(contact.type, 'customer');
    });

    test('optional fields are null', () {
      final json = {'id': 'id1', 'name': 'Test', 'type': 'lead'};
      final contact = ContactModel.fromJson(json);
      expect(contact.email, isNull);
      expect(contact.phone, isNull);
      expect(contact.company, isNull);
    });

    test('defaults tags to empty list', () {
      final json = {'id': 'id', 'name': 'T', 'type': 'lead'};
      final contact = ContactModel.fromJson(json);
      expect(contact.tags, isEmpty);
    });

    test('defaults preferredLanguage to en', () {
      final json = {'id': 'id', 'name': 'T', 'type': 'lead'};
      final contact = ContactModel.fromJson(json);
      expect(contact.preferredLanguage, 'en');
    });

    test('toJson round-trips correctly', () {
      const contact = ContactModel(
        id: 'id', name: 'Test', type: 'customer', email: 'a@b.com',
      );
      final json = contact.toJson();
      final restored = ContactModel.fromJson(json);
      expect(restored, equals(contact));
    });

    test('copyWith creates modified copy', () {
      const contact = ContactModel(id: 'id', name: 'Test', type: 'customer');
      final updated = contact.copyWith(name: 'Updated');
      expect(updated.name, 'Updated');
      expect(updated.id, 'id');
    });

    test('equality', () {
      const a = ContactModel(id: 'id', name: 'Test', type: 'customer');
      const b = ContactModel(id: 'id', name: 'Test', type: 'customer');
      expect(a, equals(b));
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Lead Model
  // ══════════════════════════════════════════════════════════════
  group('LeadModel', () {
    final baseJson = {
      'id': 'lead-1',
      'contactId': 'c1',
      'title': 'Trip',
      'travelDate': '2026-03-15',
      'tripType': 'international',
      'source': 'website',
    };

    test('fromJson with required fields', () {
      final lead = LeadModel.fromJson(baseJson);
      expect(lead.id, 'lead-1');
      expect(lead.title, 'Trip');
    });

    test('destinations from JSON string', () {
      final json = {...baseJson, 'destinations': '["Bali","Singapore"]'};
      final lead = LeadModel.fromJson(json);
      expect(lead.destinations, ['Bali', 'Singapore']);
    });

    test('destinations from list', () {
      final json = {...baseJson, 'destinations': ['Bali']};
      final lead = LeadModel.fromJson(json);
      expect(lead.destinations, ['Bali']);
    });

    test('destinations null returns empty', () {
      final json = {...baseJson, 'destinations': null};
      final lead = LeadModel.fromJson(json);
      expect(lead.destinations, isEmpty);
    });

    test('destinations empty string returns empty', () {
      final json = {...baseJson, 'destinations': ''};
      final lead = LeadModel.fromJson(json);
      expect(lead.destinations, isEmpty);
    });

    test('defaults applied', () {
      final lead = LeadModel.fromJson(baseJson);
      expect(lead.paxAdults, 1);
      expect(lead.paxChildren, 0);
      expect(lead.paxInfants, 0);
      expect(lead.currency, 'INR');
      expect(lead.status, 'new');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // LeadStatus Enum
  // ══════════════════════════════════════════════════════════════
  group('LeadStatus', () {
    test('apiValue maps correctly', () {
      expect(LeadStatus.new_.apiValue, 'new');
      expect(LeadStatus.contacted.apiValue, 'contacted');
      expect(LeadStatus.requirementGathered.apiValue, 'requirement_gathered');
      expect(LeadStatus.proposalSent.apiValue, 'proposal_sent');
      expect(LeadStatus.bookingConfirmed.apiValue, 'booking_confirmed');
      expect(LeadStatus.lost.apiValue, 'lost');
    });

    test('labels are human-readable', () {
      expect(LeadStatus.new_.label, 'New');
      expect(LeadStatus.requirementGathered.label, 'Requirement Gathered');
    });

    test('fromApiValue round-trips', () {
      for (final status in LeadStatus.values) {
        expect(LeadStatus.fromApiValue(status.apiValue), status);
      }
    });

    test('fromApiValue defaults for unknown', () {
      expect(LeadStatus.fromApiValue('xyz'), LeadStatus.new_);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // PaginationMeta
  // ══════════════════════════════════════════════════════════════
  group('PaginationMeta', () {
    test('fromJson', () {
      final json = {
        'total': 100, 'page': 1, 'limit': 20,
        'totalPages': 5, 'hasMore': true,
      };
      final p = PaginationMeta.fromJson(json);
      expect(p.total, 100);
      expect(p.page, 1);
      expect(p.hasMore, isTrue);
    });

    test('defaults hasMore to false', () {
      final json = {'total': 0, 'page': 1, 'limit': 20, 'totalPages': 0};
      final p = PaginationMeta.fromJson(json);
      expect(p.hasMore, isFalse);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // API Endpoints
  // ══════════════════════════════════════════════════════════════
  group('ApiEndpoints', () {
    test('base endpoints', () {
      expect(ApiEndpoints.login, contains('/auth/login'));
      expect(ApiEndpoints.contacts, contains('/contacts'));
      expect(ApiEndpoints.leads, contains('/leads'));
      expect(ApiEndpoints.invoices, contains('/invoices'));
    });

    test('parameterized endpoints', () {
      expect(ApiEndpoints.contact('123'), contains('/contacts/123'));
      expect(ApiEndpoints.lead('abc'), contains('/leads/abc'));
    });

    test('nested endpoints', () {
      expect(ApiEndpoints.leadFollowUps('l1'), contains('/leads/l1/follow-ups'));
      expect(ApiEndpoints.leadNotes('l1'), contains('/leads/l1/notes'));
    });
  });
}
