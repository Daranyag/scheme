import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SSE Line Splitter & Parser Tests', () {
    test('Correctly parses line split across TCP chunk boundaries', () {
      final chunk1 = 'data: {"text": "Hello, ';
      final chunk2 = 'this is part 2"}\n\ndata: [DONE]\n\n';

      String lineBuffer = '';
      final parsedTexts = <String>[];
      bool isDone = false;

      void processChunk(String chunk) {
        lineBuffer += chunk;
        while (lineBuffer.contains('\n')) {
          final idx = lineBuffer.indexOf('\n');
          final line = lineBuffer.substring(0, idx).trim();
          lineBuffer = lineBuffer.substring(idx + 1);

          if (line.startsWith('data: ')) {
            final dataStr = line.substring(6).trim();
            if (dataStr == '[DONE]') {
              isDone = true;
              break;
            }
            try {
              final json = jsonDecode(dataStr);
              if (json['text'] != null) {
                parsedTexts.add(json['text']);
              }
            } catch (_) {}
          }
        }
      }

      processChunk(chunk1);
      expect(parsedTexts, isEmpty); // line not complete yet

      processChunk(chunk2);
      expect(parsedTexts.length, 1);
      expect(parsedTexts.first, 'Hello, this is part 2');
      expect(isDone, isTrue);
    });

    test('Correctly parses error event from SSE stream', () {
      final errorStreamChunk = 'event: error\ndata: {"code": "ai_busy", "error": "Spikes in demand"}\n\n';

      String lineBuffer = errorStreamChunk;
      String? errorCode;

      while (lineBuffer.contains('\n')) {
        final idx = lineBuffer.indexOf('\n');
        final line = lineBuffer.substring(0, idx).trim();
        lineBuffer = lineBuffer.substring(idx + 1);

        if (line.startsWith('data: ')) {
          final dataStr = line.substring(6).trim();
          try {
            final json = jsonDecode(dataStr);
            if (json['code'] != null) {
              errorCode = json['code'];
            }
          } catch (_) {}
        }
      }

      expect(errorCode, 'ai_busy');
    });
  });

  group('Error Code Mapping User Messages', () {
    String mapErrorCodeToMessage(String code) {
      switch (code) {
        case 'server_unreachable':
          return "Can't reach the server. Check that the server is running and the address in settings is correct.";
        case 'timeout':
          return "The server took too long to reply. Please try again.";
        case 'ai_busy':
          return "The AI service is busy right now. Spikes in demand are temporary. Please try again in a minute.";
        case 'ai_key_invalid':
          return "The AI service is not set up correctly. (Developer: check GEMINI_API_KEY.)";
        case 'ai_model_not_found':
          return "The AI model name is wrong. (Developer: check the model setting.)";
        case 'rate_limited':
          return "Too many messages. Please wait a few seconds.";
        default:
          return "Something went wrong. Please try again.";
      }
    }

    test('Maps all server error codes to precise user messages', () {
      expect(mapErrorCodeToMessage('server_unreachable'), contains("Can't reach the server"));
      expect(mapErrorCodeToMessage('timeout'), contains('took too long to reply'));
      expect(mapErrorCodeToMessage('ai_busy'), contains('busy right now'));
      expect(mapErrorCodeToMessage('ai_key_invalid'), contains('GEMINI_API_KEY'));
      expect(mapErrorCodeToMessage('ai_model_not_found'), contains('model setting'));
      expect(mapErrorCodeToMessage('rate_limited'), contains('Too many messages'));
      expect(mapErrorCodeToMessage('other'), contains('Something went wrong'));
    });
  });
}
