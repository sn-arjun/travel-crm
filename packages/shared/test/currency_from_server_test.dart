import 'package:flutter_test/flutter_test.dart';
import 'package:shared/shared.dart';

void main() {
  group('no hidden INR default (R136)', () {
    test('a lead keeps the currency the server sent and none when it sent none', () {
      final base = {'id': 'l1', 'contactId': 'c1', 'title': 'Texel', 'travelDate': '2027-01-15', 'tripType': 'domestic'};
      expect(LeadModel.fromJson({...base, 'currency': 'EUR'}).currency, 'EUR');
      expect(LeadModel.fromJson(base).currency, isNull);
    });

    test('an itinerary and its summary read their currency from the server', () {
      final itinerary = {'id': 'i1', 'leadId': 'l1', 'title': 'Plan'};
      expect(ItineraryModel.fromJson({...itinerary, 'currency': 'EUR'}).currency, 'EUR');
      expect(ItineraryModel.fromJson(itinerary).currency, isNull);
      expect(ItinerarySummary.fromJson({...itinerary, 'currency': 'GBP'}).currency, 'GBP');
      expect(ItinerarySummary.fromJson(itinerary).currency, isNull);
    });
  });
}
