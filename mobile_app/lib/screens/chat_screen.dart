import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../models/user_profile.dart';
import '../services/api_service.dart';
import '../services/dio_client.dart';

class ChatMessage {
  final String role; // 'user' or 'model'
  String text;
  final DateTime timestamp;
  bool isError;
  String? errorCode;
  String? retryText;

  ChatMessage({
    required this.role,
    required this.text,
    DateTime? timestamp,
    this.isError = false,
    this.errorCode,
    this.retryText,
  }) : timestamp = timestamp ?? DateTime.now();
}

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final List<ChatMessage> _messages = [];
  final TextEditingController _inputController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _isSending = false;
  String? _lastUserPrompt;

  final List<String> _quickPrompts = [
    'Which pension can I get?',
    'Documents needed for Old Age Pension',
    'How to apply for Pudhumai Penn?',
    'உதவித்தொகை திட்டங்கள் என்னென்ன?',
  ];

  @override
  void initState() {
    super.initState();
    _messages.add(
      ChatMessage(
        role: 'model',
        text: 'வணக்கம்! (Hello!) I am your TN Schemes & Pensions AI Assistant. Ask me any question about Tamil Nadu government welfare schemes, pensions, documents, or application procedures in Tamil or English.',
      ),
    );
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  String _mapErrorCodeToMessage(String code, [String? techDetail]) {
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
        if (kDebugMode && techDetail != null && techDetail.isNotEmpty) {
          return "Something went wrong. Please try again.\n[Debug: $techDetail]";
        }
        return "Something went wrong. Please try again.";
    }
  }

  Future<void> _sendMessage([String? textOverride]) async {
    final text = textOverride ?? _inputController.text.trim();
    if (text.isEmpty || _isSending) return;

    _lastUserPrompt = text;

    if (textOverride == null) {
      _inputController.clear();
    }

    setState(() {
      _messages.add(ChatMessage(role: 'user', text: text));
      _isSending = true;
    });
    _scrollToBottom();

    final assistantMsg = ChatMessage(role: 'model', text: '');
    setState(() {
      _messages.add(assistantMsg);
    });

    final profile = await UserProfile.loadFromPrefs();
    final payload = {
      'messages': _messages
          .where((m) => m.text.isNotEmpty && m != assistantMsg && !m.isError)
          .map((m) => {'role': m.role, 'text': m.text})
          .toList(),
      'profile': profile.toJson(),
      'eligibleSchemes': [
        'Kalaignar Magalir Urimai Thogai',
        'Old Age Pension (IGNOAPS / TN)',
        'Destitute Widow Pension',
        'CMCHIS'
      ],
    };

    bool streamSucceeded = false;

    // 1. Try Streaming SSE on non-web platforms
    if (!kIsWeb) {
      try {
        final response = await DioClient.dio.post<ResponseBody>(
          '/api/chat',
          data: payload,
          options: Options(
            responseType: ResponseType.stream,
            receiveTimeout: const Duration(seconds: 120),
            connectTimeout: const Duration(seconds: 15),
          ),
        );

        if (response.statusCode == 200 && response.data != null) {
          final stream = response.data!.stream;
          String lineBuffer = '';

          await for (final chunk in stream) {
            final decoded = utf8.decode(chunk);
            lineBuffer += decoded;

            while (lineBuffer.contains('\n')) {
              final idx = lineBuffer.indexOf('\n');
              final line = lineBuffer.substring(0, idx).trim();
              lineBuffer = lineBuffer.substring(idx + 1);

              if (line.startsWith('data: ')) {
                final dataStr = line.substring(6).trim();
                if (dataStr == '[DONE]') {
                  streamSucceeded = true;
                  break;
                }

                try {
                  final json = jsonDecode(dataStr);
                  if (json['text'] != null) {
                    setState(() {
                      assistantMsg.text += json['text'];
                    });
                    _scrollToBottom();
                  } else if (json['error'] != null) {
                    if (json['isPlainLookup'] == true && json['answer'] != null) {
                      setState(() {
                        assistantMsg.text = json['answer'];
                        assistantMsg.isError = false;
                      });
                      streamSucceeded = true;
                    } else {
                      final errCode = json['code'] ?? 'other';
                      _setErrorOnMessage(assistantMsg, errCode, text, json['error']);
                      streamSucceeded = false;
                    }
                    break;
                  }
                } catch (_) {}
              } else if (line.startsWith('event: error')) {
                // error event follows
              }
            }
          }

          if (assistantMsg.text.isNotEmpty && !assistantMsg.isError) {
            streamSucceeded = true;
          }
        }
      } on DioException catch (dioErr) {
        debugPrint('[ChatScreen] Streaming Dio error: ${dioErr.type} - ${dioErr.message}');
      } catch (e) {
        debugPrint('[ChatScreen] Streaming generic error: $e');
      }
    }

    // 2. If streaming failed or running on web, fallback to non-streaming /api/chat/simple
    if (!streamSucceeded) {
      debugPrint('[ChatScreen] Falling back to NON-STREAMING /api/chat/simple endpoint...');
      try {
        final res = await DioClient.dio.post(
          '/api/chat/simple',
          data: payload,
          options: Options(
            receiveTimeout: const Duration(seconds: 120),
            connectTimeout: const Duration(seconds: 15),
          ),
        );

        if (res.statusCode == 200 && res.data != null) {
          final answer = res.data['answer'] ?? '';
          setState(() {
            assistantMsg.text = answer;
            assistantMsg.isError = false;
          });
          _scrollToBottom();
        } else if (res.data?['isPlainLookup'] == true && res.data?['answer'] != null) {
          setState(() {
            assistantMsg.text = res.data!['answer'];
            assistantMsg.isError = false;
          });
          _scrollToBottom();
        } else {
          final code = res.data?['code'] ?? 'other';
          final msg = res.data?['error'] ?? 'Server error';
          _setErrorOnMessage(assistantMsg, code, text, msg);
        }
      } on DioException catch (dioErr) {
        String code = 'other';
        bool skipError = false;
        if (dioErr.response?.data is Map && dioErr.response?.data['code'] != null) {
          if (dioErr.response?.data['isPlainLookup'] == true && dioErr.response?.data['answer'] != null) {
            setState(() {
              assistantMsg.text = dioErr.response!.data['answer'];
              assistantMsg.isError = false;
            });
            _scrollToBottom();
            skipError = true;
          }
          code = dioErr.response!.data['code'];
        } else if (dioErr.type == DioExceptionType.connectionError ||
            dioErr.type == DioExceptionType.connectionTimeout) {
          code = 'server_unreachable';
        } else if (dioErr.type == DioExceptionType.receiveTimeout ||
            dioErr.type == DioExceptionType.sendTimeout) {
          code = 'timeout';
        } else if (dioErr.response?.statusCode == 429) {
          code = 'rate_limited';
        } else if (dioErr.response?.statusCode == 503) {
          code = 'ai_busy';
        }
        if (!skipError) {
          _setErrorOnMessage(assistantMsg, code, text, dioErr.message ?? dioErr.toString());
        }
      } catch (e) {
        _setErrorOnMessage(assistantMsg, 'other', text, e.toString());
      }
    }

    setState(() {
      _isSending = false;
    });
    _scrollToBottom();
  }

  void _setErrorOnMessage(ChatMessage msg, String code, String userQuery, String techDetail) {
    setState(() {
      msg.isError = true;
      msg.errorCode = code;
      msg.retryText = userQuery;
      msg.text = _mapErrorCodeToMessage(code, techDetail);
    });
  }

  void _showServerSettingsDialog() {
    final controller = TextEditingController(text: ApiService.baseUrl);
    bool testing = false;
    String? testResult;
    bool isSuccess = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.settings, color: Color(0xFF1E3A8A)),
              SizedBox(width: 8),
              Text('Server Settings & Test'),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Current Base URL:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                const SizedBox(height: 6),
                TextField(
                  controller: controller,
                  decoration: const InputDecoration(
                    labelText: 'Server Address',
                    border: OutlineInputBorder(),
                    hintText: 'http://192.168.1.x:3000',
                  ),
                ),
                const SizedBox(height: 12),
                if (testResult != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: isSuccess ? Colors.green.shade50 : Colors.red.shade50,
                      border: Border.all(color: isSuccess ? Colors.green : Colors.red),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      testResult!,
                      style: TextStyle(
                        color: isSuccess ? Colors.green.shade900 : Colors.red.shade900,
                        fontSize: 12.5,
                      ),
                    ),
                  ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  onPressed: testing
                      ? null
                      : () async {
                          setDialogState(() {
                            testing = true;
                            testResult = 'Testing connection to ${controller.text.trim()}...';
                          });
                          await ApiService.setCustomServerAddress(controller.text.trim());
                          final result = await ApiService.testConnection();
                          setDialogState(() {
                            testing = false;
                            isSuccess = result['success'] == true;
                            if (isSuccess) {
                              testResult = '✅ Connected successfully! (${result['durationMs']}ms)';
                            } else {
                              testResult = '❌ Connection failed: [${result['errorType']}] ${result['message']}';
                            }
                          });
                        },
                  icon: testing
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.flash_on),
                  label: const Text('Connection Test'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () async {
                await ApiService.setCustomServerAddress(null);
                controller.text = ApiService.baseUrl;
                setDialogState(() {
                  testResult = 'Reset to default base URL';
                  isSuccess = true;
                });
              },
              child: const Text('Reset Default'),
            ),
            ElevatedButton(
              onPressed: () async {
                await ApiService.setCustomServerAddress(controller.text.trim());
                Navigator.pop(ctx);
              },
              child: const Text('Save Address'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Assistant'),
        actions: [
          IconButton(
            icon: const Icon(Icons.developer_mode),
            tooltip: 'Server Address & Connection Test',
            onPressed: _showServerSettingsDialog,
          ),
        ],
      ),
      body: Column(
        children: [
          // Quick suggest prompt chips
          Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _quickPrompts.length,
              separatorBuilder: (context, index) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final prompt = _quickPrompts[index];
                return ActionChip(
                  label: Text(prompt, style: const TextStyle(fontSize: 12)),
                  onPressed: _isSending ? null : () => _sendMessage(prompt),
                );
              },
            ),
          ),

          // Chat message list
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(12.0),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final msg = _messages[index];
                final isUser = msg.role == 'user';

                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6.0),
                  child: Row(
                    mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (!isUser) ...[
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: msg.isError
                              ? Colors.red
                              : Theme.of(context).colorScheme.primary,
                          child: Icon(
                            msg.isError ? Icons.error_outline : Icons.auto_awesome,
                            color: Colors.white,
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 8),
                      ],
                      Flexible(
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: isUser
                                ? Theme.of(context).colorScheme.primary
                                : (msg.isError
                                    ? Colors.red.shade50
                                    : Theme.of(context).colorScheme.surfaceContainerHighest),
                            border: msg.isError ? Border.all(color: Colors.red.shade300) : null,
                            borderRadius: BorderRadius.only(
                              topLeft: const Radius.circular(16),
                              topRight: const Radius.circular(16),
                              bottomLeft: Radius.circular(isUser ? 16 : 4),
                              bottomRight: Radius.circular(isUser ? 4 : 16),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (msg.text.isEmpty && !isUser && _isSending)
                                const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    SizedBox(
                                      width: 14,
                                      height: 14,
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    ),
                                    SizedBox(width: 8),
                                    Text('Thinking...', style: TextStyle(fontSize: 13)),
                                  ],
                                )
                              else
                                Text(
                                  msg.text,
                                  style: TextStyle(
                                    color: isUser
                                        ? Theme.of(context).colorScheme.onPrimary
                                        : (msg.isError
                                            ? Colors.red.shade900
                                            : Theme.of(context).colorScheme.onSurfaceVariant),
                                    fontSize: 14.5,
                                    height: 1.35,
                                  ),
                                ),
                              if (msg.isError && msg.retryText != null) ...[
                                const SizedBox(height: 8),
                                ElevatedButton.icon(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.red,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  ),
                                  onPressed: _isSending ? null : () => _sendMessage(msg.retryText),
                                  icon: const Icon(Icons.refresh, size: 16),
                                  label: const Text('Retry', style: TextStyle(fontSize: 12)),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      if (isUser) ...[
                        const SizedBox(width: 8),
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: Colors.grey[700],
                          child: const Icon(Icons.person, color: Colors.white, size: 18),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
          ),

          // Input Bar
          Container(
            padding: const EdgeInsets.all(8.0),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  blurRadius: 4,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _inputController,
                    onSubmitted: (_) => _sendMessage(),
                    decoration: const InputDecoration(
                      hintText: 'Ask about schemes, pensions, documents...',
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                  ),
                ),
                IconButton(
                  icon: _isSending
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(Icons.send, color: Theme.of(context).colorScheme.primary),
                  onPressed: _isSending ? null : () => _sendMessage(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
