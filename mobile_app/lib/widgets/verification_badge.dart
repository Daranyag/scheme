import 'package:flutter/material.dart';
import '../models/scheme.dart';

class VerificationBadge extends StatelessWidget {
  final Scheme scheme;
  final bool isCompact;

  const VerificationBadge({
    super.key,
    required this.scheme,
    this.isCompact = false,
  });

  String _formatDate(String dateStr) {
    if (dateStr.isEmpty) return 'Unverified';
    try {
      final dt = DateTime.parse(dateStr);
      final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return '${dt.day.toString().padLeft(2, '0')} ${months[dt.month - 1]} ${dt.year}';
    } catch (_) {
      return dateStr.split('T').first;
    }
  }

  @override
  Widget build(BuildContext context) {
    String label;
    IconData icon;
    Color color;

    final status = scheme.verificationStatus.toLowerCase();
    final level = scheme.verificationLevel.toLowerCase();

    if (status == 'verified' || level == 'official') {
      label = 'Official source confirmed';
      icon = Icons.verified;
      color = Colors.green;
    } else if (status == 'differs' || level == 'differs') {
      label = 'Information differs';
      icon = Icons.warning_amber_rounded;
      color = Colors.orange[800]!;
    } else {
      label = 'Not yet confirmed';
      icon = Icons.info_outline;
      color = Colors.grey[700]!;
    }

    final dateText = scheme.lastVerified.isNotEmpty
        ? 'Verified: ${_formatDate(scheme.lastVerified)}'
        : 'Pending verification';

    if (isCompact) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: color.withValues(alpha: 0.4), width: 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  color: color,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
                Text(
                  dateText,
                  style: TextStyle(
                    color: Colors.grey[800],
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
