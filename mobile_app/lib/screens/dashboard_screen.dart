import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/discovery.dart';
import '../models/scheme.dart';
import '../models/user_profile.dart';
import '../services/api_service.dart';
import '../services/rule_engine.dart';
import '../widgets/recently_changed_banner.dart';
import '../widgets/verification_badge.dart';
import 'scheme_detail_screen.dart';

class DashboardScreen extends StatefulWidget {
  final VoidCallback onEditProfile;
  final void Function(int sectionIndex)? onEditProfileWithSection;

  const DashboardScreen({
    super.key,
    required this.onEditProfile,
    this.onEditProfileWithSection,
  });

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  UserProfile? _profile;
  List<Scheme> _schemes = [];
  List<Discovery> _discoveries = [];
  int _unseenCount = 0;
  bool _isLoading = true;
  bool _minProfileDialogShown = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final profile = await UserProfile.loadFromPrefs();
    final schemes = await ApiService.fetchSchemes();
    final discoveryResult = await ApiService.fetchDiscoveries();

    if (mounted) {
      setState(() {
        _profile = profile;
        _schemes = schemes;
        _discoveries = discoveryResult['discoveries'] ?? [];
        _unseenCount = discoveryResult['unseenCount'] ?? 0;
        _isLoading = false;
      });

      _checkMinimumProfile(profile);
    }
  }

  void _checkMinimumProfile(UserProfile profile) {
    if ((profile.age == null && profile.gender == null) && !_minProfileDialogShown) {
      _minProfileDialogShown = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _showMinProfileDialog();
      });
    }
  }

  void _showMinProfileDialog() {
    final ageController = TextEditingController();
    String selectedGender = 'F';

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.person, color: Color(0xFF1E3A8A)),
            SizedBox(width: 8),
            Text('Quick Setup'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Please provide your Age and Gender to show matching schemes.'),
            const SizedBox(height: 12),
            TextField(
              controller: ageController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Age (Years)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: selectedGender,
              decoration: const InputDecoration(
                labelText: 'Gender',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'F', child: Text('Female')),
                DropdownMenuItem(value: 'M', child: Text('Male')),
                DropdownMenuItem(value: 'O', child: Text('Other')),
              ],
              onChanged: (val) {
                if (val != null) selectedGender = val;
              },
            ),
          ],
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1E3A8A),
              foregroundColor: Colors.white,
            ),
            onPressed: () async {
              final ageVal = int.tryParse(ageController.text.trim());
              if (_profile != null) {
                _profile!.age = ageVal;
                _profile!.gender = selectedGender;
                await _profile!.saveToPrefs();
              }
              Navigator.pop(ctx);
              _loadData();
            },
            child: const Text('Save & Continue'),
          ),
        ],
      ),
    );
  }

  Future<void> _dismissDiscovery(String id) async {
    setState(() {
      _discoveries.removeWhere((d) => d.id == id);
    });
    await ApiService.dismissDiscovery(id);
  }

  Future<void> _openSourceUrl(String url) async {
    if (url.isEmpty) return;
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  void _navigateToProfileSection(int sectionIndex) {
    if (widget.onEditProfileWithSection != null) {
      widget.onEditProfileWithSection!(sectionIndex);
    } else {
      widget.onEditProfile();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final profile = _profile ?? UserProfile();
    final int completeness = profile.calculateCompletenessPercent();
    final nextBest = RuleEngine.getNextBestQuestion(_schemes, profile);

    // Evaluate standard schemes with rule engine
    final List<Map<String, dynamic>> eligibleList = [];
    final List<Map<String, dynamic>> verifyList = [];

    for (var scheme in _schemes) {
      final eval = RuleEngine.evaluate(scheme, profile);
      if (eval.status == EligibilityStatus.eligible && scheme.verify) {
        eligibleList.add({'scheme': scheme, 'eval': eval});
      }
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Completeness Banner Card (Top of Dashboard if <100%)
            if (completeness < 100)
              Card(
                elevation: 2,
                color: Colors.amber.shade50,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: Colors.amber.shade300),
                ),
                margin: const EdgeInsets.only(bottom: 16),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.stars, color: Colors.amber, size: 24),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Your profile is $completeness% complete.',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 15,
                                color: Colors.black87,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Answer a few more questions to find more schemes.',
                        style: TextStyle(fontSize: 13, color: Colors.black54),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1E3A8A),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                          onPressed: () {
                            int secIdx = nextBest != null ? (nextBest['sectionIndex'] as int) : 0;
                            _navigateToProfileSection(secIdx);
                          },
                          icon: const Icon(Icons.arrow_forward, size: 16),
                          label: Text(
                            nextBest != null
                                ? 'Answer ${nextBest['field']} to confirm ${nextBest['count']} schemes'
                                : 'Complete Profile',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // Active Profile Summary Card
            Card(
              elevation: 2,
              color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.4),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.person_pin, color: Theme.of(context).colorScheme.primary),
                            const SizedBox(width: 8),
                            Text(
                              'Active Profile',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                            ),
                          ],
                        ),
                        TextButton.icon(
                          onPressed: widget.onEditProfile,
                          icon: const Icon(Icons.edit, size: 16),
                          label: const Text('Edit Profile'),
                        ),
                      ],
                    ),
                    const Divider(),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        Chip(
                          avatar: const Icon(Icons.cake, size: 16),
                          label: Text(profile.age != null ? 'Age: ${profile.age}' : 'Age: Unset'),
                        ),
                        Chip(
                          avatar: const Icon(Icons.person, size: 16),
                          label: Text('Gender: ${profile.gender == 'F' ? 'Female' : (profile.gender == 'M' ? 'Male' : 'Other')}'),
                        ),
                        Chip(
                          avatar: const Icon(Icons.currency_rupee, size: 16),
                          label: Text(profile.familyIncome != null ? 'Income: ₹${profile.familyIncome}' : (profile.incomeRangeBand ?? 'Income: Unset')),
                        ),
                        Chip(
                          avatar: const Icon(Icons.favorite, size: 16),
                          label: Text('Marital: ${profile.marital ?? 'Unset'}'),
                        ),
                        if (profile.destitute || profile.bplFamily)
                          const Chip(
                            avatar: Icon(Icons.verified, size: 16, color: Colors.green),
                            label: Text('Destitute / BPL'),
                          ),
                        if (profile.workStatus != null)
                          Chip(
                            avatar: const Icon(Icons.work, size: 16),
                            label: Text('Work: ${profile.workStatus}'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // --- SECTION: Newly Discovered For You ---
            Row(
              children: [
                const Icon(Icons.auto_awesome, color: Colors.purple),
                const SizedBox(width: 8),
                Text(
                  'Newly discovered for you',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                if (_unseenCount > 0) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.purple,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '$_unseenCount NEW',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 6),

            // Disclaimer Banner Note
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.amber.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline, size: 18, color: Colors.amber),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Collected automatically from official pages and may contain errors. Confirm on official website or at e-Sevai centre.',
                      style: TextStyle(fontSize: 12, color: Colors.black87),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            if (_discoveries.isEmpty)
              Card(
                elevation: 0,
                color: Colors.grey[100],
                child: const Padding(
                  padding: EdgeInsets.all(16.0),
                  child: Center(
                    child: Text(
                      'No new profile-driven discoveries yet.\nUpdates run automatically in background.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                ),
              )
            else
              ..._discoveries.map((discovery) => _buildDiscoveryCard(context, discovery)),

            const SizedBox(height: 24),

            // Header: Eligible Schemes
            Row(
              children: [
                const Icon(Icons.check_circle_outline, color: Colors.green),
                const SizedBox(width: 8),
                Text(
                  'Eligible Schemes & Pensions (${eligibleList.length})',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            if (eligibleList.isEmpty)
              Card(
                elevation: 0,
                color: Colors.grey[100],
                child: const Padding(
                  padding: EdgeInsets.all(16.0),
                  child: Center(
                    child: Text(
                      'No schemes strictly matched your current profile.\nTry completing more questions in your profile.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              )
            else
              ...eligibleList.map((item) {
                final Scheme scheme = item['scheme'];
                final RuleEvaluationResult eval = item['eval'];
                return _buildSchemeCard(context, scheme, eval, Colors.green);
              }),

            const SizedBox(height: 24),

            // We removed the 'Possibly Eligible' section to only show Verified Eligible ones per user request.
          ],
        ),
      ),
    );
  }

  Widget _buildDiscoveryCard(BuildContext context, Discovery discovery) {
    final bool isEligible = discovery.eligibilityStatus == 'eligible';
    final Color tagColor = isEligible ? Colors.green : Colors.amber.shade800;
    final String tagText = isEligible ? 'Eligible' : 'Possibly eligible - verify';

    void openDetails() {
      final tempScheme = Scheme(
        id: discovery.id,
        name: discovery.name,
        nameTamil: discovery.nameTamil,
        category: discovery.name,
        benefit: discovery.benefit,
        status: 'ACTIVE',
        rules: {},
        unmappedCriteria: [],
        requiredDocuments: [],
        howToApply: [],
        officialLinks: [
          SchemeLink(title: 'Source link', url: discovery.sourceUrl)
        ],
        verify: true,
      );

      final eval = RuleEvaluationResult(
        status: isEligible ? EligibilityStatus.eligible : EligibilityStatus.possiblyEligibleVerify,
        reason: isEligible ? 'Eligible based on AI discovery.' : 'AI discovery needs manual verification.',
        matchedCriteria: [],
        failedCriteria: [],
        missingFields: [],
      );

      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => SchemeDetailScreen(
            scheme: tempScheme,
            evaluation: eval,
          ),
        ),
      );
    }

    return Card(
      elevation: 2,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: Colors.purple.withValues(alpha: 0.3)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: openDetails,
        child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: tagColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        tagText,
                        style: TextStyle(
                          color: tagColor,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.purple.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'AI-discovered',
                        style: TextStyle(
                          color: Colors.purple,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 18, color: Colors.grey),
                  tooltip: 'Not relevant',
                  onPressed: () => _dismissDiscovery(discovery.id),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              discovery.name,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            Text(
              discovery.benefit,
              style: TextStyle(color: Colors.grey[800], fontSize: 14),
            ),
            const SizedBox(height: 10),
            Text(
              'Found on: ${discovery.domain}',
              style: TextStyle(color: Colors.grey[700], fontSize: 13, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                InkWell(
                  onTap: () => _openSourceUrl(discovery.sourceUrl),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.open_in_new, size: 14, color: Theme.of(context).colorScheme.primary),
                      const SizedBox(width: 4),
                      Text(
                        'Source link',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.primary,
                          decoration: TextDecoration.underline,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  'Last checked: ${discovery.lastChecked}',
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
              ],
            ),
          ],
        ),
      ),
      ),
    );
  }

  Widget _buildSchemeCard(
    BuildContext context,
    Scheme scheme,
    RuleEvaluationResult eval,
    Color statusColor,
  ) {
    void openDetails() {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => SchemeDetailScreen(
            scheme: scheme,
            evaluation: eval,
          ),
        ),
      );
    }

    final bool isEligible = eval.status == EligibilityStatus.eligible;
    final String tagText = isEligible ? 'Eligible' : 'Possibly eligible — verify';

    return Card(
      elevation: 2,
      margin: const EdgeInsets.only(bottom: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: openDetails,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Flexible(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        scheme.category.toUpperCase(),
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.primary,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(child: VerificationBadge(scheme: scheme, isCompact: true)),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                scheme.name,
                maxLines: 3,
                softWrap: true,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, height: 1.25),
              ),
              if (scheme.nameTamil.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  scheme.nameTamil,
                  maxLines: 2,
                  softWrap: true,
                  style: TextStyle(fontSize: 14, color: Colors.grey[750], fontWeight: FontWeight.w500),
                ),
              ],
              const SizedBox(height: 10),

              // Status Tag
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      statusColor == Colors.green ? Icons.check_circle : Icons.help_outline,
                      size: 14,
                      color: statusColor,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      tagText,
                      style: TextStyle(color: statusColor, fontWeight: FontWeight.bold, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),

              Text(
                scheme.benefit,
                style: TextStyle(color: Colors.grey[900], fontSize: 15, height: 1.4),
              ),

              if (eval.status == EligibilityStatus.possiblyEligibleVerify && eval.missingFields.isNotEmpty) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.orange.shade300),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Answer ${eval.missingFields.length} more question${eval.missingFields.length > 1 ? 's' : ''} to confirm (${eval.missingFields.join(', ')})',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.orange.shade900),
                      ),
                      const SizedBox(height: 6),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          side: BorderSide(color: Colors.orange.shade700),
                        ),
                        onPressed: () {
                          int secIdx = 0;
                          String field = eval.missingFields.first;
                          if (field.contains('Marital')) secIdx = 1;
                          else if (field.contains('Income')) secIdx = 3;
                          _navigateToProfileSection(secIdx);
                        },
                        icon: const Icon(Icons.edit, size: 14, color: Colors.orange),
                        label: Text('Answer ${eval.missingFields.first} now', style: TextStyle(fontSize: 12, color: Colors.orange.shade900)),
                      ),
                    ],
                  ),
                ),
              ],

              if (scheme.changedRecently) ...[
                const SizedBox(height: 8),
                RecentlyChangedBanner(scheme: scheme),
              ],
              
              const SizedBox(height: 14),

              // FULL DETAILS INLINE
              if (scheme.unmappedCriteria.isNotEmpty) ...[
                const Divider(),
                const Text('Additional Criteria:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                const SizedBox(height: 4),
                ...scheme.unmappedCriteria.map((crit) => Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('• ', style: TextStyle(fontSize: 14)),
                    Expanded(child: Text(crit, style: const TextStyle(fontSize: 14))),
                  ],
                )),
                const SizedBox(height: 8),
              ],

              if (scheme.requiredDocuments.isNotEmpty) ...[
                const Divider(),
                const Text('Required Documents:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                const SizedBox(height: 4),
                ...scheme.requiredDocuments.map((doc) => Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.file_present, size: 14, color: Colors.grey),
                    const SizedBox(width: 6),
                    Expanded(child: Text(doc, style: const TextStyle(fontSize: 14))),
                  ],
                )),
                const SizedBox(height: 8),
              ],

              if (scheme.howToApply.isNotEmpty) ...[
                const Divider(),
                const Text('How to Apply:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                const SizedBox(height: 4),
                ...scheme.howToApply.map((step) => Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.check_circle_outline, size: 14, color: Colors.green),
                    const SizedBox(width: 6),
                    Expanded(child: Text(step, style: const TextStyle(fontSize: 14))),
                  ],
                )),
                const SizedBox(height: 8),
              ],

              const SizedBox(height: 14),

              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: openDetails,
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                    side: BorderSide(color: Theme.of(context).colorScheme.primary),
                  ),
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: const Text('Open Links & Sources', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
