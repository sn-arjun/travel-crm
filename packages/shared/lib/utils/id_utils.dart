import 'dart:math';

final _rng = Random.secure();
int _lastMs = 0;
int _counter = 0;

String _hex(int value, int width) => value.toRadixString(16).padLeft(width, '0');

/// Generate a UUIDv7 (time-sortable, globally unique).
///
/// UUIDv7 embeds a Unix timestamp in the first 48 bits,
/// providing natural chronological ordering in database indexes
/// and better B-tree locality in SQLite.
///
/// Ids are strictly increasing within this isolate, including several created
/// in the same millisecond: a 42-bit counter (RFC 9562 method 1, the 12-bit
/// rand_a field plus the top 30 bits of rand_b) is seeded randomly on a new
/// millisecond and incremented for each further id in that millisecond. If the
/// counter would overflow, or the clock steps backwards, the timestamp part is
/// held at the last value used so ordering is never broken.
String generateId() {
  final now = DateTime.now().millisecondsSinceEpoch;
  if (now > _lastMs) {
    _lastMs = now;
    // Leave the top bit clear so the counter has room to count up.
    _counter = _rng.nextInt(1 << 21) * (1 << 20) + _rng.nextInt(1 << 20);
  } else {
    _counter += 1;
    if (_counter >= 4398046511104) {
      _lastMs += 1;
      _counter = 0;
    }
  }

  final randA = _counter ~/ (1 << 30);
  final randBHigh = _counter % (1 << 30);
  final tail = _rng.nextInt(0x100000000); // 32 random bits
  // variant bits 10 + 30 counter bits = 32 bits, then 32 random bits.
  final varHigh = 0x80000000 + randBHigh; // top two bits are the variant, 10
  final msHex = _hex(_lastMs, 12);

  final b = StringBuffer()
    ..write(msHex.substring(0, 8))
    ..write('-')
    ..write(msHex.substring(8))
    ..write('-7')
    ..write(_hex(randA, 3))
    ..write('-')
    ..write(_hex(varHigh ~/ 65536, 4))
    ..write('-')
    ..write(_hex(varHigh % 65536, 4))
    ..write(_hex(tail, 8));
  return b.toString();
}
