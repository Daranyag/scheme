import 'package:flutter/material.dart';
import '../services/api_service.dart';

Future<void> showServerAddressDialog(BuildContext context, {VoidCallback? onSaved}) async {
  final controller = TextEditingController(text: ApiService.baseUrl);
  String? testResult;
  bool isSuccess = false;
  bool testing = false;

  await showDialog(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (context, setDialogState) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.dns, color: Color(0xFF1E3A8A)),
            SizedBox(width: 8),
            Text('Server Settings', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Enter your backend server address (e.g. computer IP address when testing on mobile device):',
                style: TextStyle(fontSize: 13, color: Colors.black87),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: controller,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'Server Base URL',
                  border: OutlineInputBorder(),
                  hintText: 'http://10.144.174.65:3000',
                  prefixIcon: Icon(Icons.wifi),
                ),
              ),
              const SizedBox(height: 12),
              if (testResult != null)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  margin: const EdgeInsets.only(bottom: 12),
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
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
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
                            testResult = 'Connected successfully! (${result['durationMs']}ms)';
                          } else {
                            testResult = 'Connection failed: [${result['errorType']}] ${result['message']}';
                          }
                        });
                      },
                icon: testing
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.flash_on),
                label: const Text('Test Connection'),
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
                testResult = 'Reset to default base URL: ${ApiService.baseUrl}';
                isSuccess = true;
              });
            },
            child: const Text('Reset Default'),
          ),
          ElevatedButton(
            onPressed: () async {
              await ApiService.setCustomServerAddress(controller.text.trim());
              if (context.mounted) {
                Navigator.pop(ctx);
              }
              onSaved?.call();
            },
            child: const Text('Save Address'),
          ),
        ],
      ),
    ),
  );
}
