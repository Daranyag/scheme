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
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
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

              const Divider(height: 28),

              // SECTION 1: Benefit
              const Text(
                'Benefit',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.2)),
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
                          !scheme.verify)
                        const Text(
                          fallbackDefault,
                          style: TextStyle(fontSize: 15, fontStyle: FontStyle.italic, color: Colors.black87),
                        )
                      else ...[
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
                              children: const [
                                Text('? ', style: TextStyle(color: Colors.orange, fontWeight: FontWeight.bold, fontSize: 18)),
                                SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    'Specific course/institution eligibility must be verified at application time.',
                                    style: TextStyle(fontSize: 15, height: 1.4, color: Colors.black87),
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
              const Text(
                'How to apply',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              if (scheme.howToApply.isNotEmpty)
                for (int i = 0; i < scheme.howToApply.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10.0),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        CircleAvatar(
                          radius: 12,
                          backgroundColor: Theme.of(context).colorScheme.primary,
                          child: Text(
                            '${i + 1}',
                            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            scheme.howToApply[i],
                            style: const TextStyle(fontSize: 15, height: 1.45, color: Colors.black87),
                          ),
                        ),
                      ],
                    ),
                  )
              else
                const Text(
                  fallbackDefault,
                  style: TextStyle(fontSize: 15, fontStyle: FontStyle.italic, color: Colors.black87),
                ),
              const SizedBox(height: 20),

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
}
