import 'package:uuid/uuid.dart';

const _uuid = Uuid();

/// Generate a UUIDv7 (time-sortable, globally unique).
///
/// UUIDv7 embeds a Unix timestamp in the first 48 bits,
/// providing natural chronological ordering in database indexes
/// and better B-tree locality in SQLite.
String generateId() => _uuid.v7();
