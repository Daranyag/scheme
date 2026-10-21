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

  /// Determines display state, label, icon and color from scheme verification fields.
  /// 5 states: confirmed, partial, fetched_not_parsed, unreachable, never_checked.
  /// Never shows "awaiting AI check" wording.
  ({String label, IconData icon, Color color, String state}) _resolveDisplayState() {
    if (scheme.displayState.isNotEmpty) {
      final ds = scheme.displayState.toLowerCase();
      if (ds == 'confirmed') {
        return (
          label: 'Official source confirmed',
          icon: Icons.verified,
          color: Colors.green,
          state: 'confirmed',
        );
      } else if (ds == 'partial') {
        return (
          label: 'Partly confirmed',
          icon: Icons.check_circle_outline,
          color: Colors.amber[700]!,
          state: 'partial',
        );
      } else if (ds == 'fetched_not_parsed') {
        return (
          label: 'Details not yet confirmed',
          icon: Icons.article_outlined,
          color: Colors.blueGrey,
          state: 'fetched_not_parsed',
        );
      } else if (ds == 'unreachable') {
        return (
          label: 'Official site not reachable',
          icon: Icons.cloud_off,
          color: Colors.deepOrange,
          state: 'unreachable',
        );
      } else if (ds == 'never_checked') {
        return (
          label: 'Not yet confirmed',
          icon: Icons.info_outline,
          color: Colors.grey[700]!,
          state: 'never_checked',
        );
      }
    }

    final status = scheme.verificationStatus.toLowerCase();
    final level = scheme.verificationLevel.toLowerCase();
    final reason = scheme.verificationReason.toLowerCase();

    // 1. Confirmed: official source with verified status
    if ((status == 'verified' || status == 'confirmed' || level == 'official') &&
        status != 'unreachable' && status != 'tls_problem' && status != 'blocked') {
      return (
        label: 'Official source confirmed',
        icon: Icons.verified,
        color: Colors.green,
        state: 'confirmed',
      );
    }

    // 2. Differs: extracted data differs from stored
    if (status == 'differs' || level == 'differs') {
      return (
        label: 'Information differs',
        icon: Icons.warning_amber_rounded,
        color: Colors.orange[800]!,
        state: 'differs',
      );
    }

    // 3. Partial: some facts scraped but not fully verified
    if (status == 'partial') {
      return (
        label: 'Partly confirmed',
        icon: Icons.check_circle_outline,
        color: Colors.amber[700]!,
        state: 'partial',
      );
    }

    // 4. Fetched but not parsed (replaces "awaiting AI check")
    if (status == 'fetched_not_parsed' || status == 'awaiting ai check' ||
        status == 'needs better recipe') {
      return (
        label: 'Details not yet confirmed',
        icon: Icons.article_outlined,
        color: Colors.blueGrey,
        state: 'fetched_not_parsed',
      );
    }

    // 5. Unreachable / TLS / Blocked
    if (status == 'unreachable' || status == 'tls_problem' || status == 'blocked' ||
        status == 'timeout' || reason.contains('expired') || reason.contains('timeout')) {
      return (
        label: 'Official site not reachable',
        icon: Icons.cloud_off,
        color: Colors.deepOrange,
        state: 'unreachable',
      );
    }

    // 6. Never checked (default)
    return (
      label: 'Not yet confirmed',
      icon: Icons.info_outline,
      color: Colors.grey[700]!,
      state: 'never_checked',
    );
  }

  @override
  Widget build(BuildContext context) {
    final display = _resolveDisplayState();
    final label = display.label;
    final icon = display.icon;
    final color = display.color;

    final dateText = scheme.lastVerified.isNotEmpty
        ? 'Verified: ${_formatDate(scheme.lastVerified)}'
        : (display.state == 'confirmed'
            ? 'Confirmed from official source'
            : (display.state == 'unreachable'
                ? 'Last check failed'
                : 'Pending verification'));

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
