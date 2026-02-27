import 'dart:convert';
import 'dart:io';

Future<void> setupTestDb() async {
  print('Running Setup Test DB...');
  try {
    // 10.0.2.2 is usually the Android emulator host IP pointing to the dev machine.
    // Fall back to localhost if not Android
    final url = Platform.isAndroid 
        ? 'http://10.0.2.2:8787/api/v1/test/reset' 
        : 'http://localhost:8787/api/v1/test/reset';
        
    final request = await HttpClient().postUrl(Uri.parse(url));
    final response = await request.close();
    
    if (response.statusCode == 200) {
      final responseBody = await response.transform(utf8.decoder).join();
      print('Test DB Reset Success: $responseBody');
    } else {
      final errorBody = await response.transform(utf8.decoder).join();
      print('Test DB Reset Failed (${response.statusCode}): $errorBody');
      throw Exception('Failed to reset DB');
    }
  } catch (e) {
    print('Error resetting test DB: $e');
    rethrow;
  }
}
