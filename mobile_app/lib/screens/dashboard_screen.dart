import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/discovery.dart';
import '../models/scheme.dart';
import '../models/user_profile.dart';
import '../providers/language_provider.dart';
import '../providers/scheme_fetch_provider.dart';
import '../services/api_service.dart';
import '../services/rule_engine.dart';
import '../widgets/recently_changed_banner.dart';
import '../widgets/verification_badge.dart';
import '../utils/scheme_localizer.dart';
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
  SchemeSource _schemeSource = SchemeSource.none;
  DateTime? _lastUpdated;
  bool _serverUnreachable = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final profile = await UserProfile.loadFromPrefs();
    
    // 1. Immediately display local or starter data
    final localResult = await ApiService.getLocalOrStarterSchemes();
    if (mounted && localResult.schemes.isNotEmpty) {
      setState(() {
        _profile = profile;
        _schemes = localResult.schemes;
        _schemeSource = localResult.source;
        _lastUpdated = localResult.lastUpdated;
        _isLoading = false;
        _errorMessage = null;
      });
      _checkMinimumProfile(profile);
    }

    // 2. Sync with server in background (or foreground if no local data)
    await _syncWithServer(isRefresh: _schemes.isNotEmpty);
  }

  Future<void> _syncWithServer({required bool isRefresh}) async {
    if (_schemes.isEmpty) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    }

    try {
      final serverResult = await ApiService.fetchSchemesFromServer(isRefresh: isRefresh);
      final discoveryResult = await ApiService.fetchDiscoveries();

      if (!mounted) return;

      if (serverResult.isError) {
        if (_schemes.isEmpty) {
          setState(() {
            _isLoading = false;
            _serverUnreachable = true;
            _errorMessage = serverResult.errorMessage ?? 'Unable to connect to server';
          });
        } else {
          setState(() {
            _serverUnreachable = true;
            _discoveries = discoveryResult['discoveries'] ?? _discoveries;
            _unseenCount = discoveryResult['unseenCount'] ?? _unseenCount;
          });
        }
      } else {
        setState(() {
          _schemes = serverResult.schemes;
          _schemeSource = SchemeSource.server;
          _lastUpdated = serverResult.lastUpdated;
          _serverUnreachable = false;
          _isLoading = false;
          _errorMessage = null;
          _discoveries = discoveryResult['discoveries'] ?? [];
          _unseenCount = discoveryResult['unseenCount'] ?? 0;
        });
        if (_profile != null) _checkMinimumProfile(_profile!);
      }
    } catch (e) {
      if (!mounted) return;
      if (_schemes.isEmpty) {
        setState(() {
          _isLoading = false;
          _serverUnreachable = true;
          _errorMessage = e.toString();
        });
      } else {
        setState(() {
          _serverUnreachable = true;
        });
      }
    }
  }

  String _formatTime(DateTime? dt, {bool isTa = false}) {
    if (dt == null) return '';
    final monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final monthsTa = ['ஜன', 'பிப்', 'மார்ச்', 'ஏப்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆக', 'செப்', 'அக்', 'நவ', 'டிச'];
    final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final minute = dt.minute.toString().padLeft(2, '0');
    final ampm = dt.hour >= 12 ? (isTa ? 'மாலை' : 'PM') : (isTa ? 'காலை' : 'AM');
    final monthName = isTa ? monthsTa[dt.month - 1] : monthsEn[dt.month - 1];
    return '${dt.day} $monthName, $hour:$minute $ampm';
  }

  String _formatBenefitHeadline(String benefit) {
    if (benefit.isEmpty) return '';
    final matchWithFreq = RegExp(
      r'(₹\s*[\d,]+(?:\s*(?:lakh|crore))?)\s*(?:/|\s*per\s*|\s*a\s*)(month|year|annum|day|week)',
      caseSensitive: false,
    ).firstMatch(benefit);
    if (matchWithFreq != null) {
      final amount = matchWithFreq.group(1)!.trim().replaceAll(' ', '');
      var freq = matchWithFreq.group(2)!.toLowerCase();
      if (freq == 'annum') freq = 'year';
      return '$amount per $freq';
    }

    final matchAmount = RegExp(
      r'(₹\s*[\d,]+(?:\s*(?:lakh|crore))?)',
      caseSensitive: false,
    ).firstMatch(benefit);
    if (matchAmount != null) {
      return matchAmount.group(1)!.trim().replaceAll(' ', '');
    }

    final firstSentence = benefit.split(RegExp(r'[.\n]')).first.trim();
    return firstSentence.isNotEmpty ? firstSentence : benefit;
  }

  String? _getStatusText({bool isTa = false}) {
    if (_schemeSource == SchemeSource.starterAsset) {
      return isTa ? 'தொடக்கத் தரவு, இன்னும் சரிபார்க்கப்படவில்லை' : 'Starter data, not yet confirmed';
    }
    if (_serverUnreachable && _lastUpdated != null) {
      return isTa
          ? 'ஆஃப்லைன் நகல்: ${_formatTime(_lastUpdated, isTa: isTa)}'
          : 'Offline copy from ${_formatTime(_lastUpdated)}';
    }
    if (_lastUpdated != null) {
      return isTa
          ? 'திட்டங்கள்: ${_schemes.length}, புதுப்பிக்கப்பட்டது ${_formatTime(_lastUpdated, isTa: isTa)}'
          : 'Schemes: ${_schemes.length}, updated ${_formatTime(_lastUpdated)}';
    }
    return null;
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
    final isTa = Provider.of<LanguageProvider>(context, listen: false).isTamil;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            Icon(Icons.person, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 8),
            Text(isTa ? 'விரைவு அமைப்பு' : 'Quick Setup'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(isTa
                ? 'பொருத்தமான திட்டங்களைக் காண உங்கள் வயது மற்றும் பாலினத்தைக் குறிப்பிடவும்.'
                : 'Please provide your Age and Gender to show matching schemes.'),
            const SizedBox(height: 12),
            TextField(
              controller: ageController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: isTa ? 'வயது (ஆண்டுகள்)' : 'Age (Years)',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: selectedGender,
              decoration: InputDecoration(
                labelText: isTa ? 'பாலினம்' : 'Gender',
                border: const OutlineInputBorder(),
              ),
              items: [
                DropdownMenuItem(value: 'F', child: Text(isTa ? 'பெண்' : 'Female')),
                DropdownMenuItem(value: 'M', child: Text(isTa ? 'ஆண்' : 'Male')),
                DropdownMenuItem(value: 'O', child: Text(isTa ? 'மற்றவை' : 'Other')),
              ],
              onChanged: (val) {
                if (val != null) selectedGender = val;
              },
            ),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () async {
              String rawAge = ageController.text.trim();
              const taDigits = {'௦':'0','௧':'1','உ':'2','௩':'3','௪':'4','௫':'5','௬':'6','௭':'7','௮':'8','௯':'9'};
              taDigits.forEach((k, v) => rawAge = rawAge.replaceAll(k, v));
              final ageVal = int.tryParse(rawAge);
              if (_profile != null) {
                _profile!.age = ageVal;
                _profile!.gender = selectedGender;
                await _profile!.saveToPrefs();
              }
              if (!ctx.mounted) return;
              Navigator.pop(ctx);
              if (!mounted) return;
              _loadData();
            },
            child: Text(isTa ? 'சேமித்து தொடர்க' : 'Save & Continue'),
          ),
        ],
      ),
    );
  }

  void _navigateToProfileSection(int sectionIndex) {
    if (widget.onEditProfileWithSection != null) {
      widget.onEditProfileWithSection!(sectionIndex);
    } else {
      widget.onEditProfile();
    }
  }

  void _updateProfileAnswer(void Function(UserProfile p) updater) async {
    final profile = _profile ?? UserProfile();
    updater(profile);
    await profile.saveToPrefs();
    setState(() {
      _profile = profile;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return _buildLoadingSkeleton(context);
    }

    if (_errorMessage != null && _schemes.isEmpty) {
      return _buildErrorState(context);
    }

    final profile = _profile ?? UserProfile();

    // Categorize schemes and discoveries
    final List<Map<String, dynamic>> eligibleList = [];
    final List<Map<String, dynamic>> possiblyEligibleList = [];
    final List<Map<String, dynamic>> announcedList = [];

    for (var scheme in _schemes) {
      final isAnnounced = scheme.status.toLowerCase() == 'announced' ||
          scheme.displayState.toLowerCase() == 'announced';
      if (isAnnounced) {
        announcedList.add({'scheme': scheme, 'eval': RuleEngine.evaluate(scheme, profile)});
        continue;
      }

      final eval = RuleEngine.evaluate(scheme, profile);
      if (eval.status == EligibilityStatus.eligible) {
        eligibleList.add({'scheme': scheme, 'eval': eval});
      } else if (eval.status == EligibilityStatus.possiblyEligibleVerify) {
        possiblyEligibleList.add({'scheme': scheme, 'eval': eval});
      }
      // Hide not-eligible schemes: do not add to any list
    }

    // Check if key answers are missing for Quick questions card
    final bool missingIncome = profile.familyIncome == null && profile.incomeRangeBand == null;
    final bool missingRationHead = profile.rationCardHead == null || profile.rationCardHead!.isEmpty;
    final bool missingWork = profile.workStatus == null;
    final bool missingMarital = profile.marital == null;
    final bool showQuickQuestions = missingIncome || missingRationHead || missingWork || missingMarital;

    final int eligibleCount = eligibleList.length;
    final int toVerifyCount = possiblyEligibleList.length;

    return RefreshIndicator(
      onRefresh: _loadData,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Live background fetch banner
            Consumer<SchemeFetchProvider>(
              builder: (context, fetchProvider, _) {
                if (fetchProvider.isFetching) {
                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                    ),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Theme.of(context).colorScheme.primary),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            fetchProvider.statusMessage ?? 'Fetching schemes in background...',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Theme.of(context).colorScheme.onPrimaryContainer,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }
                if (fetchProvider.statusMessage != null && fetchProvider.lastFetchCompletedTime != null) {
                  final ageSec = DateTime.now().difference(fetchProvider.lastFetchCompletedTime!).inSeconds;
                  if (ageSec < 30) {
                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.green.shade300),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle, size: 16, color: Colors.green),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              fetchProvider.statusMessage!,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: Colors.green.shade900,
                              ),
                            ),
                          ),
                          IconButton(
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                            icon: const Icon(Icons.close, size: 16, color: Colors.green),
                            onPressed: fetchProvider.clearStatus,
                          ),
                        ],
                      ),
                    );
                  }
                }
                return const SizedBox.shrink();
              },
            ),

            // Status text badge if present
            Consumer<LanguageProvider>(
              builder: (context, langProv, _) {
                final isTa = langProv.isTamil;
                final statusText = _getStatusText(isTa: isTa);
                if (statusText == null) return const SizedBox.shrink();
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: _serverUnreachable 
                        ? Colors.orange.shade50 
                        : (_schemeSource == SchemeSource.starterAsset 
                            ? Colors.blue.shade50 
                            : Colors.grey.shade100),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: _serverUnreachable 
                          ? Colors.orange.shade200 
                          : (_schemeSource == SchemeSource.starterAsset 
                              ? Colors.blue.shade200 
                              : Colors.grey.shade300),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _serverUnreachable 
                            ? Icons.cloud_off 
                            : (_schemeSource == SchemeSource.starterAsset 
                                ? Icons.info_outline 
                                : Icons.check_circle_outline),
                        size: 14,
                        color: _serverUnreachable 
                            ? Colors.orange.shade800 
                            : (_schemeSource == SchemeSource.starterAsset 
                                ? Colors.blue.shade800 
                                : Colors.black54),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        statusText,
                        style: TextStyle(
                          fontSize: 12,
                          color: _serverUnreachable 
                              ? Colors.orange.shade900 
                              : (_schemeSource == SchemeSource.starterAsset 
                                  ? Colors.blue.shade900 
                                  : Colors.black87),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),

            // Language Selector Row (English / தமிழ்)
            Consumer<LanguageProvider>(
              builder: (context, langProvider, _) {
                final isTa = langProvider.isTamil;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          eligibleCount == 0 && toVerifyCount == 0
                              ? (isTa ? 'திட்டங்களைக் காண சில விவரங்களை உள்ளிடவும்' : 'Answer a few questions to see schemes')
                              : (isTa
                                  ? '$eligibleCount தகுதியுடையவை, $toVerifyCount சரிபார்க்க'
                                  : '$eligibleCount eligible, $toVerifyCount to verify'),
                          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: Colors.black87,
                                fontSize: isTa ? 20 : 22,
                              ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.3)),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.05),
                              blurRadius: 4,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            InkWell(
                              borderRadius: BorderRadius.circular(16),
                              onTap: () => langProvider.setLanguage('en'),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: !isTa ? Theme.of(context).colorScheme.primary : Colors.transparent,
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Text(
                                  'English',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: !isTa ? Colors.white : Colors.black87,
                                  ),
                                ),
                              ),
                            ),
                            InkWell(
                              borderRadius: BorderRadius.circular(16),
                              onTap: () => langProvider.setLanguage('ta'),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: isTa ? Theme.of(context).colorScheme.primary : Colors.transparent,
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Text(
                                  'தமிழ்',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: isTa ? Colors.white : Colors.black87,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),

            // "Quick questions" card at the top when key answers are missing
            Consumer<LanguageProvider>(
              builder: (context, langProv, _) {
                final isTa = langProv.isTamil;
                if (!showQuickQuestions && !(eligibleCount == 0 && toVerifyCount == 0)) {
                  return const SizedBox.shrink();
                }

                return Card(
                  elevation: 0,
                  color: Theme.of(context).colorScheme.primaryContainer,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
                  ),
                  margin: const EdgeInsets.only(bottom: 20),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.flash_on, color: Theme.of(context).colorScheme.primary),
                            const SizedBox(width: 8),
                            Text(
                              isTa ? 'விரைவு வினாக்கள்' : 'Quick questions',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: Theme.of(context).colorScheme.onPrimaryContainer,
                                  ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          isTa
                              ? 'இவற்றுக்குப் பதிலளிப்பதன் மூலம் பொருத்தமான திட்டங்களை உடனே அறியலாம்:'
                              : 'Answering settles the most schemes right away:',
                          style: const TextStyle(fontSize: 13, color: Colors.black87),
                        ),
                        const SizedBox(height: 12),

                        // Question 1: Annual family income range
                        if (missingIncome) ...[
                          Text(
                            isTa ? 'குடும்பத்தின் ஆண்டு வருமானம்:' : 'Annual family income:',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              {'val': 'under ₹1 lakh', 'en': 'under ₹1 lakh', 'ta': '₹1 லட்சத்திற்கும் கீழ்'},
                              {'val': '₹1 to 2.5 lakh', 'en': '₹1 to 2.5 lakh', 'ta': '₹1 - 2.5 லட்சம்'},
                              {'val': '₹2.5 to 5 lakh', 'en': '₹2.5 to 5 lakh', 'ta': '₹2.5 - 5 லட்சம்'},
                              {'val': 'above ₹5 lakh', 'en': 'above ₹5 lakh', 'ta': '₹5 லட்சத்திற்கு மேல்'},
                            ].map((band) {
                              final bandVal = band['val']!;
                              final isSelected = profile.incomeRangeBand == bandVal;
                              return ChoiceChip(
                                label: Text(isTa ? band['ta']! : band['en']!),
                                selected: isSelected,
                                onSelected: (selected) {
                                  if (selected) {
                                    _updateProfileAnswer((p) {
                                      p.incomeRangeBand = bandVal;
                                      p.familyIncome = null;
                                    });
                                  }
                                },
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 14),
                        ],

                        // Question 2: Ration card head
                        if (missingRationHead) ...[
                          Text(
                            isTa
                                ? 'குடும்ப அட்டை (ரேஷன் கார்டு)-ல் தலைவர் பெயர் யார்?'
                                : 'Who is named as head of your family on the ration card?',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              {'label': isTa ? 'நான்' : 'Me', 'value': 'self'},
                              {'label': isTa ? 'என் கணவர்' : 'My husband (I am his wife)', 'value': 'spouse'},
                              {'label': isTa ? 'மற்றொரு குடும்ப உறுப்பினர்' : 'Another family member', 'value': 'other'},
                              {'label': isTa ? 'ரேஷன் கார்டு இல்லை' : 'I do not have a ration card', 'value': 'none'},
                              {'label': isTa ? 'நிச்சயமில்லை' : 'Not sure', 'value': 'unknown'},
                            ].map((opt) {
                              final val = opt['value']!;
                              final isSelected = profile.rationCardHead == val;
                              return ChoiceChip(
                                label: Text(opt['label']!),
                                selected: isSelected,
                                onSelected: (selected) {
                                  if (selected) {
                                    _updateProfileAnswer((p) {
                                      p.rationCardHead = val;
                                      p.famhead = (val == 'self');
                                    });
                                  }
                                },
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 14),
                        ],

                        // Question 3: Farmer / Work Status
                        if (profile.workStatus == null) ...[
                          Text(
                            isTa ? 'நீங்கள் விவசாயத்தில் ஈடுபடுகிறீர்களா?' : 'Are you involved in farming or agriculture?',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              {'label': isTa ? 'விவசாயி' : 'Farmer (Cultivator)', 'value': 'Farmer'},
                              {'label': isTa ? 'விவசாய கூலித்தொழிலாளி' : 'Agricultural Labourer', 'value': 'Agricultural labourer'},
                              {'label': isTa ? 'பிற பணி / பணிபுரிகிறேன்' : 'No / Other Work', 'value': 'Employed'},
                              {'label': isTa ? 'இல்லத்தரசி' : 'Homemaker', 'value': 'Homemaker'},
                            ].map((opt) {
                              final val = opt['value']!;
                              final isSelected = profile.workStatus == val;
                              return ChoiceChip(
                                label: Text(opt['label']!),
                                selected: isSelected,
                                onSelected: (selected) {
                                  if (selected) {
                                    _updateProfileAnswer((p) {
                                      p.workStatus = val;
                                    });
                                  }
                                },
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 14),
                        ],

                        // Question 4: Marital status
                        if (profile.marital == null) ...[
                          Text(
                            isTa ? 'உங்கள் திருமண நிலை என்ன?' : 'What is your marital status?',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              {'val': 'married', 'en': 'Married', 'ta': 'திருமணமானவர்'},
                              {'val': 'unmarried', 'en': 'Single', 'ta': 'மணமாகாதவர்'},
                              {'val': 'widowed', 'en': 'Widowed', 'ta': 'விதவை'},
                              {'val': 'deserted', 'en': 'Divorced / Deserted', 'ta': 'கைவிடப்பட்டவர் / விவாகரத்து'},
                            ].map((m) {
                              final isSelected = profile.marital == m['val'];
                              return ChoiceChip(
                                label: Text(isTa ? m['ta']! : m['en']!),
                                selected: isSelected,
                                onSelected: (selected) {
                                  if (selected) {
                                    _updateProfileAnswer((p) {
                                      p.marital = m['val']!;
                                    });
                                  }
                                },
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 6),
                        ],
                      ],
                    ),
                  ),
                );
              },
            ),

            // Active Profile Mini Chips (Collapsible / Compact)
            Consumer<LanguageProvider>(
              builder: (context, langProv, _) {
                final isTa = langProv.isTamil;
                String genderText(String? g) {
                  if (g == 'F') return isTa ? 'பெண்' : 'Female';
                  if (g == 'M') return isTa ? 'ஆண்' : 'Male';
                  return isTa ? 'மற்றவை' : 'Other';
                }
                String maritalText(String? m) {
                  if (m == null) return '';
                  if (m == 'married' || m == 'Married') return isTa ? 'திருமணமானவர்' : 'Married';
                  if (m == 'unmarried' || m == 'Single') return isTa ? 'மணமாகாதவர்' : 'Single';
                  if (m == 'widowed' || m == 'Widowed') return isTa ? 'விதவை' : 'Widowed';
                  if (m == 'deserted' || m == 'Divorced / Deserted') return isTa ? 'கைவிடப்பட்டவர்' : 'Deserted';
                  return m;
                }
                String incomeText() {
                  if (profile.familyIncome != null) return '₹${profile.familyIncome}';
                  final b = profile.incomeRangeBand;
                  if (b == null) return '';
                  if (isTa) {
                    if (b.contains('1 lakh') || b.contains('1 லட்சம்')) return '₹1 லட்சத்திற்கும் கீழ்';
                    if (b.contains('2.5')) return '₹1 - 2.5 லட்சம்';
                    if (b.contains('5 lakh')) return '₹2.5 - 5 லட்சம்';
                    if (b.contains('above') || b.contains('மேல்')) return '₹5 லட்சத்திற்கு மேல்';
                  }
                  return b;
                }

                return Card(
                  elevation: 0,
                  color: Colors.grey.shade100,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  margin: const EdgeInsets.only(bottom: 20),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Wrap(
                            spacing: 8,
                            runSpacing: 4,
                            children: [
                              if (profile.age != null)
                                Chip(
                                  visualDensity: VisualDensity.compact,
                                  avatar: const Icon(Icons.cake, size: 14),
                                  label: Text(
                                    isTa ? '${profile.age} வயது' : '${profile.age} yrs',
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ),
                              if (profile.gender != null)
                                Chip(
                                  visualDensity: VisualDensity.compact,
                                  avatar: const Icon(Icons.person, size: 14),
                                  label: Text(
                                    genderText(profile.gender),
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ),
                              if (profile.familyIncome != null || profile.incomeRangeBand != null)
                                Chip(
                                  visualDensity: VisualDensity.compact,
                                  avatar: const Icon(Icons.currency_rupee, size: 14),
                                  label: Text(
                                    incomeText(),
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ),
                              if (profile.marital != null)
                                Chip(
                                  visualDensity: VisualDensity.compact,
                                  avatar: const Icon(Icons.favorite, size: 14),
                                  label: Text(
                                    maritalText(profile.marital),
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        TextButton.icon(
                          onPressed: widget.onEditProfile,
                          icon: const Icon(Icons.edit, size: 14),
                          label: Text(isTa ? 'திருத்து' : 'Edit', style: const TextStyle(fontSize: 12)),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),

            // SECTION 1: "Eligible" (all rules pass)
            Consumer<LanguageProvider>(
              builder: (context, lang, _) {
                final isTa = lang.isTamil;
                return Row(
                  children: [
                    const Icon(Icons.check_circle, color: Colors.green),
                    const SizedBox(width: 8),
                    Text(
                      isTa ? 'தகுதியுடைய திட்டங்கள்' : 'Eligible',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.green.shade100,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '${eligibleList.length}',
                        style: TextStyle(
                          color: Colors.green.shade900,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: 10),

            if (eligibleList.isEmpty)
              Consumer<LanguageProvider>(
                builder: (context, lang, _) => Card(
                  elevation: 0,
                  color: Colors.grey[100],
                  margin: const EdgeInsets.only(bottom: 24),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Center(
                      child: Text(
                        lang.isTamil
                            ? 'தற்போது தகுதியான திட்டங்கள் எதுவும் உறுதிப்படுத்தப்படவில்லை.\nதகுதி பெற கூடுதல் கேள்விகளுக்குப் பதிலளிக்கவும்.'
                            : 'No schemes currently confirmed eligible.\nAnswer more questions to qualify.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.black54),
                      ),
                    ),
                  ),
                ),
              )
            else ...[
              ...eligibleList.map((item) {
                final Scheme scheme = item['scheme'];
                final RuleEvaluationResult eval = item['eval'];
                return _buildSchemeCard(context, scheme, eval, Colors.green);
              }),
              const SizedBox(height: 16),
            ],


          ],
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

    final bool isPending = scheme.reviewStatus.toLowerCase() == 'pending' || 
                           scheme.verificationStatus.toLowerCase() == 'pending';
    final bool isEligible = eval.status == EligibilityStatus.eligible;
    final Color effectiveStatusColor = isPending ? Colors.amber.shade800 : statusColor;
    final String tagText = isPending
        ? (isEligible ? 'Possibly eligible - verify' : 'Not reviewed yet')
        : (isEligible ? 'Eligible' : 'Possibly eligible — verify');

    final isTa = Provider.of<LanguageProvider>(context, listen: false).isTamil;
    final String primaryTitle = isTa && scheme.nameTamil.isNotEmpty ? scheme.nameTamil : scheme.name;
    final String secondaryTitle = isTa && scheme.nameTamil.isNotEmpty ? scheme.name : (scheme.nameTamil.isNotEmpty ? scheme.nameTamil : '');
    final String displayTagText = isTa
        ? (isEligible ? 'தகுதியுடையது' : 'சரிபார்க்க வேண்டும்')
        : tagText;

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
                        getCategoryName(scheme.category, isTamil: isTa),
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
                primaryTitle,
                maxLines: 3,
                softWrap: true,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, height: 1.25),
              ),
              if (secondaryTitle.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  secondaryTitle,
                  maxLines: 2,
                  softWrap: true,
                  style: TextStyle(fontSize: 14, color: Colors.grey[750], fontWeight: FontWeight.w500),
                ),
              ],
              const SizedBox(height: 10),

              // Benefit headline built from stored amount and frequency
              Builder(builder: (context) {
                final benefitHeadline = _formatBenefitHeadline(scheme.benefit);
                if (benefitHeadline.isEmpty) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8.0),
                  child: Text(
                    isTa ? translateBenefit(benefitHeadline, isTamil: true) : benefitHeadline,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                );
              }),

              // Verdict Chip
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: effectiveStatusColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      effectiveStatusColor == Colors.green ? Icons.check_circle : Icons.help_outline,
                      size: 14,
                      color: effectiveStatusColor,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      displayTagText,
                      style: TextStyle(color: effectiveStatusColor, fontWeight: FontWeight.bold, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),

              // Complete benefit description
              if (scheme.benefit.isNotEmpty &&
                  scheme.benefit.trim().toLowerCase() != _formatBenefitHeadline(scheme.benefit).trim().toLowerCase()) ...[
                Text(
                  translateBenefit(scheme.benefit, isTamil: isTa),
                  maxLines: 4,
                  softWrap: true,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: Colors.grey[850], fontSize: 13.5, height: 1.35),
                ),
              ],

              // Why you qualify preview on the card
              if (eval.matchedCriteria.isNotEmpty) ...[
                const SizedBox(height: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: eval.matchedCriteria.take(2).map((item) => Padding(
                    padding: const EdgeInsets.only(bottom: 2.0),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('✓ ', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold, fontSize: 13)),
                        Expanded(
                          child: Text(
                            translateCriteria(item, isTamil: isTa),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12, color: Colors.grey[750], fontWeight: FontWeight.w500),
                          ),
                        ),
                      ],
                    ),
                  )).toList(),
                ),
              ] else if (scheme.unmappedCriteria.isNotEmpty) ...[
                const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('• ', style: TextStyle(color: Colors.blueGrey, fontWeight: FontWeight.bold, fontSize: 13)),
                    Expanded(
                      child: Text(
                        translateCriteria(scheme.unmappedCriteria.first, isTamil: isTa),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: Colors.grey[750], fontWeight: FontWeight.w500),
                      ),
                    ),
                  ],
                ),
              ],

              if (eval.status == EligibilityStatus.possiblyEligibleVerify) ...[
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.amber.shade400),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.edit_note, size: 18, color: Colors.amber.shade900),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          isTa
                              ? 'தகுதி பெற சுயவிவரத்தில் பதிலளிக்கவும்: ${eval.missingFields.isNotEmpty ? eval.missingFields.join(', ') : 'கூடுதல் விவரங்கள்'}'
                              : 'To confirm, answer in profile: ${eval.missingFields.isNotEmpty ? eval.missingFields.join(', ') : 'Category & Eligibility details'}',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.amber.shade900),
                        ),
                      ),
                      TextButton.icon(
                        style: TextButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          foregroundColor: Colors.amber.shade900,
                          backgroundColor: Colors.white,
                        ),
                        onPressed: () {
                          int secIdx = 0;
                          String field = eval.missingFields.isNotEmpty 
                              ? eval.missingFields.first.toLowerCase() 
                              : scheme.category.toLowerCase();
                          if (field.contains('marital') || field.contains('widow') || field.contains('ration') || field.contains('head')) {
                            secIdx = 1;
                          } else if (field.contains('school') || field.contains('education') || field.contains('student') || field.contains('course') || field.contains('skilling')) {
                            secIdx = 2;
                          } else if (field.contains('income') || field.contains('farmer') || field.contains('work') || field.contains('occupation') || field.contains('artisan') || field.contains('weaver') || field.contains('loan')) {
                            secIdx = 3;
                          } else if (field.contains('land') || field.contains('asset') || field.contains('house') || field.contains('vehicle') || field.contains('electricity')) {
                            secIdx = 4;
                          } else if (field.contains('eye') || field.contains('spectacle') || field.contains('disability') || field.contains('health')) {
                            secIdx = 5;
                          }
                          _navigateToProfileSection(secIdx);
                        },
                        icon: const Icon(Icons.arrow_forward, size: 13),
                        label: Text(isTa ? 'சுயவிவரம்' : 'Fill Profile', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ),
              ],

              if (scheme.changedRecently) ...[
                const SizedBox(height: 6),
                RecentlyChangedBanner(scheme: scheme),
              ],

              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    isTa ? 'விவரங்கள் & ஆவணங்களைக் காண தொடவும்' : 'Touch for details & documents',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(
                    Icons.arrow_forward_ios,
                    size: 12,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLoadingSkeleton(BuildContext context) {
    return SingleChildScrollView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Profile Skeleton Card
          Card(
            elevation: 2,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 16,
                    width: 140,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Container(
                        height: 28,
                        width: 70,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        height: 28,
                        width: 90,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        height: 28,
                        width: 80,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          // Skeleton Header
          Container(
            height: 20,
            width: 220,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 12),
          // Skeleton Scheme Cards (3 cards)
          for (int i = 0; i < 3; i++) ...[
            Card(
              elevation: 2,
              margin: const EdgeInsets.only(bottom: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          height: 14,
                          width: 80,
                          decoration: BoxDecoration(
                            color: Colors.grey.shade300,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                        Container(
                          height: 14,
                          width: 100,
                          decoration: BoxDecoration(
                            color: Colors.grey.shade200,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Container(
                      height: 18,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      height: 14,
                      width: 220,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade200,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildErrorState(BuildContext context) {
    final isTa = Provider.of<LanguageProvider>(context, listen: false).isTamil;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              isTa ? 'திட்டங்களை ஏற்ற முடியவில்லை' : 'Unable to load schemes',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              _errorMessage ?? (isTa ? 'இணைய கோரிக்கை தோல்வியடைந்தது' : 'Network request failed'),
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: _loadData,
              icon: const Icon(Icons.refresh),
              label: Text(isTa ? 'மீண்டும் முயற்சி செய்க' : 'Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
