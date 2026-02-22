// Conditional export: web uses localStorage, native uses flutter_secure_storage.
export 'token_store_io.dart'
    if (dart.library.js_interop) 'token_store_web.dart';
