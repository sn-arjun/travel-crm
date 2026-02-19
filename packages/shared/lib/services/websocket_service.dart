import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../constants/app_constants.dart';

class WebSocketService {
  WebSocketChannel? _channel;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  final _messageController = StreamController<Map<String, dynamic>>.broadcast();
  String? _authToken;
  bool _isConnected = false;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 10;

  Stream<Map<String, dynamic>> get messages => _messageController.stream;
  bool get isConnected => _isConnected;

  void connect(String authToken) {
    _authToken = authToken;
    _reconnectAttempts = 0;
    _doConnect();
  }

  void _doConnect() {
    if (_authToken == null) return;

    final wsUrl = AppConstants.apiBaseUrl
        .replaceFirst('http://', 'ws://')
        .replaceFirst('https://', 'wss://');

    try {
      _channel = WebSocketChannel.connect(
        Uri.parse('$wsUrl/api/v1/ws?token=$_authToken'),
      );

      _channel!.stream.listen(
        (data) {
          _isConnected = true;
          _reconnectAttempts = 0;
          try {
            final message = jsonDecode(data as String) as Map<String, dynamic>;
            if (message['type'] != 'pong') {
              _messageController.add(message);
            }
          } catch (e) {
            debugPrint('[WS] Failed to parse message: $e');
          }
        },
        onDone: () {
          _isConnected = false;
          _scheduleReconnect();
        },
        onError: (error) {
          _isConnected = false;
          debugPrint('[WS] Error: $error');
          _scheduleReconnect();
        },
      );

      _startHeartbeat();
    } catch (e) {
      debugPrint('[WS] Connection failed: $e');
      _scheduleReconnect();
    }
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      send({'type': 'ping'});
    });
  }

  void _scheduleReconnect() {
    _heartbeatTimer?.cancel();
    if (_reconnectAttempts >= _maxReconnectAttempts) {
      debugPrint('[WS] Max reconnect attempts reached');
      return;
    }

    final delay = Duration(seconds: (1 << _reconnectAttempts).clamp(1, 30));
    _reconnectAttempts++;
    debugPrint('[WS] Reconnecting in ${delay.inSeconds}s (attempt $_reconnectAttempts)');

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, _doConnect);
  }

  void send(Map<String, dynamic> message) {
    if (_channel != null && _isConnected) {
      _channel!.sink.add(jsonEncode(message));
    }
  }

  void disconnect() {
    _heartbeatTimer?.cancel();
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _isConnected = false;
  }

  void dispose() {
    disconnect();
    _messageController.close();
  }
}
