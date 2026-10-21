import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/scheme.dart';
import '../services/rule_engine.dart';
import '../widgets/recently_changed_banner.dart';
import '../widgets/verification_badge.dart';

class SchemeDetailScreen extends StatelessWidget {
  final Scheme scheme;
  final RuleEvaluationResult evaluation;

  const SchemeDetailScreen({
    super.key,
    required this.scheme,
    required this.evaluation,
  });

  Future<void> _handleLinkClick(BuildContext context, SchemeLink link) async {
    if (link.url.isEmpty) return;

    if (link.hasTlsError) {
      final shouldProceed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Security Warning'),
          content: const Text("This website's security certificate has a problem. Do not enter personal details until it is fixed."),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Proceed anyway'),
            ),
          ],
        ),
      );

      if (shouldProceed != true) return;
    }

    await _launchUrl(context, link.url);
  }

  Future<void> _launchUrl(BuildContext context, String urlString) async {
    if (urlString.isEmpty) return;
    final Uri uri = Uri.parse(urlString);
    try {
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Could not open link: $urlString')),
          );
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error opening link: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    const fallbackDefault = 'Not listed in the sources I checked. Ask at your Taluk office or e-Sevai centre.';
    const fallbackLinks = 'No verified official link found. Search tn.gov.in or ask at an e-Sevai centre.';

    final bool isEligible = evaluation.status == EligibilityStatus.eligible;
    final bool isVerify = evaluation.status == EligibilityStatus.possiblyEligibleVerify;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          scheme.name,
          maxLines: 2,
          softWrap: true,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Theme.of(context).colorScheme.onPrimary,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Category Label
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  scheme.category.toUpperCase(),
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.primary,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              const SizedBox(height: 8),

              // Largest, Boldest Name
              Text(
                scheme.name,
                maxLines: 3,
                softWrap: true,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      fontSize: 22,
                      height: 1.25,
                    ),
              ),
              if (scheme.nameTamil.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  scheme.nameTamil,
                  maxLines: 2,
                  softWrap: true,
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.grey[750],
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
              const SizedBox(height: 12),

              // Top Badges
              Row(
                children: [
                  Flexible(
                    child: Chip(
                      avatar: Icon(
                        isEligible
                            ? Icons.check_circle
                            : (isVerify ? Icons.help_outline : Icons.cancel),
                        color: isEligible
                            ? Colors.green
                            : (isVerify ? Colors.orange : Colors.red),
                        size: 18,
                      ),
                      label: Text(
                        isEligible
                            ? 'Eligible'
                            : (isVerify ? 'Possibly Eligible (Verify)' : 'Not Eligible'),
                        style: TextStyle(
                          color: isEligible
                              ? Colors.green[900]
                              : (isVerify ? Colors.orange[900] : Colors.red[900]),
                          fontWeight: FontWeight.bold,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      backgroundColor: isEligible
                          ? Colors.green[50]
                          : (isVerify ? Colors.orange[50] : Colors.red[50]),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(child: VerificationBadge(scheme: scheme, isCompact: true)),
                ],
              ),
              const SizedBox(height: 8),

              if (scheme.changedRecently) ...[
                RecentlyChangedBanner(scheme: scheme),
                const SizedBox(height: 8),
              ],

              // Display State Notice (from presenter's 5-state algorithm)
              if (scheme.displayNotice.isNotEmpty) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: _displayStateColor(scheme.displayState).withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: _displayStateColor(scheme.displayState).withValues(alpha: 0.25),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        _displayStateIcon(scheme.displayState),
                        size: 16,
                        color: _displayStateColor(scheme.displayState),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          scheme.displayNotice,
                          style: TextStyle(
                            fontSize: 12,
                            color: _displayStateColor(scheme.displayState),
                            height: 1.3,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],

              // Expandable official text excerpt (for fetched_not_parsed state)
              if (scheme.officialExcerpt.isNotEmpty)
                _OfficialExcerptTile(excerpt: scheme.officialExcerpt),

              // SECTION 1: About the Scheme
              Row(
                children: [
                  Icon(Icons.info_outline, size: 20, color: Theme.of(context).colorScheme.primary),
                  const SizedBox(width: 8),
                  const Text(
                    'About the Scheme',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                ),
                child: Builder(
                  builder: (context) {
                    final String rawDesc = scheme.description.trim();
                    final bool hasCustomDesc = rawDesc.isNotEmpty && rawDesc != scheme.benefit.trim();

                    final String namePart = '${scheme.name}${scheme.nameTamil.isNotEmpty ? ' (${scheme.nameTamil})' : ''}';
                    final String deptPart = scheme.category.isNotEmpty ? scheme.category : 'Social Welfare and Government';

                    final List<String> detailSentences = [
                      if (hasCustomDesc)
                        rawDesc
                      else
                        '$namePart is an established governmental initiative administered by the $deptPart Department of Tamil Nadu.',
                      'This scheme is specifically formulated to provide targeted welfare, socio-economic upliftment, and direct assistance to eligible residents across the state.',
                      if (scheme.rules.isNotEmpty || scheme.unmappedCriteria.isNotEmpty)
                        'Eligible applicants must satisfy specific demographic and departmental guidelines to receive benefits, ensuring support reaches deserving individuals and households.',
                      if (scheme.howToApply.isNotEmpty)
                        'Applications and verification processes are conducted systematically through relevant departmental portals, local administrative bodies, or designated government camps.',
                      'The key objective is to provide accessible social security, transparent distribution of benefits, and sustained support under official government norms.',
                    ];

                    return Text(
                      detailSentences.join('\n\n'),
                      style: const TextStyle(
                        fontSize: 15,
                        height: 1.5,
                        color: Color(0xFF1B2433),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 20),

              // SECTION 2: Benefit
              Row(
                children: [
                  Icon(Icons.card_giftcard, size: 20, color: Theme.of(context).colorScheme.primary),
                  const SizedBox(width: 8),
                  const Text(
                    'Benefit',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                ),
                child: Text(
                  scheme.benefit.isNotEmpty ? scheme.benefit : fallbackDefault,
                  style: TextStyle(
                    fontSize: 15,
                    height: 1.45,
                    fontWeight: scheme.benefit.isNotEmpty ? FontWeight.w500 : FontWeight.normal,
                    fontStyle: scheme.benefit.isNotEmpty ? FontStyle.normal : FontStyle.italic,
                    color: scheme.benefit.isNotEmpty ? Colors.black87 : Colors.grey[700],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // SECTION 2: Why you qualify
              const Text(
                'Why you qualify',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Card(
                elevation: 0,
                color: Colors.grey[100],
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                child: Padding(
                  padding: const EdgeInsets.all(14.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (evaluation.matchedCriteria.isEmpty &&
                          evaluation.failedCriteria.isEmpty &&
                          !scheme.verify) ...[
                        if (scheme.unmappedCriteria.isNotEmpty)
                          for (var item in scheme.unmappedCriteria)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4.0),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('✓ ', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold, fontSize: 18)),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      item,
                                      style: const TextStyle(fontSize: 15, height: 1.4, color: Colors.black87),
                                    ),
                                  ),
                                ],
                              ),
                            )
                        else
                          const Text(
                            'General scheme open to eligible Tamil Nadu citizens meeting application requirements.',
                            style: TextStyle(fontSize: 15, height: 1.4, color: Colors.black87),
                          ),
                      ] else ...[
                        for (var item in evaluation.matchedCriteria)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4.0),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('✓ ', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold, fontSize: 18)),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    item,
                                    style: const TextStyle(fontSize: 15, height: 1.4, color: Colors.black87),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        for (var item in evaluation.failedCriteria)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4.0),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('✗ ', style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 18)),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    item,
                                    style: const TextStyle(fontSize: 15, height: 1.4, color: Colors.red),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        if (scheme.verify)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4.0),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('? ', style: TextStyle(color: Colors.orange, fontWeight: FontWeight.bold, fontSize: 18)),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    scheme.category.toLowerCase().contains('education') || scheme.category.toLowerCase().contains('scholarship')
                                        ? 'Specific course/institution eligibility must be verified at application time.'
                                        : 'Specific department eligibility and certificate verification required at application time.',
                                    style: const TextStyle(fontSize: 15, height: 1.4, color: Colors.black87),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // SECTION 3: Also check yourself
              const Text(
                'Also check yourself',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              if (scheme.unmappedCriteria.isNotEmpty)
                ...scheme.unmappedCriteria.map(
                  (cond) => Padding(
                    padding: const EdgeInsets.only(bottom: 8.0),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('• ', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        Expanded(
                          child: Text(
                            cond,
                            style: const TextStyle(fontSize: 15, height: 1.45, color: Colors.black87),
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              else
                const Text(
                  fallbackDefault,
                  style: TextStyle(fontSize: 15, fontStyle: FontStyle.italic, color: Colors.black87),
                ),
              const SizedBox(height: 20),

              // SECTION 4: Documents
              const Text(
                'Documents',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              if (scheme.requiredDocuments.isNotEmpty)
                Card(
                  elevation: 0,
                  color: Colors.blue[50],
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  child: Padding(
                    padding: const EdgeInsets.all(14.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: scheme.requiredDocuments
                          .map(
                            (doc) => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4.0),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Icon(Icons.description, color: Colors.blue, size: 18),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      doc,
                                      style: const TextStyle(fontSize: 15, height: 1.4, fontWeight: FontWeight.w500),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                )
              else
                const Text(
                  fallbackDefault,
                  style: TextStyle(fontSize: 15, fontStyle: FontStyle.italic, color: Colors.black87),
                ),
              const SizedBox(height: 20),

              // SECTION 5: How to apply
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'How to apply',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.green.shade50,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Colors.green.shade200),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.check_circle_outline, color: Colors.green, size: 14),
                        SizedBox(width: 4),
                        Text('Step-by-step', style: TextStyle(color: Colors.green, fontSize: 12, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (scheme.howToApply.isNotEmpty)
                ...scheme.howToApply.asMap().entries.map((entry) {
                  final int index = entry.key;
                  final String step = entry.value;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 10.0),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 26,
                          height: 26,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary,
                            shape: BoxShape.circle,
                          ),
                          child: Text(
                            '${index + 1}',
                            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            step,
                            style: const TextStyle(fontSize: 14.5, height: 1.45, color: Colors.black87),
                          ),
                        ),
                      ],
                    ),
                  );
                })
              else ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade50,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.grey.shade200),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('1. Visit your nearest Tamil Nadu e-Sevai centre (TNeGA) or local Taluk Office.', style: TextStyle(fontSize: 14.5, height: 1.45)),
                      SizedBox(height: 6),
                      Text('2. Carry your original Aadhaar Card, Smart Ration Card, Income Certificate, and Bank Passbook.', style: TextStyle(fontSize: 14.5, height: 1.45)),
                      SizedBox(height: 6),
                      Text('3. Request the operator to apply for the scheme and retain your digital acknowledgement slip with the application reference number.', style: TextStyle(fontSize: 14.5, height: 1.45)),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 14),

              // SUB-SECTION: What to do if you face issues or couldn't get the benefit
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.amber.shade300),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.help_outline, color: Colors.amber.shade900, size: 20),
                        const SizedBox(width: 8),
                        Text(
                          'What to do if you couldn\'t get the benefit / Application delayed?',
                          style: TextStyle(
                            fontSize: 14.5,
                            fontWeight: FontWeight.bold,
                            color: Colors.amber.shade900,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '• Check Application Status: Track your application on the official Tamil Nadu portal or visit the e-Sevai centre where you applied using your acknowledgement reference number.',
                      style: TextStyle(fontSize: 13.5, height: 1.4, color: Colors.black87),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      '• Reason for Delay / Rejection: Common issues include Aadhaar-Bank account linking mismatch (NPCI mapping not active), expired income certificate, or family member already receiving a similar pension/grant.',
                      style: TextStyle(fontSize: 13.5, height: 1.4, color: Colors.black87),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      '• Grievance & Appeal: If unfairly rejected or delayed beyond 30 days, submit a petition at the District Collectorate Weekly Grievance Day (every Monday) or call CM Helpline 1100.',
                      style: TextStyle(fontSize: 13.5, height: 1.4, color: Colors.black87),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      '• Free Help Desk: Visit your local Taluk Office Social Security Scheme (SSS) Tahsildar desk or call the toll-free helpline for free assistance.',
                      style: TextStyle(fontSize: 13.5, height: 1.4, color: Colors.black87),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // SECTION 6: Official links
              const Text(
                'Official links',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              if (scheme.officialLinks.where((l) => !l.is404).isNotEmpty)
                ...scheme.officialLinks.where((l) => !l.is404).map(
                  (link) => Padding(
                    padding: const EdgeInsets.only(bottom: 10.0),
                    child: OutlinedButton.icon(
                      onPressed: link.url.isNotEmpty ? () => _handleLinkClick(context, link) : null,
                      icon: Icon(link.isWorking ? Icons.open_in_new : (link.hasTlsError ? Icons.gpp_maybe : Icons.link_off), size: 18),
                      label: Row(
                        children: [
                          Expanded(
                            child: Text(
                              link.title.isNotEmpty ? link.title : 'Official Link',
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                            ),
                          ),
                          if (link.hasTlsError)
                            const Text(' (Certificate Warning)', style: TextStyle(color: Colors.orange, fontSize: 12))
                          else if (!link.isWorking)
                            const Text(' (Unreachable)', style: TextStyle(color: Colors.red, fontSize: 12)),
                        ],
                      ),
                      style: OutlinedButton.styleFrom(
                        alignment: Alignment.centerLeft,
                        padding: const EdgeInsets.all(14),
                      ),
                    ),
                  ),
                )
              else
                const Text(
                  fallbackLinks,
                  style: TextStyle(fontSize: 15, fontStyle: FontStyle.italic, color: Colors.black87),
                ),
               const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  Color _displayStateColor(String state) {
    switch (state) {
      case 'confirmed':
        return Colors.green[700]!;
      case 'partial':
        return Colors.blue[700]!;
      case 'fetched_not_parsed':
        return Colors.amber[800]!;
      case 'unreachable':
        return Colors.orange[800]!;
      case 'never_checked':
      default:
        return Colors.grey[700]!;
    }
  }

  IconData _displayStateIcon(String state) {
    switch (state) {
      case 'confirmed':
        return Icons.verified;
      case 'partial':
        return Icons.fact_check;
      case 'fetched_not_parsed':
        return Icons.menu_book;
      case 'unreachable':
        return Icons.cloud_off;
      case 'never_checked':
      default:
        return Icons.help_outline;
    }
  }
}

class _OfficialExcerptTile extends StatefulWidget {
  final String excerpt;

  const _OfficialExcerptTile({required this.excerpt});

  @override
  State<_OfficialExcerptTile> createState() => _OfficialExcerptTileState();
}

class _OfficialExcerptTileState extends State<_OfficialExcerptTile> {
  bool _isExpanded = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Colors.amber.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.amber.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: () => setState(() => _isExpanded = !_isExpanded),
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  const Icon(Icons.description_outlined, size: 16, color: Colors.amber),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Official Text (Scraped Excerpt)',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Colors.black87,
                      ),
                    ),
                  ),
                  Icon(
                    _isExpanded ? Icons.expand_less : Icons.expand_more,
                    size: 20,
                    color: Colors.grey[700],
                  ),
                ],
              ),
            ),
          ),
          if (_isExpanded) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(12),
              child: SelectableText(
                widget.excerpt,
                style: const TextStyle(
                  fontSize: 13,
                  height: 1.4,
                  fontFamily: 'monospace',
                  color: Colors.black87,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
