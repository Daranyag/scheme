import 'package:flutter/material.dart';
import '../models/scheme.dart';

class RecentlyChangedBanner extends StatelessWidget {
  final Scheme scheme;

  const RecentlyChangedBanner({
    super.key,
    required this.scheme,
  });

  @override
  Widget build(BuildContext context) {
    if (!scheme.changedRecently && scheme.changeHistory.isEmpty) {
      return const SizedBox.shrink();
    }

    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(top: 8, bottom: 12),
      color: Colors.purple[50],
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: Colors.purple[300]!),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.history_toggle_off, color: Colors.purple[800], size: 18),
                const SizedBox(width: 6),
                Text(
                  'Recently Changed (Updated from Official Portal)',
                  style: TextStyle(
                    color: Colors.purple[900],
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
            if (scheme.changeHistory.isNotEmpty) ...[
              const SizedBox(height: 8),
              ...scheme.changeHistory.map((change) {
                final field = change['field'] ?? 'details';
                final oldValue = change['oldValue'] ?? 'N/A';
                final newValue = change['newValue'] ?? 'N/A';
                final quote = change['quote'] ?? '';

                return Padding(
                  padding: const EdgeInsets.only(bottom: 6.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '• Field "$field" updated:',
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(left: 12.0, top: 2.0),
                        child: Text(
                          'Old: $oldValue  ➔  New: $newValue',
                          style: TextStyle(color: Colors.grey[900], fontSize: 12),
                        ),
                      ),
                      if (quote.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(left: 12.0, top: 2.0),
                          child: Text(
                            '"$quote"',
                            style: TextStyle(color: Colors.purple[900], fontStyle: FontStyle.italic, fontSize: 11),
                          ),
                        ),
                    ],
                  ),
                );
              }),
            ],
          ],
        ),
      ),
    );
  }
}
