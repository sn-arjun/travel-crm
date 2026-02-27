import 'dart:typed_data';

/// No-op stub for non-web platforms.
void triggerWebDownload(Uint8List bytes, String fileName, String mimeType) {
  // Not supported on non-web platforms
}
