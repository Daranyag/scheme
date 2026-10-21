import 'dart:async';
import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import '../models/scheme.dart';
import '../models/user_profile.dart';
import '../providers/language_provider.dart';
import '../services/api_service.dart';

class FinderScreen extends StatefulWidget {
  final VoidCallback? onNavigateToDashboard;

  const FinderScreen({super.key, this.onNavigateToDashboard});

  @override
  State<FinderScreen> createState() => _FinderScreenState();
}

class _FinderScreenState extends State<FinderScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _urlController = TextEditingController();
  final TextEditingController _textController = TextEditingController();

  dynamic _selectedFile;
  bool _isAnalyzing = false;
  String? _analyzeStage;
  Map<String, dynamic>? _analysisResult;
  final Set<String> _addedSchemeNames = {};
  String? _errorMessage;
  String? _errorCode;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _urlController.dispose();
    _textController.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    try {
      final result = await FilePickerPlatform.instance.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
      );

      if (result.isNotEmpty) {
        setState(() {
          _selectedFile = result.first;
          _errorMessage = null;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Error selecting file: $e';
      });
    }
  }

  Future<void> _analyzeScheme() async {
    final profile = await UserProfile.loadFromPrefs();
    
    setState(() {
      _isAnalyzing = true;
      _analyzeStage = _textController.text.isNotEmpty ? 'Looking in the scheme database...' : 'Reading the page...';
      _analysisResult = null;
      _errorMessage = null;
      _errorCode = null;
    });

    try {
      final uri = Uri.parse('${ApiService.baseUrl}/api/finder');
      final request = http.MultipartRequest('POST', uri);

      // Add profile JSON string
      request.fields['profile'] = jsonEncode(profile.toJson());

      // Add URL or text if provided
      if (_urlController.text.trim().isNotEmpty) {
        request.fields['link'] = _urlController.text.trim();
      }
      if (_textController.text.trim().isNotEmpty) {
        request.fields['text'] = _textController.text.trim();
      }

      // Add selected file if any
      if (_selectedFile != null) {
        final dynamic file = _selectedFile;
        final String name = file.name?.toString() ?? 'document';
        final List<int>? bytes = file.bytes != null ? List<int>.from(file.bytes) : null;
        final String? filePath = file.path?.toString();

        if (kIsWeb && bytes != null) {
          request.files.add(
            http.MultipartFile.fromBytes(
              'files',
              bytes,
              filename: name,
            ),
          );
        } else if (filePath != null) {
          request.files.add(
            await http.MultipartFile.fromPath(
              'files',
              filePath,
              filename: name,
            ),
          );
        }
      }

      final streamedResponse = await request.send().timeout(const Duration(seconds: 90));
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() {
          _analysisResult = data;
          _isAnalyzing = false;
          _analyzeStage = null;
        });
      } else {
        final err = jsonDecode(response.body);
        setState(() {
          _errorMessage = err['message'] ?? 'Server error processing scheme document.';
          _errorCode = err['code'];
          _isAnalyzing = false;
          _analyzeStage = null;
        });
      }
    } on TimeoutException {
      setState(() {
        _errorMessage = "The analysis took too long to complete. Please try again or paste scheme text directly.";
        _errorCode = 'timeout';
        _isAnalyzing = false;
        _analyzeStage = null;
      });
    } catch (e) {
      setState(() {
        _errorMessage = "Can't reach the server. Check that it is running and the address is correct.";
        _errorCode = 'unreachable';
        _isAnalyzing = false;
        _analyzeStage = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isTa = Provider.of<LanguageProvider>(context).isTamil;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            isTa ? 'AI திட்ட & ஆவணத் தேடல்' : 'AI Scheme & Document Finder',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            isTa
                ? 'அரசாணை ஆவணம், புகைப்படம் அல்லது புதிய திட்ட இணைப்பைப் பதிவேற்றி AI மூலம் தகுதியைச் சரிபார்க்கவும்.'
                : 'Upload a G.O. document, photo, or link of a new scheme to extract criteria and check eligibility using AI.',
            style: TextStyle(color: Colors.grey[700]),
          ),
          const SizedBox(height: 16),

          TabBar(
            controller: _tabController,
            labelColor: Theme.of(context).colorScheme.primary,
            indicatorColor: Theme.of(context).colorScheme.primary,
            tabs: [
              Tab(icon: const Icon(Icons.upload_file), text: isTa ? 'கோப்பைப் பதிவேற்றுக' : 'Upload File'),
              Tab(icon: const Icon(Icons.link), text: isTa ? 'இணைப்பு / உரை' : 'Link / Text'),
            ],
          ),

          SizedBox(
            height: 250,
            child: TabBarView(
              controller: _tabController,
              children: [
                // Tab 1: File Upload
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16.0),
                  child: Column(
                    children: [
                      OutlinedButton.icon(
                        onPressed: _pickFile,
                        icon: const Icon(Icons.attach_file),
                        label: Text(_selectedFile != null
                            ? (_selectedFile.name?.toString() ?? (isTa ? 'தேர்ந்தெடுக்கப்பட்ட கோப்பு' : 'Selected File'))
                            : (isTa ? 'PDF அல்லது படம் (JPG/PNG) தேர்ந்தெடுக்கவும்' : 'Select PDF or Image (JPG/PNG)')),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 50),
                        ),
                      ),
                      if (_selectedFile != null) ...[
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.check_circle, color: Colors.green, size: 18),
                            const SizedBox(width: 4),
                            Text(isTa ? 'தேர்ந்தெடுக்கப்பட்டது: ${_selectedFile.name ?? 'கோப்பு'}' : 'Selected: ${_selectedFile.name ?? 'File'}'),
                            IconButton(
                              icon: const Icon(Icons.close, size: 18),
                              onPressed: () => setState(() => _selectedFile = null),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),

                // Tab 2: Link or Text Input
                SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(vertical: 12.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextField(
                        controller: _urlController,
                        decoration: InputDecoration(
                          labelText: isTa ? 'திட்ட வலைப்பக்க முகவரி (URL)' : 'Scheme Web URL',
                          hintText: 'https://www.tn.gov.in/scheme/...',
                          border: const OutlineInputBorder(),
                          prefixIcon: const Icon(Icons.language),
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _textController,
                        decoration: InputDecoration(
                          labelText: isTa ? 'அல்லது திட்ட விளக்கம் / உரையை ஒட்டவும்' : 'Or Paste Scheme Text / Description',
                          border: const OutlineInputBorder(),
                          prefixIcon: const Icon(Icons.notes),
                        ),
                        maxLines: 2,
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        children: [
                          'pudhumai penn', 'muthiyor pension', 'CMCHIS', 'OAP', 'free bus'
                        ].map((chipText) => ActionChip(
                          label: Text(chipText, style: const TextStyle(fontSize: 12)),
                          onPressed: () {
                             _textController.text = chipText;
                             _analyzeScheme();
                          },
                        )).toList(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Analyze Button
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton.icon(
              onPressed: _isAnalyzing ? null : _analyzeScheme,
              style: ElevatedButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.primary,
                foregroundColor: Colors.white,
              ),
              icon: _isAnalyzing
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                    )
                  : const Icon(Icons.auto_awesome),
              label: Text(_isAnalyzing
                  ? (_analyzeStage ?? (isTa ? 'பகுப்பாய்வு செய்கிறது...' : 'Analyzing...'))
                  : (isTa ? 'தகுதியை சரிபார்க்க' : 'Analyze Eligibility')),
            ),
          ),

          if (_errorMessage != null) ...[
            const SizedBox(height: 16),
            Card(
              color: Colors.red[50],
              child: Padding(
                padding: const EdgeInsets.all(12.0),
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.error_outline, color: Colors.red),
                        const SizedBox(width: 8),
                        Expanded(child: Text(_errorMessage!, style: const TextStyle(color: Colors.red))),
                      ],
                    ),
                    if (_errorCode == 'ai_busy' || _errorCode == 'internal_error' || _errorCode == 'unreachable') ...[
                       const SizedBox(height: 8),
                       Align(
                          alignment: Alignment.centerRight,
                          child: TextButton.icon(
                             onPressed: _analyzeScheme,
                             icon: const Icon(Icons.refresh),
                             label: const Text('Retry'),
                          ),
                       ),
                    ],
                  ],
                ),
              ),
            ),
          ],

          // Analysis Output
          if (_analysisResult != null) ...[
            const SizedBox(height: 20),
            Text(
              isTa ? 'கண்டறியப்பட்ட திட்டம் & தகுதி முடிவு' : 'Extracted Scheme & Eligibility Verdict',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 10),
            if (_analysisResult!['schemes'] is List && (_analysisResult!['schemes'] as List).isNotEmpty)
              ...(_analysisResult!['schemes'] as List).map((item) {
                final verdict = item['verdict'] ?? 'need_info';
                final isEligible = verdict == 'eligible';
                final isNotEligible = verdict == 'not_eligible';

                final Color cardColor = isEligible
                    ? Colors.green
                    : (isNotEligible ? Colors.red : Colors.orange);

                return Card(
                  elevation: 3,
                  margin: const EdgeInsets.only(bottom: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Chip(
                              avatar: Icon(
                                isEligible
                                    ? Icons.check_circle
                                    : (isNotEligible ? Icons.cancel : Icons.help),
                                color: cardColor,
                                size: 18,
                              ),
                              label: Text(
                                isEligible
                                    ? (isTa ? 'முடிவு: தகுதியுடையது' : 'VERDICT: ELIGIBLE')
                                    : (isNotEligible
                                        ? (isTa ? 'முடிவு: தகுதியற்றது' : 'VERDICT: NOT ELIGIBLE')
                                        : (isTa ? 'முடிவு: சரிபார்க்க தேவை' : 'VERDICT: POSSIBLY ELIGIBLE - VERIFY')),
                                style: TextStyle(color: cardColor, fontWeight: FontWeight.bold),
                              ),
                              backgroundColor: cardColor.withValues(alpha: 0.1),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        if (item['source'] == 'database')
                          Row(
                             children: [
                                const Icon(Icons.verified, color: Colors.blue, size: 16),
                                const SizedBox(width: 4),
                                Text(
                                  isTa ? 'திட்டத் தரவுத்தளத்தில் கண்டறியப்பட்டது' : 'Found in the scheme database',
                                  style: const TextStyle(fontSize: 12, color: Colors.blue, fontStyle: FontStyle.italic),
                                ),
                             ]
                          )
                        else
                          Text(
                            isTa ? 'நீங்கள் வழங்கிய தகவலிலிருந்து பகுப்பாய்வு செய்யப்பட்டது' : 'Analysed from the information you gave',
                            style: const TextStyle(fontSize: 12, color: Colors.grey, fontStyle: FontStyle.italic),
                          ),
                        const SizedBox(height: 8),
                        Text(
                          item['name'] ?? (isTa ? 'கண்டறியப்பட்ட திட்டம்' : 'Extracted Scheme'),
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        if (item['nameTamil'] != null && item['nameTamil'].toString().isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 2.0),
                            child: Text(
                              item['nameTamil'].toString(),
                              style: TextStyle(fontSize: 15, color: Colors.grey[750], fontWeight: FontWeight.w500),
                            ),
                          ),
                        if (item['benefit'] != null) ...[
                          const SizedBox(height: 6),
                          Text(
                            isTa ? 'பயன்: ${item['benefit']}' : 'Benefit: ${item['benefit']}',
                            style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.green),
                          ),
                        ],
                        if (item['reason'] != null) ...[
                          const SizedBox(height: 8),
                          Text(isTa ? 'காரணம்: ${item['reason']}' : 'Reason: ${item['reason']}'),
                        ],
                        if (item['criteria'] is List && (item['criteria'] as List).isNotEmpty) ...[
                          const SizedBox(height: 10),
                          Text(
                            isTa ? 'கண்டறியப்பட்ட நிபந்தனைகள்:' : 'Extracted Criteria:',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          ...(item['criteria'] as List).map((c) => Padding(
                                padding: const EdgeInsets.only(left: 8.0, top: 2.0),
                                child: Text('• $c'),
                              )),
                        ],

                        // Add to Dashboard Action for eligible schemes
                        if (isEligible) ...[
                          const SizedBox(height: 14),
                          Builder(builder: (btnCtx) {
                            final schemeName = item['name']?.toString() ?? 'Extracted Scheme';
                            final isAdded = _addedSchemeNames.contains(schemeName);

                            return Row(
                              children: [
                                Expanded(
                                  child: ElevatedButton.icon(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: isAdded ? Colors.grey.shade700 : const Color(0xFF1E3A8A),
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(vertical: 12),
                                    ),
                                    onPressed: isAdded
                                        ? null
                                        : () async {
                                            final criteriaList = (item['criteria'] is List)
                                                ? (item['criteria'] as List).map((e) => e.toString()).toList()
                                                : <String>[];

                                            final localSchemes = await ApiService.getLocalOrStarterSchemes();
                                            final existing = localSchemes.schemes.cast<Scheme?>().firstWhere(
                                              (s) => s != null && s.name.trim().toLowerCase() == schemeName.trim().toLowerCase(),
                                              orElse: () => null,
                                            );
                                            final combinedCriteria = <String>{
                                              ...criteriaList,
                                              if (existing != null) ...existing.unmappedCriteria,
                                              if (existing != null) ...existing.requiredDocuments,
                                            }.toList();
                                            final itemRules = (item['rules'] is Map && (item['rules'] as Map).isNotEmpty)
                                                ? Map<String, dynamic>.from(item['rules'] as Map)
                                                : null;

                                            final newScheme = Scheme(
                                              id: existing?.id ?? 'finder_${DateTime.now().millisecondsSinceEpoch}',
                                              name: schemeName,
                                              nameTamil: (item['nameTamil']?.toString().isNotEmpty ?? false)
                                                  ? item['nameTamil']!.toString()
                                                  : (existing?.nameTamil ?? ''),
                                              category: (item['category']?.toString().isNotEmpty ?? false)
                                                  ? item['category']!.toString()
                                                  : (existing?.category ?? 'Social Welfare'),
                                              benefit: (item['benefit']?.toString().isNotEmpty ?? false)
                                                  ? item['benefit']!.toString()
                                                  : (existing?.benefit ?? ''),
                                              status: 'ACTIVE',
                                              rules: itemRules ?? (existing != null && existing.rules.isNotEmpty
                                                  ? existing.rules
                                                  : <String, dynamic>{}),
                                              unmappedCriteria: combinedCriteria,
                                              requiredDocuments: combinedCriteria,
                                              howToApply: (existing != null && existing.howToApply.isNotEmpty)
                                                  ? existing.howToApply
                                                  : [item['reason']?.toString() ?? 'Verified via Scheme Finder'],
                                              officialLinks: [
                                                SchemeLink(
                                                  title: 'Official Source',
                                                  url: _urlController.text.trim().isNotEmpty
                                                      ? _urlController.text.trim()
                                                      : (existing != null && existing.officialLinks.isNotEmpty
                                                          ? existing.officialLinks.first.url
                                                          : 'https://www.tn.gov.in'),
                                                ),
                                              ],
                                              verify: true,
                                              reviewStatus: 'approved',
                                              verificationStatus: 'confirmed',
                                              displayState: 'confirmed',
                                            );

                                            final ok = await ApiService.addSchemeToDashboard(newScheme);
                                            if (!btnCtx.mounted) return;
                                            if (ok) {
                                              setState(() {
                                                _addedSchemeNames.add(schemeName);
                                              });
                                              ScaffoldMessenger.of(btnCtx).showSnackBar(
                                                SnackBar(
                                                  content: Text('Added "$schemeName" to your Dashboard!'),
                                                  backgroundColor: Colors.green,
                                                  action: widget.onNavigateToDashboard != null
                                                      ? SnackBarAction(
                                                          label: 'View Dashboard',
                                                          textColor: Colors.white,
                                                          onPressed: widget.onNavigateToDashboard!,
                                                        )
                                                      : null,
                                                ),
                                              );
                                            }
                                          },
                                    icon: Icon(isAdded ? Icons.check : Icons.add_to_photos),
                                    label: Text(
                                      isAdded
                                          ? (isTa ? 'சேர்க்கப்பட்டது' : 'Added to Dashboard')
                                          : (isTa ? 'முதன்மைப் பக்கத்தில் சேர்க்க' : 'Add to Dashboard'),
                                      style: const TextStyle(fontWeight: FontWeight.bold),
                                    ),
                                  ),
                                ),
                              ],
                            );
                          }),
                        ],
                      ],
                    ),
                  ),
                );
              })
            else
              Card(
                elevation: 2,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline, color: Colors.orange, size: 24),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _analysisResult!['message']?.toString() ??
                              'No scheme found on this web page. Please verify the URL or paste the scheme description directly.',
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
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
}
