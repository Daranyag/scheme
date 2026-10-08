import 'package:flutter/material.dart';

class PrivacyNoteDialog extends StatelessWidget {
  const PrivacyNoteDialog({super.key});

  static void show(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const PrivacyNoteDialog(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.privacy_tip_outlined, color: Colors.green),
          SizedBox(width: 8),
          Text('Privacy Note'),
        ],
      ),
      content: const Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'We store only your email and a password hash. Your profile details are used only to check eligibility. We never ask for Aadhaar, phone or address.',
            style: TextStyle(fontSize: 14, height: 1.4),
          ),
          SizedBox(height: 12),
          Text(
            '• No real identity numbers stored.\n• Anonymous profile matching.\n• Data encrypted in transit.',
            style: TextStyle(fontSize: 13, color: Colors.grey),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
