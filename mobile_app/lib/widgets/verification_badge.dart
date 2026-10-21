import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/scheme.dart';
import '../providers/language_provider.dart';

class VerificationBadge extends StatelessWidget {
  final Scheme scheme;
  final bool isCompact;

  const VerificationBadge({
    super.key,
    required this.scheme,
    this.isCompact = false,
  });

  String _formatDate(String dateStr, {bool isTa = false}) {
    if (dateStr.isEmpty) return isTa ? 'சரிபார்க்கப்படவில்லை' : 'Unverified';
    try {
      final dt = DateTime.parse(dateStr);
      final monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      final monthsTa = ['ஜன', 'பிப்', 'மார்ச்', 'ஏப்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆக', 'செப்', 'அக்', 'நவ', 'டிச'];
      final month = isTa ? monthsTa[dt.month - 1] : monthsEn[dt.month - 1];
      return '${dt.day.toString().padLeft(2, '0')} $month ${dt.year}';
    } catch (_) {
      return dateStr.split('T').first;
    }
  }

  /// Determines display state, label, icon and color from scheme verification fields.
  /// 5 states: confirmed, partial, fetched_not_parsed, unreachable, never_checked.
  /// Never shows "awaiting AI check" wording.
  ({String label, IconData icon, Color color, String state}) _resolveDisplayState({bool isTa = false}) {
    if (scheme.displayState.isNotEmpty) {
      final ds = scheme.displayState.toLowerCase();
      if (ds == 'confirmed') {
        return (
          label: isTa ? 'அதிகாரப்பூர்வ தகவல்' : 'Official source confirmed',
          icon: Icons.verified,
          color: Colors.green,
          state: 'confirmed',
        );
      } else if (ds == 'partial') {
        return (
          label: isTa ? 'பகுதி சரிபார்க்கப்பட்டது' : 'Partly confirmed',
          icon: Icons.check_circle_outline,
          color: Colors.amber[700]!,
          state: 'partial',
        );
      } else if (ds == 'fetched_not_parsed') {
        return (
          label: isTa ? 'முழு விவரம் தேவை' : 'Details not yet confirmed',
          icon: Icons.article_outlined,
          color: Colors.blueGrey,
          state: 'fetched_not_parsed',
        );
      } else if (ds == 'unreachable') {
        return (
          label: isTa ? 'தளத்தை அணுக முடியவில்லை' : 'Official site not reachable',
          icon: Icons.cloud_off,
          color: Colors.deepOrange,
          state: 'unreachable',
        );
      } else if (ds == 'never_checked') {
        return (
          label: isTa ? 'சரிபார்க்கப்படவில்லை' : 'Not yet confirmed',
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
        label: isTa ? 'அதிகாரப்பூர்வ தகவல்' : 'Official source confirmed',
        icon: Icons.verified,
        color: Colors.green,
        state: 'confirmed',
      );
    }

    // 2. Differs: extracted data differs from stored
    if (status == 'differs' || level == 'differs') {
      return (
        label: isTa ? 'விவரம் மாறுபடுகிறது' : 'Information differs',
        icon: Icons.warning_amber_rounded,
        color: Colors.orange[800]!,
        state: 'differs',
      );
    }

    // 3. Partial: some facts scraped but not fully verified
    if (status == 'partial') {
      return (
        label: isTa ? 'பகுதி சரிபார்க்கப்பட்டது' : 'Partly confirmed',
        icon: Icons.check_circle_outline,
        color: Colors.amber[700]!,
        state: 'partial',
      );
    }

    // 4. Fetched but not parsed (replaces "awaiting AI check")
    if (status == 'fetched_not_parsed' || status == 'awaiting ai check' ||
        status == 'needs better recipe') {
      return (
        label: isTa ? 'முழு விவரம் தேவை' : 'Details not yet confirmed',
        icon: Icons.article_outlined,
        color: Colors.blueGrey,
        state: 'fetched_not_parsed',
      );
    }

    // 5. Unreachable / TLS / Blocked
    if (status == 'unreachable' || status == 'tls_problem' || status == 'blocked' ||
        status == 'timeout' || reason.contains('expired') || reason.contains('timeout')) {
      return (
        label: isTa ? 'தளத்தை அணுக முடியவில்லை' : 'Official site not reachable',
        icon: Icons.cloud_off,
        color: Colors.deepOrange,
        state: 'unreachable',
      );
    }

    // 6. Never checked (default)
    return (
      label: isTa ? 'சரிபார்க்கப்படவில்லை' : 'Not yet confirmed',
      icon: Icons.info_outline,
      color: Colors.grey[700]!,
      state: 'never_checked',
    );
  }

  @override
  Widget build(BuildContext context) {
    final isTa = Provider.of<LanguageProvider>(context).isTamil;
    final display = _resolveDisplayState(isTa: isTa);
    final label = display.label;
    final icon = display.icon;
    final color = display.color;

    final dateText = scheme.lastVerified.isNotEmpty
        ? (isTa ? 'சரிபார்க்கப்பட்டது: ${_formatDate(scheme.lastVerified, isTa: isTa)}' : 'Verified: ${_formatDate(scheme.lastVerified)}')
        : (display.state == 'confirmed'
            ? (isTa ? 'அதிகாரப்பூர்வ தளத்திலிருந்து உறுதிப்படுத்தப்பட்டது' : 'Confirmed from official source')
            : (display.state == 'unreachable'
                ? (isTa ? 'கடைசி சோதனை தோல்வியடைந்தது' : 'Last check failed')
                : (isTa ? 'சரிபார்ப்பு நிலுவையில் உள்ளது' : 'Pending verification')));

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
