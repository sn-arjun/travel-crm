import 'package:flutter_test/flutter_test.dart';
import 'package:shared/shared.dart';

void main() {
  test('UUIDv7 generates valid IDs', () {
    final id = generateId();
    expect(id.length, equals(36));
    expect(id.contains('-'), isTrue);
  });
}
