import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/user_profile.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import 'account_screen.dart';
import 'login_screen.dart';

class ProfileScreen extends StatefulWidget {
  final VoidCallback? onSaved;
  final VoidCallback? onBackToDashboard;
  final int initialSectionIndex;
  final bool showWelcomeBanner;

  const ProfileScreen({
    super.key,
    this.onSaved,
    this.onBackToDashboard,
    this.initialSectionIndex = 0,
    this.showWelcomeBanner = false,
  });

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late UserProfile _profile;

  // Controllers
  final TextEditingController _ageController = TextEditingController();
  final TextEditingController _familyIncomeController = TextEditingController();
  final TextEditingController _ownIncomeController = TextEditingController();
  final TextEditingController _otherIncomeController = TextEditingController();
  final TextEditingController _pensionAmountController = TextEditingController();
  final TextEditingController _landWetController = TextEditingController();
  final TextEditingController _landDryController = TextEditingController();
  final TextEditingController _electricityUnitsController = TextEditingController();
  final TextEditingController _childrenCountController = TextEditingController();
  final TextEditingController _depChildrenCountController = TextEditingController();
  final TextEditingController _familyMembersCountController = TextEditingController();

  bool _isLoading = true;
  bool _isSaving = false;
  bool _hasUnsavedChanges = false;
  late List<bool> _expandedSections;

  final List<String> _tnDistricts = const [
    'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri',
    'Dindigul', 'Erode', 'Kanchipuram', 'Kanyakumari', 'Karur', 'Krishnagiri',
    'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur',
    'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi',
    'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 'Tirupathur',
    'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore', 'Viluppuram',
    'Virudhunagar'
  ];

  @override
  void initState() {
    super.initState();
    _expandedSections = List.generate(7, (index) => index == widget.initialSectionIndex);
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    _profile = await UserProfile.loadFromPrefs();
    // Normalize incomeRangeBand so it matches dropdown values
    if (_profile.incomeRangeBand != null) {
      if (_profile.incomeRangeBand == 'under 1 lakh') {
        _profile.incomeRangeBand = 'under ₹1 lakh';
      } else if (_profile.incomeRangeBand == '1–2.5 lakh') {
        _profile.incomeRangeBand = '₹1 to 2.5 lakh';
      } else if (_profile.incomeRangeBand == '2.5–5 lakh') {
        _profile.incomeRangeBand = '₹2.5 to 5 lakh';
      } else if (_profile.incomeRangeBand == 'above 5 lakh') {
        _profile.incomeRangeBand = 'above ₹5 lakh';
      }
    }
    _populateControllers();
    setState(() {
      _isLoading = false;
      _hasUnsavedChanges = false;
    });
  }

  void _populateControllers() {
    _ageController.text = _profile.age != null ? _profile.age.toString() : '';
    _familyIncomeController.text = _profile.familyIncome != null ? _profile.familyIncome.toString() : '';
    _ownIncomeController.text = _profile.ownIncome != null ? _profile.ownIncome.toString() : '';
    _otherIncomeController.text = _profile.otherIncome != null ? _profile.otherIncome.toString() : '';
    _pensionAmountController.text = _profile.pensionAmount != null ? _profile.pensionAmount.toString() : '';
    _landWetController.text = _profile.landWetAcres != null ? _profile.landWetAcres.toString() : '';
    _landDryController.text = _profile.landDryAcres != null ? _profile.landDryAcres.toString() : '';
    _electricityUnitsController.text = _profile.electricityUnitsYear != null ? _profile.electricityUnitsYear.toString() : '';
    _childrenCountController.text = _profile.childrenCount != null ? _profile.childrenCount.toString() : '';
    _depChildrenCountController.text = _profile.depChildrenCount != null ? _profile.depChildrenCount.toString() : '';
    _familyMembersCountController.text = _profile.familyMembersCount != null ? _profile.familyMembersCount.toString() : '';
  }

  void _onFieldChanged() {
    _hasUnsavedChanges = true;
    _autoSave();
    setState(() {});
  }

  Future<void> _autoSave() async {
    _readFormFields();
    final success = await _profile.saveToPrefs();
    if (success) {
      await ApiService.syncProfile(_profile);
      final auth = Provider.of<AuthProvider>(context, listen: false);
      if (auth.isAuthenticated) {
        await ApiService.saveFullProfile(_profile);
      }
    }
  }

  void _readFormFields() {
    _profile.age = int.tryParse(_ageController.text.trim());
    _profile.familyIncome = int.tryParse(_familyIncomeController.text.trim());
    _profile.ownIncome = int.tryParse(_ownIncomeController.text.trim());
    _profile.otherIncome = int.tryParse(_otherIncomeController.text.trim());
    _profile.pensionAmount = int.tryParse(_pensionAmountController.text.trim());
    _profile.landWetAcres = double.tryParse(_landWetController.text.trim());
    _profile.landDryAcres = double.tryParse(_landDryController.text.trim());
    _profile.electricityUnitsYear = int.tryParse(_electricityUnitsController.text.trim());
    _profile.childrenCount = int.tryParse(_childrenCountController.text.trim());
    _profile.depChildrenCount = int.tryParse(_depChildrenCountController.text.trim());
    _profile.familyMembersCount = int.tryParse(_familyMembersCountController.text.trim());

    // Derivations
    if ((_profile.landWetAcres != null && _profile.landWetAcres! > 5) ||
        (_profile.landDryAcres != null && _profile.landDryAcres! > 10)) {
      _profile.excessLand = true;
    }

    if (_profile.role == 'College student' || _profile.role == 'Higher studies') {
      _profile.highered = true;
    }

    // Derive "self" automatically for unmarried, widowed or deserted women who say they head their household
    if (_profile.gender == 'F' &&
        (_profile.marital == 'unmarried' || _profile.marital == 'widowed' || _profile.marital == 'deserted')) {
      if (_profile.famhead && (_profile.rationCardHead == null || _profile.rationCardHead!.isEmpty)) {
        _profile.rationCardHead = 'self';
      }
    }
  }

  Future<void> _saveProfileExplicitly() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isSaving = true;
    });

    _readFormFields();
    final success = await _profile.saveToPrefs();
    if (success) {
      await ApiService.syncProfile(_profile);
      final auth = Provider.of<AuthProvider>(context, listen: false);
      if (auth.isAuthenticated) {
        await ApiService.saveFullProfile(_profile);
      }
    }

    if (mounted) {
      setState(() {
        _isSaving = false;
        _hasUnsavedChanges = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Profile saved successfully!' : 'Failed to save profile.'),
          backgroundColor: success ? Colors.green : Colors.red,
        ),
      );

      if (widget.onSaved != null) {
        widget.onSaved!();
      } else if (widget.onBackToDashboard != null) {
        widget.onBackToDashboard!();
      }
    }
  }

  void _handleBackToDashboard() {
    if (!_hasUnsavedChanges) {
      if (widget.onBackToDashboard != null) {
        widget.onBackToDashboard!();
      } else {
        Navigator.maybePop(context);
      }
      return;
    }

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Save your changes first?'),
        content: const Text('You have unsaved changes in your profile.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              setState(() => _hasUnsavedChanges = false);
              if (widget.onBackToDashboard != null) {
                widget.onBackToDashboard!();
              } else {
                Navigator.maybePop(context);
              }
            },
            child: const Text('Discard', style: TextStyle(color: Colors.red)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.primary,
              foregroundColor: Colors.white,
            ),
            onPressed: () async {
              Navigator.pop(ctx);
              await _saveProfileExplicitly();
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showIncomeHelperDialog(TextEditingController controller) {
    final monthlyController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Calculate Annual Income'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Enter approximate monthly income:'),
            const SizedBox(height: 8),
            TextField(
              controller: monthlyController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Monthly Income (₹)',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.currency_rupee),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final m = int.tryParse(monthlyController.text.trim());
              if (m != null && m >= 0) {
                controller.text = (m * 12).toString();
                _onFieldChanged();
              }
              Navigator.pop(ctx);
            },
            child: const Text('Apply (Monthly × 12)'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _ageController.dispose();
    _familyIncomeController.dispose();
    _ownIncomeController.dispose();
    _otherIncomeController.dispose();
    _pensionAmountController.dispose();
    _landWetController.dispose();
    _landDryController.dispose();
    _electricityUnitsController.dispose();
    _childrenCountController.dispose();
    _depChildrenCountController.dispose();
    _familyMembersCountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final authProvider = Provider.of<AuthProvider>(context);
    final isAuthenticated = authProvider.isAuthenticated;
    final userEmail = authProvider.userEmail;
    final int completeness = _profile.calculateCompletenessPercent();
    final sectionCounts = _profile.getSectionCompletionCounts();

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Top Completeness Progress Bar Header
            Container(
              color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Profile Completeness',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                      Text(
                        '$completeness%',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).colorScheme.primary,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: completeness / 100.0,
                      minHeight: 8,
                      backgroundColor: Colors.grey[300],
                      valueColor: AlwaysStoppedAnimation<Color>(
                        completeness == 100 ? Colors.green : const Color(0xFF1E3A8A),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Form Body
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16.0),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Welcome Banner if just signed up
                      if (widget.showWelcomeBanner)
                        Container(
                          margin: const EdgeInsets.only(bottom: 16),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.blue.shade50,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.blue.shade200),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Tell us about yourself so we can find your schemes.',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Color(0xFF1E3A8A)),
                              ),
                              const SizedBox(height: 4),
                              const Text(
                                'You can skip any question.',
                                style: TextStyle(fontSize: 13, color: Colors.black87),
                              ),
                              const SizedBox(height: 8),
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton(
                                  onPressed: widget.onBackToDashboard,
                                  child: const Text('Skip for now', style: TextStyle(fontWeight: FontWeight.bold)),
                                ),
                              ),
                            ],
                          ),
                        ),

                      // Account status / banner
                      if (!isAuthenticated)
                        Container(
                          margin: const EdgeInsets.only(bottom: 16),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [const Color(0xFF1E3A8A), Colors.indigo.shade600],
                            ),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.cloud_sync, color: Colors.amber, size: 22),
                              const SizedBox(width: 8),
                              const Expanded(
                                child: Text(
                                  'Sign in to sync your profile across devices.',
                                  style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
                                ),
                              ),
                              TextButton(
                                onPressed: () {
                                  Navigator.push(context, MaterialPageRoute(builder: (_) => const LogInScreen()));
                                },
                                child: const Text('Log In', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                              ),
                            ],
                          ),
                        )
                      else
                        Card(
                          margin: const EdgeInsets.only(bottom: 16),
                          color: Colors.green.shade50,
                          child: ListTile(
                            leading: const CircleAvatar(
                              backgroundColor: Colors.green,
                              child: Icon(Icons.person, color: Colors.white, size: 20),
                            ),
                            title: Text(
                              authProvider.userDisplayName?.isNotEmpty == true
                                  ? authProvider.userDisplayName!
                                  : (userEmail ?? 'Signed In'),
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                            ),
                            subtitle: Text('Signed in as $userEmail', style: const TextStyle(fontSize: 12)),
                            trailing: OutlinedButton(
                              onPressed: () {
                                Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountScreen()));
                              },
                              child: const Text('Account', style: TextStyle(fontSize: 12)),
                            ),
                          ),
                        ),

                      // Privacy Note Header
                      Container(
                        padding: const EdgeInsets.all(10),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: Colors.blue.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.blue.withValues(alpha: 0.2)),
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.shield_outlined, size: 18, color: Colors.blue),
                            SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Only age, gender, income band, marital status, disability % & scheme flags are synced. District, community, ration card & land details stay on your phone.',
                                style: TextStyle(fontSize: 12, color: Colors.blue, fontWeight: FontWeight.w500),
                              ),
                            ),
                          ],
                        ),
                      ),

                      // 7 Collapsible Sections
                      _buildSectionTile(
                        index: 0,
                        title: 'Personal details',
                        completionText: '${sectionCounts['Personal details']!['filled']} of ${sectionCounts['Personal details']!['total']} answered',
                        children: _buildPersonalDetailsFields(),
                      ),

                      _buildSectionTile(
                        index: 1,
                        title: 'Family',
                        completionText: '${sectionCounts['Family']!['filled']} of ${sectionCounts['Family']!['total']} answered',
                        children: _buildFamilyFields(),
                      ),

                      _buildSectionTile(
                        index: 2,
                        title: 'Education',
                        completionText: '${sectionCounts['Education']!['filled']} of ${sectionCounts['Education']!['total']} answered',
                        children: _buildEducationFields(),
                      ),

                      _buildSectionTile(
                        index: 3,
                        title: 'Work & income',
                        completionText: '${sectionCounts['Work & income']!['filled']} of ${sectionCounts['Work & income']!['total']} answered',
                        children: _buildWorkIncomeFields(),
                      ),

                      _buildSectionTile(
                        index: 4,
                        title: 'Assets & household',
                        completionText: '${sectionCounts['Assets & household']!['filled']} of ${sectionCounts['Assets & household']!['total']} answered',
                        children: _buildAssetsHouseholdFields(),
                      ),

                      _buildSectionTile(
                        index: 5,
                        title: 'Health',
                        completionText: '${sectionCounts['Health']!['filled']} of ${sectionCounts['Health']!['total']} answered',
                        children: _buildHealthFields(),
                      ),

                      _buildSectionTile(
                        index: 6,
                        title: 'Additional details',
                        completionText: '${sectionCounts['Additional details']!['filled']} of ${sectionCounts['Additional details']!['total']} answered',
                        children: _buildAdditionalDetailsFields(),
                      ),

                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            ),

            // Fixed Bottom Bar with Two Buttons Side by Side
            Container(
              padding: const EdgeInsets.all(16.0),
              decoration: BoxDecoration(
                color: Theme.of(context).scaffoldBackgroundColor,
                boxShadow: const [
                  BoxShadow(color: Colors.black12, blurRadius: 6, offset: Offset(0, -2)),
                ],
              ),
              child: Row(
                children: [
                  // Back to Dashboard (Secondary)
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        side: BorderSide(color: Theme.of(context).colorScheme.primary),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: _handleBackToDashboard,
                      child: const Text('Back to dashboard', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  // Save Profile (Primary)
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        foregroundColor: Theme.of(context).colorScheme.onPrimary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: _isSaving ? null : _saveProfileExplicitly,
                      child: _isSaving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('Save profile', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionTile({
    required int index,
    required String title,
    required String completionText,
    required List<Widget> children,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          key: Key('section_tile_$index'),
          initiallyExpanded: _expandedSections[index],
          onExpansionChanged: (val) {
            setState(() {
              _expandedSections[index] = val;
            });
          },
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          subtitle: Text(completionText, style: TextStyle(fontSize: 12, color: Colors.grey[700])),
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: children,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // --- SECTION 1: Personal details ---
  List<Widget> _buildPersonalDetailsFields() {
    return [
      Row(
        children: [
          Expanded(
            child: TextFormField(
              controller: _ageController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Age (Years)',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.cake),
              ),
              validator: (val) {
                if (val != null && val.isNotEmpty) {
                  final parsed = int.tryParse(val);
                  if (parsed == null || parsed < 0 || parsed > 120) return 'Enter 0 - 120';
                }
                return null;
              },
              onChanged: (_) => _onFieldChanged(),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: DropdownButtonFormField<String>(
              initialValue: _profile.gender,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Gender',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.person),
              ),
              items: const [
                DropdownMenuItem(value: 'F', child: Text('Female')),
                DropdownMenuItem(value: 'M', child: Text('Male')),
                DropdownMenuItem(value: 'O', child: Text('Other')),
                DropdownMenuItem(value: 'prefer_not_to_say', child: Text('Prefer not to say')),
              ],
              onChanged: (val) {
                _profile.gender = val;
                _onFieldChanged();
              },
            ),
          ),
        ],
      ),
      const SizedBox(height: 12),
      DropdownButtonFormField<String>(
        initialValue: _profile.district,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'District',
          border: OutlineInputBorder(),
          prefixIcon: Icon(Icons.location_city),
        ),
        items: _tnDistricts.map((d) => DropdownMenuItem(value: d, child: Text(d))).toList(),
        onChanged: (val) {
          _profile.district = val;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _profile.areaType,
              decoration: const InputDecoration(
                labelText: 'Area type',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.map),
              ),
              items: const [
                DropdownMenuItem(value: 'Rural', child: Text('Rural')),
                DropdownMenuItem(value: 'Urban', child: Text('Urban')),
              ],
              onChanged: (val) {
                _profile.areaType = val;
                _onFieldChanged();
              },
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: DropdownButtonFormField<String>(
              initialValue: _profile.community,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Community',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.people),
              ),
              items: const [
                DropdownMenuItem(value: 'OC', child: Text('OC')),
                DropdownMenuItem(value: 'BC', child: Text('BC')),
                DropdownMenuItem(value: 'MBC', child: Text('MBC')),
                DropdownMenuItem(value: 'SC', child: Text('SC')),
                DropdownMenuItem(value: 'ST', child: Text('ST')),
                DropdownMenuItem(value: 'prefer_not_to_say', child: Text('Prefer not to say')),
              ],
              onChanged: (val) {
                _profile.community = val;
                _onFieldChanged();
              },
            ),
          ),
        ],
      ),
      const SizedBox(height: 6),
      const Text(
        'Optional, used only to check scheme conditions, stays on your phone',
        style: TextStyle(fontSize: 11, color: Colors.grey),
      ),
      const SizedBox(height: 8),
    ];
  }

  // --- SECTION 2: Family ---
  List<Widget> _buildFamilyFields() {
    return [
      DropdownButtonFormField<String>(
        isExpanded: true,
        initialValue: _profile.marital,
        decoration: const InputDecoration(
          labelText: 'Marital status',
          border: OutlineInputBorder(),
          prefixIcon: Icon(Icons.favorite),
        ),
        items: const [
          DropdownMenuItem(value: 'unmarried', child: Text('Unmarried')),
          DropdownMenuItem(value: 'married', child: Text('Married')),
          DropdownMenuItem(value: 'widowed', child: Text('Widowed')),
          DropdownMenuItem(value: 'deserted', child: Text('Deserted or divorced')),
          DropdownMenuItem(value: 'prefer_not_to_say', child: Text('Prefer not to say')),
        ],
        onChanged: (val) {
          _profile.marital = val;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),

      // Married follow-ups
      if (_profile.marital == 'married') ...[
        DropdownButtonFormField<bool>(
          isExpanded: true,
          initialValue: _profile.spouseLivingWith,
          decoration: const InputDecoration(
            labelText: 'Is your spouse living with you?',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: true, child: Text('Yes')),
            DropdownMenuItem(value: false, child: Text('No')),
          ],
          onChanged: (val) {
            _profile.spouseLivingWith = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _childrenCountController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Number of children',
            border: OutlineInputBorder(),
          ),
          onChanged: (_) => _onFieldChanged(),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<bool>(
          isExpanded: true,
          initialValue: _profile.daughterUnder18,
          decoration: const InputDecoration(
            labelText: 'Do you have a daughter below 18?',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: true, child: Text('Yes')),
            DropdownMenuItem(value: false, child: Text('No')),
          ],
          onChanged: (val) {
            _profile.daughterUnder18 = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),
        // Pregnancy & Maternity follow-ups (for women)
        if (_profile.gender == 'F' || _profile.gender == 'Female') ...[
          DropdownButtonFormField<bool>(
            isExpanded: true,
            initialValue: _profile.isPregnant,
            decoration: const InputDecoration(
              labelText: 'Are you currently pregnant?',
              helperText: 'For Dr. Muthulakshmi Reddy Maternity Scheme (₹18,000 + Nutrition Kits)',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: true, child: Text('Yes, currently pregnant')),
              DropdownMenuItem(value: false, child: Text('No')),
            ],
            onChanged: (val) {
              _profile.isPregnant = val;
              _onFieldChanged();
            },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<bool>(
            isExpanded: true,
            initialValue: _profile.hasNewborn,
            decoration: const InputDecoration(
              labelText: 'Have you recently had a child (baby aged 0–1 year)?',
              helperText: 'For Thaimaaman Seer Thittam (Gold ring scheme for govt hospital delivery)',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: true, child: Text('Yes, delivered a baby recently')),
              DropdownMenuItem(value: false, child: Text('No')),
            ],
            onChanged: (val) {
              _profile.hasNewborn = val;
              _onFieldChanged();
            },
          ),
          if (_profile.hasNewborn == true || _profile.isPregnant == true) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _profile.deliveryPlace,
              decoration: const InputDecoration(
                labelText: 'Delivery hospital / Planned hospital',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'Government Hospital', child: Text('Government Hospital / PHC (eligible for gold ring & kits)')),
                DropdownMenuItem(value: 'Private Hospital', child: Text('Private Hospital / Nursing Home')),
                DropdownMenuItem(value: 'Home / Other', child: Text('Home / Other')),
              ],
              onChanged: (val) {
                _profile.deliveryPlace = val;
                _onFieldChanged();
              },
            ),
          ],
          const SizedBox(height: 12),
        ],


      ],

      // Widowed follow-ups
      if (_profile.marital == 'widowed') ...[
        DropdownButtonFormField<bool>(
          isExpanded: true,
          initialValue: _profile.deathCertAvailable,
          decoration: const InputDecoration(
            labelText: "Is your husband's death certificate available?",
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: true, child: Text('Yes')),
            DropdownMenuItem(value: false, child: Text('No')),
          ],
          onChanged: (val) {
            _profile.deathCertAvailable = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<bool>(
          isExpanded: true,
          initialValue: _profile.familyPension,
          decoration: const InputDecoration(
            labelText: 'Do you receive a family pension?',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: true, child: Text('Yes')),
            DropdownMenuItem(value: false, child: Text('No')),
          ],
          onChanged: (val) {
            _profile.familyPension = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _depChildrenCountController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Number of dependent children',
            border: OutlineInputBorder(),
          ),
          onChanged: (_) => _onFieldChanged(),
        ),
        const SizedBox(height: 12),
      ],

      // Deserted / divorced follow-ups
      if (_profile.marital == 'deserted') ...[
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _profile.separatedYears,
          decoration: const InputDecoration(
            labelText: 'Legally divorced or separated for > 5 years?',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'Yes', child: Text('Yes')),
            DropdownMenuItem(value: 'No', child: Text('No')),
            DropdownMenuItem(value: 'Court certificate available', child: Text('Court certificate available')),
          ],
          onChanged: (val) {
            _profile.separatedYears = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),
      ],

      // Unmarried & Age 50+ follow-up
      if (_profile.marital == 'unmarried' && (_profile.age != null && _profile.age! >= 50)) ...[
        DropdownButtonFormField<bool>(
          isExpanded: true,
          initialValue: _profile.unmarriedFamilySupport,
          decoration: const InputDecoration(
            labelText: 'Do you have any family support?',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: true, child: Text('Yes')),
            DropdownMenuItem(value: false, child: Text('No')),
          ],
          onChanged: (val) {
            _profile.unmarriedFamilySupport = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),
      ],

      // Ration card head
      DropdownButtonFormField<String>(
        initialValue: _profile.rationCardHead,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'Who is named as head of your family on the ration card?',
          border: OutlineInputBorder(),
        ),
        items: const [
          DropdownMenuItem(value: 'self', child: Text('Me')),
          DropdownMenuItem(value: 'spouse', child: Text('My husband (I am his wife)')),
          DropdownMenuItem(value: 'other', child: Text('Another family member')),
          DropdownMenuItem(value: 'none', child: Text('I do not have a ration card')),
          DropdownMenuItem(value: 'unknown', child: Text('Not sure')),
        ],
        onChanged: (val) {
          _profile.rationCardHead = val;
          _profile.famhead = (val == 'self');
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),

      // Permanent resident of Tamil Nadu?
      DropdownButtonFormField<bool>(
        isExpanded: true,
        initialValue: _profile.isTnResident,
        decoration: const InputDecoration(
          labelText: 'Permanent resident of Tamil Nadu? (Optional)',
          border: OutlineInputBorder(),
        ),
        items: const [
          DropdownMenuItem(value: true, child: Text('Yes')),
          DropdownMenuItem(value: false, child: Text('No')),
        ],
        onChanged: (val) {
          _profile.isTnResident = val;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),

      DropdownButtonFormField<String>(
        isExpanded: true,
        initialValue: _profile.rationCardType,
        decoration: const InputDecoration(
          labelText: 'Ration card type',
          border: OutlineInputBorder(),
        ),
        items: const [
          DropdownMenuItem(value: 'PHH', child: Text('PHH (Priority Household)')),
          DropdownMenuItem(value: 'PHH-AAY', child: Text('PHH-AAY (Antyodaya Anna Yojana)')),
          DropdownMenuItem(value: 'NPHH', child: Text('NPHH (Non-Priority)')),
          DropdownMenuItem(value: 'No ration card', child: Text('No ration card')),
          DropdownMenuItem(value: 'Not sure', child: Text('Not sure')),
        ],
        onChanged: (val) {
          _profile.rationCardType = val;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),

      TextFormField(
        controller: _familyMembersCountController,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(
          labelText: 'Number of family members',
          border: OutlineInputBorder(),
        ),
        onChanged: (_) => _onFieldChanged(),
      ),
      const SizedBox(height: 8),
    ];
  }

  // --- SECTION 3: Education ---
  List<Widget> _buildEducationFields() {
    bool isStudent = _profile.role == 'School student' ||
        _profile.role == 'College student' ||
        _profile.role == 'Higher studies';

    return [
      DropdownButtonFormField<String>(
        initialValue: _profile.role,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'Current role',
          border: OutlineInputBorder(),
          prefixIcon: Icon(Icons.school),
        ),
        items: const [
          DropdownMenuItem(value: 'Not studying', child: Text('Not studying')),
          DropdownMenuItem(value: 'School student', child: Text('School student')),
          DropdownMenuItem(value: 'College student', child: Text('College student')),
          DropdownMenuItem(value: 'Higher studies', child: Text('Higher studies (Research / PhD)')),
          DropdownMenuItem(value: 'Completed studies', child: Text('Completed studies')),
        ],
        onChanged: (val) {
          _profile.role = val;
          if (val == 'College student' || val == 'Higher studies') {
            _profile.highered = true;
          } else if (val == 'Completed studies' || val == 'Not studying') {
            _profile.highered = false;
          }
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),

      if (_profile.role == 'School student') ...[
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _profile.classStudied,
          decoration: const InputDecoration(
            labelText: 'Class (1 to 12)',
            border: OutlineInputBorder(),
          ),
          items: List.generate(12, (i) => i + 1)
              .map((c) => DropdownMenuItem(value: '$c', child: Text('Class $c')))
              .toList(),
          onChanged: (val) {
            _profile.classStudied = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),
      ],

      if (_profile.role == 'College student') ...[
        DropdownButtonFormField<String>(
          initialValue: _profile.courseType,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Course type',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'UG', child: Text('UG (Undergraduate)')),
            DropdownMenuItem(value: 'PG', child: Text('PG (Postgraduate)')),
            DropdownMenuItem(value: 'Diploma / Polytechnic', child: Text('Diploma / Polytechnic')),
            DropdownMenuItem(value: 'ITI', child: Text('ITI')),
            DropdownMenuItem(value: 'Professional course', child: Text('Professional course')),
          ],
          onChanged: (val) {
            _profile.courseType = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),
      ],

      if (_profile.role == 'Completed studies' || _profile.role == 'Not studying') ...[
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _profile.highestQual,
          decoration: const InputDecoration(
            labelText: 'Highest qualification completed',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'Below 10th', child: Text('Below 10th')),
            DropdownMenuItem(value: '10th Pass', child: Text('10th Pass')),
            DropdownMenuItem(value: '12th Pass', child: Text('12th Pass')),
            DropdownMenuItem(value: 'Graduate', child: Text('Graduate (Degree completed)')),
            DropdownMenuItem(value: 'Post-Graduate', child: Text('Post-Graduate')),
          ],
          onChanged: (val) {
            _profile.highestQual = val;
            _onFieldChanged();
          },
        ),
        if ((_profile.highestQual == 'Graduate' || _profile.highestQual == 'Post-Graduate') &&
            _profile.workStatus == 'Unemployed') ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.blue.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.blue.shade200),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline, size: 18, color: Colors.blue.shade800),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Unemployed graduate profile: Eligible for TN Unemployed Youth Welfare Assistance, TVK youth welfare schemes & Naan Mudhalvan competitive exam stipends.',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF1E3A8A)),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
      ],

      if (isStudent) ...[
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _profile.institutionType,
          decoration: const InputDecoration(
            labelText: 'Type of institution',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'Government', child: Text('Government')),
            DropdownMenuItem(value: 'Government-aided', child: Text('Government-aided')),
            DropdownMenuItem(value: 'Private', child: Text('Private')),
          ],
          onChanged: (val) {
            _profile.institutionType = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),

        DropdownButtonFormField<bool>(
          initialValue: _profile.govschool,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Studied Classes 6–12 in Govt or Govt-aided school?',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: true, child: Text('Yes')),
            DropdownMenuItem(value: false, child: Text('No')),
          ],
          onChanged: (val) {
            _profile.govschool = val ?? false;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 4),
        const Text(
          'Required for Pudhumai Penn and Tamil Pudhalvan ₹1,000/mo schemes',
          style: TextStyle(fontSize: 11, color: Colors.grey),
        ),
        const SizedBox(height: 12),

        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _profile.courseMode,
          decoration: const InputDecoration(
            labelText: 'Regular course or distance / open university?',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'Regular', child: Text('Regular course')),
            DropdownMenuItem(value: 'Distance', child: Text('Distance / open university')),
          ],
          onChanged: (val) {
            _profile.courseMode = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),

        DropdownButtonFormField<bool>(
          isExpanded: true,
          initialValue: _profile.firstGraduate,
          decoration: const InputDecoration(
            labelText: 'First graduate in your family?',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: true, child: Text('Yes')),
            DropdownMenuItem(value: false, child: Text('No')),
          ],
          onChanged: (val) {
            _profile.firstGraduate = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),

        DropdownButtonFormField<bool>(
          isExpanded: true,
          initialValue: _profile.hostelStay,
          decoration: const InputDecoration(
            labelText: 'Do you stay in a hostel?',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: true, child: Text('Yes')),
            DropdownMenuItem(value: false, child: Text('No')),
          ],
          onChanged: (val) {
            _profile.hostelStay = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),
      ],
    ];
  }

  // --- SECTION 4: Work & income ---
  List<Widget> _buildWorkIncomeFields() {
    return [
      DropdownButtonFormField<String>(
        initialValue: _profile.workStatus,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'Work status',
          border: OutlineInputBorder(),
          prefixIcon: Icon(Icons.work),
        ),
        items: const [
          DropdownMenuItem(value: 'Employed', child: Text('Employed')),
          DropdownMenuItem(value: 'Self-employed', child: Text('Self-employed')),
          DropdownMenuItem(value: 'Farmer', child: Text('Farmer')),
          DropdownMenuItem(value: 'Agricultural labourer', child: Text('Agricultural labourer')),
          DropdownMenuItem(value: 'Daily wage', child: Text('Daily wage / unorganised worker')),
          DropdownMenuItem(value: 'Unemployed', child: Text('Unemployed')),
          DropdownMenuItem(value: 'Homemaker', child: Text('Homemaker')),
          DropdownMenuItem(value: 'Retired', child: Text('Retired')),
          DropdownMenuItem(value: 'Student only', child: Text('Student only')),
        ],
        onChanged: (val) {
          _profile.workStatus = val;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),

      if (_profile.workStatus == 'Employed') ...[
        DropdownButtonFormField<String>(
          initialValue: _profile.employmentSector,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Sector',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'Government-Permanent', child: Text('Government (Permanent)')),
            DropdownMenuItem(value: 'Government-Temporary', child: Text('Government (Temporary / Contract)')),
            DropdownMenuItem(value: 'Private', child: Text('Private')),
            DropdownMenuItem(value: 'Other', child: Text('Other')),
          ],
          onChanged: (val) {
            _profile.employmentSector = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 4),
        const Text(
          'Used to check government employee exclusions for pension & welfare schemes',
          style: TextStyle(fontSize: 11, color: Colors.grey),
        ),
        const SizedBox(height: 12),
        if (_profile.employmentSector != null && _profile.employmentSector!.startsWith('Government')) ...[
           DropdownButtonFormField<String>(
             initialValue: _profile.govtServiceStatus,
             isExpanded: true,
             decoration: const InputDecoration(
               labelText: 'Service Status',
               border: OutlineInputBorder(),
             ),
             items: const [
               DropdownMenuItem(value: 'Active', child: Text('Active')),
               DropdownMenuItem(value: 'Pensioner', child: Text('Pensioner')),
               DropdownMenuItem(value: 'Family Pensioner', child: Text('Family Pensioner')),
             ],
             onChanged: (val) {
               _profile.govtServiceStatus = val;
               _onFieldChanged();
             },
           ),
           const SizedBox(height: 12),
           DropdownButtonFormField<String>(
             initialValue: _profile.pensionSystem,
             isExpanded: true,
             decoration: const InputDecoration(
               labelText: 'Pension System',
               border: OutlineInputBorder(),
             ),
             items: const [
               DropdownMenuItem(value: 'CPS', child: Text('CPS')),
               DropdownMenuItem(value: 'EPF', child: Text('EPF')),
               DropdownMenuItem(value: 'Old Pension Scheme', child: Text('Old Pension Scheme')),
               DropdownMenuItem(value: 'None', child: Text('None')),
             ],
             onChanged: (val) {
               _profile.pensionSystem = val;
               _onFieldChanged();
             },
           ),
           const SizedBox(height: 12),
        ],

        TextFormField(
          controller: _ownIncomeController,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: 'Your own annual income (₹)',
            border: const OutlineInputBorder(),
            prefixIcon: const Icon(Icons.currency_rupee),
            suffixIcon: IconButton(
              icon: const Icon(Icons.calculate),
              tooltip: 'Calculate from monthly',
              onPressed: () => _showIncomeHelperDialog(_ownIncomeController),
            ),
          ),
          onChanged: (_) => _onFieldChanged(),
        ),
        const SizedBox(height: 12),
      ],

      if (_profile.workStatus == 'Self-employed' ||
          _profile.workStatus == 'Farmer' ||
          _profile.workStatus == 'Agricultural labourer' ||
          _profile.workStatus == 'Daily wage') ...[
        TextFormField(
          controller: _ownIncomeController,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: 'Your own annual income (₹)',
            border: const OutlineInputBorder(),
            prefixIcon: const Icon(Icons.currency_rupee),
            suffixIcon: IconButton(
              icon: const Icon(Icons.calculate),
              tooltip: 'Calculate from monthly',
              onPressed: () => _showIncomeHelperDialog(_ownIncomeController),
            ),
          ),
          onChanged: (_) => _onFieldChanged(),
        ),
        const SizedBox(height: 12),

        if (_profile.workStatus == 'Self-employed') ...[
          Card(
            elevation: 0,
            color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.25),
            child: Padding(
              padding: const EdgeInsets.all(12.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Manufacturing & Industrial Enterprises (for DIC Subsidies)',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Manufacturing / Industrial Unit Owner'),
                    subtitle: const Text('Engaged in micro, small or medium manufacturing / industrial unit'),
                    value: _profile.isManufacturer,
                    onChanged: (val) {
                      setState(() {
                        _profile.isManufacturer = val ?? false;
                      });
                      _onFieldChanged();
                    },
                  ),
                  if (_profile.isManufacturer) ...[
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      isExpanded: true,
                      initialValue: _profile.enterpriseType ?? 'Micro',
                      decoration: const InputDecoration(
                        labelText: 'Enterprise Category',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'Micro', child: Text('Micro Enterprise (< ₹1 Cr investment)')),
                        DropdownMenuItem(value: 'Small', child: Text('Small Enterprise (< ₹10 Cr investment)')),
                        DropdownMenuItem(value: 'Medium', child: Text('Medium Enterprise (< ₹50 Cr investment)')),
                      ],
                      onChanged: (val) {
                        _profile.enterpriseType = val;
                        _onFieldChanged();
                      },
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

        if (_profile.workStatus == 'Farmer') ...[
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _profile.farmerType,
            decoration: const InputDecoration(
              labelText: 'Land ownership',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'Own land', child: Text('Own land')),
              DropdownMenuItem(value: 'Tenant', child: Text('Tenant')),
              DropdownMenuItem(value: 'Landless labourer', child: Text('Landless labourer')),
            ],
            onChanged: (val) {
              _profile.farmerType = val;
              _onFieldChanged();
            },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<bool>(
            isExpanded: true,
            initialValue: _profile.isFarming,
            decoration: const InputDecoration(
              labelText: 'Are you actively farming and cultivating crops?',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: true, child: Text('Yes, currently actively cultivating')),
              DropdownMenuItem(value: false, child: Text('No / Inactive')),
            ],
            onChanged: (val) {
              setState(() {
                _profile.isFarming = val;
              });
              _onFieldChanged();
            },
          ),
          const SizedBox(height: 12),
          const Text('What crops do you cultivate?', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 4),
          const Text('Helps match schemes like Gypsum subsidy, certified seeds, pulses mission, etc.', style: TextStyle(fontSize: 11, color: Colors.grey)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              'Paddy (நெல்)',
              'Oil seeds (எண்ணெய் வித்துக்கள்)',
              'Groundnut (வேர்க்கடலை)',
              'Pulses (பருப்பு வகைகள்)',
              'Cotton (பருத்தி)',
              'Sugarcane (கரும்பு)',
              'Millets (சிறு தானியங்கள்)',
              'Horticulture / Vegetables (தோட்டக்கலை)',
            ].map((crop) {
              final isChecked = _profile.cropsCultivated.contains(crop);
              return FilterChip(
                label: Text(crop),
                selected: isChecked,
                onSelected: (selected) {
                  setState(() {
                    if (selected) {
                      _profile.cropsCultivated.add(crop);
                    } else {
                      _profile.cropsCultivated.remove(crop);
                    }
                  });
                  _onFieldChanged();
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 12),
        ],
      ],

      if (_profile.workStatus == 'Unemployed' || _profile.workStatus == 'Homemaker') ...[
        const Text('How does your family manage expenses?', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: [
            'Spouse\'s income',
            'Children\'s income',
            'Pension',
            'Rent',
            'Farming',
            'Savings interest',
            'Money from relatives',
            'None'
          ].map((src) {
            final isChecked = _profile.expenseSources.contains(src);
            return FilterChip(
              label: Text(src),
              selected: isChecked,
              onSelected: (selected) {
                if (selected) {
                  _profile.expenseSources.add(src);
                } else {
                  _profile.expenseSources.remove(src);
                }
                _onFieldChanged();
              },
            );
          }).toList(),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _otherIncomeController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Any other income in the year? (₹)',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.currency_rupee),
          ),
          onChanged: (_) => _onFieldChanged(),
        ),
        const SizedBox(height: 12),
      ],

      if (_profile.workStatus == 'Retired') ...[
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _profile.retiredFrom,
          decoration: const InputDecoration(
            labelText: 'Retired from',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'Government', child: Text('Government')),
            DropdownMenuItem(value: 'Private', child: Text('Private')),
            DropdownMenuItem(value: 'Other', child: Text('Other')),
          ],
          onChanged: (val) {
            _profile.retiredFrom = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<bool>(
          isExpanded: true,
          initialValue: _profile.receivesPension,
          decoration: const InputDecoration(
            labelText: 'Do you receive a pension?',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: true, child: Text('Yes')),
            DropdownMenuItem(value: false, child: Text('No')),
          ],
          onChanged: (val) {
            _profile.receivesPension = val;
            _onFieldChanged();
          },
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _pensionAmountController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Monthly pension amount (approximate, ₹)',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.currency_rupee),
          ),
          onChanged: (_) => _onFieldChanged(),
        ),
        const SizedBox(height: 12),
      ],

      // Family Income
      TextFormField(
        controller: _familyIncomeController,
        keyboardType: TextInputType.number,
        decoration: InputDecoration(
          labelText: 'Total annual family income (₹, approximate)',
          border: const OutlineInputBorder(),
          prefixIcon: const Icon(Icons.currency_rupee),
          helperText: 'Add all earnings of everyone in family for one year. Monthly × 12',
          suffixIcon: IconButton(
            icon: const Icon(Icons.calculate),
            tooltip: 'Calculate from monthly',
            onPressed: () => _showIncomeHelperDialog(_familyIncomeController),
          ),
        ),
        onChanged: (_) => _onFieldChanged(),
      ),
      const SizedBox(height: 12),

      DropdownButtonFormField<String>(
        isExpanded: true,
        initialValue: (() {
          final val = _profile.incomeRangeBand;
          if (val == null) return null;
          if (val == 'under 1 lakh' || val == 'under ₹1 lakh') return 'under ₹1 lakh';
          if (val == '1–2.5 lakh' || val == '₹1 to 2.5 lakh') return '₹1 to 2.5 lakh';
          if (val == '2.5–5 lakh' || val == '₹2.5 to 5 lakh') return '₹2.5 to 5 lakh';
          if (val == 'above 5 lakh' || val == 'above ₹5 lakh') return 'above ₹5 lakh';
          if (val == 'Not sure') return 'Not sure';
          return null;
        })(),
        decoration: const InputDecoration(
          labelText: 'Income range (if exact amount unknown)',
          border: OutlineInputBorder(),
        ),
        items: const [
          DropdownMenuItem(value: 'under ₹1 lakh', child: Text('Under ₹1 lakh')),
          DropdownMenuItem(value: '₹1 to 2.5 lakh', child: Text('₹1 lakh – ₹2.5 lakh')),
          DropdownMenuItem(value: '₹2.5 to 5 lakh', child: Text('₹2.5 lakh – ₹5 lakh')),
          DropdownMenuItem(value: 'above ₹5 lakh', child: Text('Above ₹5 lakh')),
          DropdownMenuItem(value: 'Not sure', child: Text('Not sure')),
        ],
        onChanged: (val) {
          _profile.incomeRangeBand = val;
          _profile.incomeIsApproximate = true;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),

      // Loan interest questions for all profiles
      Card(
        elevation: 0,
        color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.35),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.3)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.account_balance, size: 20, color: Theme.of(context).colorScheme.primary),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Loan & Credit Requirements',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<bool>(
                isExpanded: true,
                initialValue: _profile.interestedInLoan,
                decoration: const InputDecoration(
                  labelText: 'Are you interested in applying for a government / bank loan?',
                  helperText: 'For jewel loans, cooperative agriculture credit, consumer & housing loans',
                  border: OutlineInputBorder(),
                  fillColor: Colors.white,
                  filled: true,
                ),
                items: const [
                  DropdownMenuItem(value: true, child: Text('Yes, interested in applying for a loan')),
                  DropdownMenuItem(value: false, child: Text('No, not interested in any loan')),
                ],
                onChanged: (val) {
                  setState(() {
                    _profile.interestedInLoan = val;
                    if (val == false) {
                      _profile.loanType = null;
                    }
                  });
                  _onFieldChanged();
                },
              ),
              if (_profile.interestedInLoan == true) ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _profile.loanType,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'What type of loan are you looking for?',
                    border: OutlineInputBorder(),
                    fillColor: Colors.white,
                    filled: true,
                  ),
                  items: const [
                    DropdownMenuItem(value: 'Jewel loan', child: Text('Gold / Jewel Loan (நகைக்கடன்)')),
                    DropdownMenuItem(value: 'Land / Mortgage loan', child: Text('Land / Agriculture Mortgage Loan (நிலக்கடன்)')),
                    DropdownMenuItem(value: 'Consumer durable loan', child: Text('Consumer Durables / Household Appliance Loan')),
                    DropdownMenuItem(value: 'Two-wheeler loan', child: Text('Two-Wheeler Loan (இருசக்கர வாகனக் கடன்)')),
                    DropdownMenuItem(value: 'Business loan', child: Text('Micro / Small Business Loan (தொழில் கடன்)')),
                  ],
                  onChanged: (val) {
                    setState(() {
                      _profile.loanType = val;
                    });
                    _onFieldChanged();
                  },
                ),
              ],
            ],
          ),
        ),
      ),
      const SizedBox(height: 12),

      CheckboxListTile(
        title: const Text('Anyone in the family is a government employee'),
        value: _profile.govtEmployeeInFamily,
        onChanged: (val) {
          _profile.govtEmployeeInFamily = val ?? false;
          _onFieldChanged();
        },
      ),
      CheckboxListTile(
        title: const Text('Anyone in the family pays income tax'),
        value: _profile.taxPayer,
        onChanged: (val) {
          _profile.taxPayer = val ?? false;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 8),
    ];
  }

  // --- SECTION 5: Assets & household ---
  List<Widget> _buildAssetsHouseholdFields() {
    return [
      CheckboxListTile(
        title: const Text('Owns a personal four-wheeler (car or jeep)'),
        subtitle: const Text('Used for KMUT and welfare scheme exclusions'),
        value: _profile.hasCar,
        onChanged: (val) {
          _profile.hasCar = val ?? false;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),

      Row(
        children: [
          Expanded(
            child: TextFormField(
              controller: _landWetController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Wetland acres',
                border: OutlineInputBorder(),
                helperText: '0 if none',
              ),
              onChanged: (_) => _onFieldChanged(),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: TextFormField(
              controller: _landDryController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Dryland acres',
                border: OutlineInputBorder(),
                helperText: '0 if none',
              ),
              onChanged: (_) => _onFieldChanged(),
            ),
          ),
        ],
      ),
      const SizedBox(height: 4),
      const Text(
        'Some schemes limit land to under 5 acres wetland or 10 acres dryland',
        style: TextStyle(fontSize: 11, color: Colors.grey),
      ),
      const SizedBox(height: 12),

      // Dynamic prompt if user owns land and isn't already asked under Farmer work status
      if (((double.tryParse(_landWetController.text) ?? _profile.landWetAcres ?? 0) > 0 ||
           (double.tryParse(_landDryController.text) ?? _profile.landDryAcres ?? 0) > 0) &&
          _profile.workStatus != 'Farmer') ...[
        Card(
          elevation: 0,
          color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.35),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: BorderSide(color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.3)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.agriculture, size: 20, color: Theme.of(context).colorScheme.primary),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Agricultural Land Cultivation',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<bool>(
                  isExpanded: true,
                  initialValue: _profile.isFarming,
                  decoration: const InputDecoration(
                    labelText: 'Are you actively farming on your land?',
                    border: OutlineInputBorder(),
                    fillColor: Colors.white,
                    filled: true,
                  ),
                  items: const [
                    DropdownMenuItem(value: true, child: Text('Yes, actively farming / cultivating')),
                    DropdownMenuItem(value: false, child: Text('No (leased out / uncultivated)')),
                  ],
                  onChanged: (val) {
                    setState(() {
                      _profile.isFarming = val;
                    });
                    _onFieldChanged();
                  },
                ),
                if (_profile.isFarming == true) ...[
                  const SizedBox(height: 12),
                  const Text('What crops are cultivated on this land?', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  const SizedBox(height: 4),
                  const Text('For subsidies like certified seeds, gypsum, pulses & micro-irrigation', style: TextStyle(fontSize: 11, color: Colors.grey)),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      'Paddy (நெல்)',
                      'Oil seeds (எண்ணெய் வித்துக்கள்)',
                      'Groundnut (வேர்க்கடலை)',
                      'Pulses (பருப்பு வகைகள்)',
                      'Cotton (பருத்தி)',
                      'Sugarcane (கரும்பு)',
                      'Millets (சிறு தானியங்கள்)',
                      'Horticulture / Vegetables (தோட்டக்கலை)',
                    ].map((crop) {
                      final isChecked = _profile.cropsCultivated.contains(crop);
                      return FilterChip(
                        label: Text(crop),
                        selected: isChecked,
                        onSelected: (selected) {
                          setState(() {
                            if (selected) {
                              _profile.cropsCultivated.add(crop);
                            } else {
                              _profile.cropsCultivated.remove(crop);
                            }
                          });
                          _onFieldChanged();
                        },
                      );
                    }).toList(),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
      ],

      TextFormField(
        controller: _electricityUnitsController,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(
          labelText: 'Household electricity use per year (units)',
          border: OutlineInputBorder(),
          helperText: 'e.g. 3600 units/year',
        ),
        onChanged: (_) => _onFieldChanged(),
      ),
      const SizedBox(height: 12),

      DropdownButtonFormField<String>(
        isExpanded: true,
        initialValue: _profile.homeOwnership,
        decoration: const InputDecoration(
          labelText: 'Owns a house',
          border: OutlineInputBorder(),
        ),
        items: const [
          DropdownMenuItem(value: 'Own', child: Text('Own')),
          DropdownMenuItem(value: 'Rented', child: Text('Rented')),
          DropdownMenuItem(value: 'None', child: Text('None')),
          DropdownMenuItem(value: 'Hut or thatched', child: Text('Hut or thatched')),
        ],
        onChanged: (val) {
          _profile.homeOwnership = val;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),

      DropdownButtonFormField<String>(
        isExpanded: true,
        initialValue: (() {
          final val = _profile.fixedAssetsBand;
          if (val == null) return null;
          if (val == 'under ₹1 lakh' || val == 'under 1 lakh') return 'under ₹1 lakh';
          if (val == 'above ₹1 lakh' || val == 'above 1 lakh') return 'above ₹1 lakh';
          if (val == 'Not sure') return 'Not sure';
          return null;
        })(),
        decoration: const InputDecoration(
          labelText: 'Fixed assets value',
          border: OutlineInputBorder(),
        ),
        items: const [
          DropdownMenuItem(value: 'under ₹1 lakh', child: Text('Under ₹1 lakh')),
          DropdownMenuItem(value: 'above ₹1 lakh', child: Text('Above ₹1 lakh')),
          DropdownMenuItem(value: 'Not sure', child: Text('Not sure')),
        ],
        onChanged: (val) {
          _profile.fixedAssetsBand = val;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 8),
    ];
  }

  // --- SECTION 6: Health ---
  List<Widget> _buildHealthFields() {
    return [
      Card(
        elevation: 0,
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        child: Padding(
          padding: const EdgeInsets.all(12.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Disability Percentage: ${_profile.disability}%',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              Slider(
                value: _profile.disability.toDouble(),
                min: 0,
                max: 100,
                divisions: 20,
                label: '${_profile.disability}%',
                onChanged: (val) {
                  setState(() {
                    _profile.disability = val.round();
                  });
                  _onFieldChanged();
                },
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 12),

      DropdownButtonFormField<bool>(
        isExpanded: true,
        initialValue: _profile.disabilityCertAvailable,
        decoration: const InputDecoration(
          labelText: 'Disability certificate available?',
          border: OutlineInputBorder(),
        ),
        items: const [
          DropdownMenuItem(value: true, child: Text('Yes')),
          DropdownMenuItem(value: false, child: Text('No')),
        ],
        onChanged: (val) {
          _profile.disabilityCertAvailable = val;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),

      Card(
        elevation: 0,
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.25),
        child: Padding(
          padding: const EdgeInsets.all(12.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Vision & Eye Health',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
              ),
              const SizedBox(height: 4),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Eye / Vision Problem or Needs Spectacles'),
                subtitle: const Text('Requires prescription eyeglasses, spectacles subsidy, or cataract treatment'),
                value: _profile.hasEyeProblem,
                onChanged: (val) {
                  setState(() {
                    _profile.hasEyeProblem = val ?? false;
                  });
                  _onFieldChanged();
                },
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 12),

      Card(
        elevation: 0,
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.25),
        child: Padding(
          padding: const EdgeInsets.all(12.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Medical & Critical Illnesses (for Health Schemes & CMCHIS)',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
              ),
              const SizedBox(height: 6),
              ...[
                'Cancer',
                'Kidney / Dialysis',
                'Heart Disease / Surgery',
                'Tuberculosis (TB)',
                'Leprosy',
                'Mental Health Condition',
              ].map((condition) {
                final isSelected = _profile.healthConditions.contains(condition);
                return CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  title: Text(condition),
                  value: isSelected,
                  onChanged: (val) {
                    setState(() {
                      if (val == true) {
                        if (!_profile.healthConditions.contains(condition)) {
                          _profile.healthConditions.add(condition);
                        }
                      } else {
                        _profile.healthConditions.remove(condition);
                      }
                    });
                    _onFieldChanged();
                  },
                );
              }),
            ],
          ),
        ),
      ),
      const SizedBox(height: 8),
    ];
  }

  // --- SECTION 7: Additional details ---
  List<Widget> _buildAdditionalDetailsFields() {
    return [
      CheckboxListTile(
        title: const Text('Destitute / no family support'),
        subtitle: const Text('Belongs to Below Poverty Line or destitute household with no family support'),
        value: _profile.destitute,
        onChanged: (val) {
          _profile.destitute = val ?? false;
          _onFieldChanged();
        },
      ),
      CheckboxListTile(
        title: const Text('Below Poverty Line family'),
        subtitle: const Text('Registered BPL card or recognized destitute status'),
        value: _profile.bplFamily,
        onChanged: (val) {
          _profile.bplFamily = val ?? false;
          _onFieldChanged();
        },
      ),
      CheckboxListTile(
        title: const Text('Agricultural labourer'),
        subtitle: const Text('Works as landless agricultural worker'),
        value: _profile.agriLabourer,
        onChanged: (val) {
          _profile.agriLabourer = val ?? false;
          _onFieldChanged();
        },
      ),
      CheckboxListTile(
        title: const Text('Registered with a welfare board'),
        subtitle: const Text('Registered with Unorganised Workers Welfare Board'),
        value: _profile.welfareBoard,
        onChanged: (val) {
          _profile.welfareBoard = val ?? false;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 12),
      const Text(
        'Derived from earlier sections (Single Source of Truth):',
        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.grey),
      ),
      const SizedBox(height: 6),
      CheckboxListTile(
        title: const Text('Woman Head of Family'),
        subtitle: const Text('Derived from Family section'),
        value: _profile.famhead,
        onChanged: (val) {
          _profile.famhead = val ?? false;
          _onFieldChanged();
        },
      ),
      CheckboxListTile(
        title: const Text('Government School Student'),
        subtitle: const Text('Derived from Education section'),
        value: _profile.govschool,
        onChanged: (val) {
          _profile.govschool = val ?? false;
          _onFieldChanged();
        },
      ),
      CheckboxListTile(
        title: const Text('Enrolled in Higher Education'),
        subtitle: const Text('Derived from Education section'),
        value: _profile.highered,
        onChanged: (val) {
          _profile.highered = val ?? false;
          _onFieldChanged();
        },
      ),
      CheckboxListTile(
        title: const Text('Owns Personal Four-Wheeler'),
        subtitle: const Text('Derived from Assets section'),
        value: _profile.hasCar,
        onChanged: (val) {
          _profile.hasCar = val ?? false;
          _onFieldChanged();
        },
      ),
      CheckboxListTile(
        title: const Text('Excess Family Land'),
        subtitle: const Text('Derived from Assets section'),
        value: _profile.excessLand,
        onChanged: (val) {
          _profile.excessLand = val ?? false;
          _onFieldChanged();
        },
      ),
      const SizedBox(height: 8),
    ];
  }
}
