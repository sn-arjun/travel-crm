import 'package:flutter_test/flutter_test.dart';
import 'package:shared/shared.dart';

void main() {
  group('TripStop', () {
    test('parses a full stop from the driver API', () {
      final stop = TripStop.fromJson({
        'id': 's1',
        'tripId': 't1',
        'departureStopId': null,
        'sortOrder': 2,
        'name': 'Harbour Square',
        'address': '1 Quay Road',
        'lat': 52,
        'lng': 4.5,
        'scheduledAt': '2026-10-03T06:30:00.000Z',
        'documentsCheck': true,
        'status': 'arrived',
        'arrivedAt': '2026-10-03T06:28:00.000Z',
        'departedAt': null,
        'arrivedLat': null,
        'arrivedLng': null,
      });
      expect(stop.id, 's1');
      expect(stop.sortOrder, 2);
      expect(stop.lat, 52.0);
      expect(stop.documentsCheck, isTrue);
      expect(stop.status, 'arrived');
      expect(stop.departedAt, isNull);
    });

    test('fills defaults for a sparse stop', () {
      final stop = TripStop.fromJson({'id': 's2'});
      expect(stop.name, '');
      expect(stop.status, 'pending');
      expect(stop.documentsCheck, isFalse);
      expect(stop.lat, isNull);
    });
  });

  group('TripPassenger', () {
    test('parses a passenger with a tick', () {
      final p = TripPassenger.fromJson({
        'id': 'p1',
        'tripStopId': 's1',
        'name': 'Sam Visser',
        'seats': 2,
        'phone': null,
        'boarding': 'boarded',
        'boardedAt': '2026-10-03T06:31:00.000Z',
        'documentsChecked': true,
        'documentsCheckedAt': null,
      });
      expect(p.seats, 2);
      expect(p.boarding, 'boarded');
      expect(p.documentsChecked, isTrue);
      expect(p.phone, isNull);
    });

    test('defaults to one pending seat', () {
      final p = TripPassenger.fromJson({'id': 'p2', 'name': 'Alex'});
      expect(p.seats, 1);
      expect(p.boarding, 'pending');
      expect(p.documentsChecked, isFalse);
      expect(p.tripStopId, isNull);
    });
  });

  group('TripHeadcount', () {
    test('parses totals and the per stop split', () {
      final h = TripHeadcount.fromJson({
        'expected': 7,
        'boarded': 3,
        'noShow': 1,
        'pending': 3,
        'documentsChecked': 2,
        'byStop': [
          {
            'stopId': 's1',
            'name': 'Harbour Square',
            'sortOrder': 1,
            'expected': 4,
            'boarded': 3,
            'noShow': 1,
            'pending': 0,
          },
          {'stopId': null, 'name': null, 'expected': 3, 'pending': 3},
        ],
      });
      expect(h.expected, 7);
      expect(h.byStop, hasLength(2));
      expect(h.byStop.first.boarded, 3);
      expect(h.byStop.last.stopId, isNull);
    });

    test('an empty object is a zero head count', () {
      final h = TripHeadcount.fromJson({});
      expect(h.expected, 0);
      expect(h.byStop, isEmpty);
    });
  });
}
