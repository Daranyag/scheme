import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../providers/scheme_fetch_provider.dart';
import '../services/api_service.dart';
import 'evidence_screen.dart';

class DataSourcesScreen extends StatefulWidget {
  const DataSourcesScreen({super.key});

  @override
  State<DataSourcesScreen> createState() => _DataSourcesScreenState();
}

class _DataSourcesScreenState extends State<DataSourcesScreen> with SingleTickerProviderStateMixin {
  TabController? _tabController;
  final _secureStorage = const FlutterSecureStorage();
  
  bool _isAdmin = false;
  bool _isLoading = true;
  String? _errorMessage;
  Map<String, dynamic>? _summaryData;
  List<dynamic>? _sourcesData;
  List<dynamic>? _schemesData;
  List<dynamic>? _coverageData;
  Map<String, dynamic>? _coverageFull;
  DateTime? _lastFetchTime;
  String? _schemeStatusFilter; // 'starter', 'confirmed', 'pending', 'rejected', or null (all)

  final TextEditingController _customUrlController = TextEditingController();

  void _triggerLiveFetch() {
    final fetchProvider = Provider.of<SchemeFetchProvider>(context, listen: false);
    if (fetchProvider.isFetching) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Started fetching schemes in background. You can navigate to other pages!'),
        duration: Duration(seconds: 3),
        backgroundColor: Color(0xFF1E3A8A),
      ),
    );

    fetchProvider.startBackgroundFetch().then((_) {
      if (mounted) {
        _fetchSummary();
        if (fetchProvider.errorMessage != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(fetchProvider.errorMessage!),
              backgroundColor: Colors.red,
            ),
          );
        } else if (fetchProvider.statusMessage != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(fetchProvider.statusMessage!),
              backgroundColor: Colors.green,
            ),
          );
        }
      }
    });
  }

  void _triggerFetchAllSources() {
    final fetchProvider = Provider.of<SchemeFetchProvider>(context, listen: false);
    if (fetchProvider.isFetching) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Fetching across all official Tamil Nadu sources in background...'),
        duration: Duration(seconds: 3),
        backgroundColor: Color(0xFF1E3A8A),
      ),
    );

    fetchProvider.startFetchAllSources().then((_) {
      if (mounted) {
        _fetchSummary();
        if (fetchProvider.errorMessage != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(fetchProvider.errorMessage!),
              backgroundColor: Colors.red,
            ),
          );
        } else if (fetchProvider.statusMessage != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(fetchProvider.statusMessage!),
              backgroundColor: Colors.green,
            ),
          );
        }
      }
    });
  }

  void _triggerCustomSourceFetch() {
    final url = _customUrlController.text.trim();
    if (url.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter an official Tamil Nadu portal URL (e.g. https://www.tn.gov.in/...)'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final fetchProvider = Provider.of<SchemeFetchProvider>(context, listen: false);
    if (fetchProvider.isFetching) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Fetching scheme data from $url in background...'),
        duration: const Duration(seconds: 3),
        backgroundColor: const Color(0xFF1E3A8A),
      ),
    );

    fetchProvider.startCustomSourceFetch(url).then((success) {
      if (mounted) {
        _fetchSummary();
        if (success) {
          _customUrlController.clear();
        }
        if (fetchProvider.errorMessage != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(fetchProvider.errorMessage!),
              backgroundColor: Colors.red,
            ),
          );
        } else if (fetchProvider.statusMessage != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(fetchProvider.statusMessage!),
              backgroundColor: Colors.green,
            ),
          );
        }
      }
    });
  }

  @override
  void initState() {
    super.initState();
    _setupTabs();
    _checkAdminStatus();
    _loadOfflineData();
    _fetchSummary();
  }
  
  void _setupTabs() {
    final tabCount = _isAdmin ? 10 : 5;
    if (_tabController != null) {
      if (_tabController!.length == tabCount) return;
      _tabController!.dispose();
    }
    _tabController = TabController(length: tabCount, vsync: this);
  }

  @override
  void dispose() {
    _tabController?.dispose();
    super.dispose();
  }

  Future<void> _checkAdminStatus() async {
    final key = await _secureStorage.read(key: 'admin_key');
    if (key != null && key.isNotEmpty && !_isAdmin) {
      if (!mounted) return;
      setState(() {
        _isAdmin = true;
        _setupTabs();
      });
    }
  }

  Future<void> _loadOfflineData() async {
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString('data_sources_summary');
    if (cached != null) {
      try {
        final data = jsonDecode(cached);
        setState(() {
          _summaryData = data;
          _lastFetchTime = DateTime.tryParse(data['lastChecked'] ?? '');
          _isLoading = false;
        });
      } catch (e) {
        // ignore
      }
    }
  }

  Future<void> _fetchSummary() async {
    setState(() => _isLoading = true);
    try {
      final responses = await Future.wait([
         http.get(Uri.parse('${ApiService.baseUrl}/api/data/summary')),
         http.get(Uri.parse('${ApiService.baseUrl}/api/data/sources')),
         http.get(Uri.parse('${ApiService.baseUrl}/api/data/schemes')),
         http.get(Uri.parse('${ApiService.baseUrl}/api/data/coverage')),
      ]);
      
      if (responses[0].statusCode == 200) {
        final data = jsonDecode(responses[0].body);
        final sourcesData = responses[1].statusCode == 200 ? jsonDecode(responses[1].body)['sources'] : [];
        final schemesData = responses[2].statusCode == 200 ? jsonDecode(responses[2].body)['schemes'] : [];
        final coverageFull = responses[3].statusCode == 200 ? jsonDecode(responses[3].body) : null;
        final coverageData = coverageFull != null ? coverageFull['departments'] : [];
        
        setState(() {
          _summaryData = data;
          _sourcesData = sourcesData;
          _schemesData = schemesData;
          _coverageFull = coverageFull;
          _coverageData = coverageData;
          _lastFetchTime = DateTime.now();
          _isLoading = false;
          _errorMessage = null;
        });
        final prefs = await SharedPreferences.getInstance();
        prefs.setString('data_sources_summary', responses[0].body);
        if (sourcesData.isNotEmpty) {
           prefs.setString('data_sources_list', jsonEncode(sourcesData));
        }
      } else {
        setState(() {
          _errorMessage = 'Failed to load live data';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Offline mode';
        _isLoading = false;
      });
    }
  }
  
  Future<void> _promptAdminKey() async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Admin Access'),
        content: TextField(
          controller: controller,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Admin Key'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(context, controller.text), child: const Text('Unlock')),
        ],
      ),
    );
    
    if (result != null && result.isNotEmpty) {
      await _secureStorage.write(key: 'admin_key', value: result);
      if (!mounted) return;
      setState(() {
        _isAdmin = true;
        _setupTabs();
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Admin access unlocked')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: GestureDetector(
          onLongPress: _promptAdminKey,
          child: const Text('Data & Sources'),
        ),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _fetchSummary),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: [
            const Tab(text: 'Overview'),
            const Tab(text: 'Sources'),
            const Tab(text: 'Schemes'),
            const Tab(text: 'Coverage'),
            const Tab(text: 'Changes'),
            if (_isAdmin) ...[
               const Tab(text: 'Live Activity'),
               const Tab(text: 'Jobs'),
               const Tab(text: 'AI Usage'),
               const Tab(text: 'Review Queue'),
               const Tab(text: 'Alerts & Charts'),
            ]
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildOverviewTab(),
          _buildSourcesTab(),
          _buildSchemesTab(),
          _buildCoverageTab(),
          const Center(child: Text('Recent Changes')),
          if (_isAdmin) ...[
             const Center(child: Text('Live SSE Logs...')),
             const Center(child: Text('Jobs Management')),
             const Center(child: Text('AI Budget')),
             const Center(child: Text('Pending Review Queue')),
             const Center(child: Text('Alerts')),
          ]
        ],
      ),
    );
  }

  Widget _buildOverviewTab() {
    if (_isLoading && _summaryData == null) {
       return const Center(child: CircularProgressIndicator());
    }
    
    final counts = _summaryData?['counts'] ?? {};
    final health = _summaryData?['sourceHealth'] ?? {};
    
    return RefreshIndicator(
      onRefresh: _fetchSummary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_errorMessage != null)
            Card(
              color: Colors.orange[50],
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    const Icon(Icons.offline_bolt, color: Colors.orange),
                    const SizedBox(width: 8),
                    Expanded(child: Text('$_errorMessage. Showing offline copy from ${_lastFetchTime?.toLocal().toString() ?? 'unknown'}')),
                  ],
                ),
              ),
            ),
            
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Data Freshness', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      if (counts['fetchedToday'] != null && counts['fetchedToday'] > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.green.shade100,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            '+${counts['fetchedToday']} today',
                            style: TextStyle(color: Colors.green.shade800, fontWeight: FontWeight.bold, fontSize: 12),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text('Total Schemes in DB: ${counts['totalSchemes'] ?? '-'}'),
                  Text('Verified with Official Quotes: ${counts['verifiedSchemes'] ?? '-'}'),
                  Text('Fetched Today (tn.gov.in & sources): ${counts['fetchedToday'] ?? 0}'),
                  Text('Already Indexed Previously: ${counts['alreadyIndexed'] ?? '-'}'),
                  Text('Announced: ${counts['announcedSchemes'] ?? '-'}'),
                  Consumer<SchemeFetchProvider>(
                    builder: (context, fetchProvider, _) {
                      final isFetching = fetchProvider.isFetching;
                      return Column(
                        children: [
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF1E3A8A),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 10),
                              ),
                              onPressed: isFetching ? null : _triggerLiveFetch,
                              icon: isFetching
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    )
                                  : const Icon(Icons.cloud_download, size: 18),
                              label: Text(isFetching ? 'Fetching in background...' : 'Fetch Latest Directory Schemes (tn.gov.in)'),
                            ),
                          ),
                          const SizedBox(height: 8),
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                side: const BorderSide(color: Color(0xFF1E3A8A)),
                              ),
                              onPressed: isFetching ? null : _triggerFetchAllSources,
                              icon: const Icon(Icons.public, size: 18, color: Color(0xFF1E3A8A)),
                              label: const Text(
                                'Fetch Across All Official TN Sources',
                                style: TextStyle(color: Color(0xFF1E3A8A), fontWeight: FontWeight.bold),
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                  if ((counts['pendingSchemesFound'] ?? 0) > 0) ...[
                    const SizedBox(height: 8),
                    Text('${counts['pendingSchemesFound']} more found, waiting for review', style: const TextStyle(color: Colors.grey, fontStyle: FontStyle.italic)),
                  ],
                ],
              ),
            ),
          ),
          
          const SizedBox(height: 16),
          Card(
            color: Colors.white,
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: Colors.blue.shade100),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: Colors.blue.shade50,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.add_link, color: Color(0xFF1E3A8A), size: 20),
                      ),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Fetch from Custom TN Source',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Enter an official Tamil Nadu Government portal or department scheme URL. Only official TN sources (*.tn.gov.in, *.nic.in, or verified TN welfare portals) are allowed.',
                    style: TextStyle(fontSize: 12, color: Colors.blueGrey),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _customUrlController,
                          decoration: InputDecoration(
                            hintText: 'https://www.tn.gov.in/... or *.nic.in',
                            hintStyle: TextStyle(fontSize: 13, color: Colors.grey.shade500),
                            prefixIcon: const Icon(Icons.link, size: 18),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          keyboardType: TextInputType.url,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Consumer<SchemeFetchProvider>(
                        builder: (context, fetchProvider, _) {
                          final isFetching = fetchProvider.isFetching;
                          return ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF1E3A8A),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: isFetching ? null : _triggerCustomSourceFetch,
                            icon: isFetching
                                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.download, size: 18),
                            label: const Text('Fetch'),
                          );
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.verified_user, size: 12, color: Colors.green),
                      const SizedBox(width: 4),
                      Text(
                        'Allowed: *.tn.gov.in, *.nic.in, cmchistn.com, tnesevai, karuvoolam, etc.',
                        style: TextStyle(fontSize: 11, color: Colors.green.shade800),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          
          const SizedBox(height: 16),
          Card(
             child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                   crossAxisAlignment: CrossAxisAlignment.start,
                   children: [
                      const Text('Source Health', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      Text('Working: ${health['working'] ?? '-'}', style: const TextStyle(color: Colors.green)),
                      Text('Errors / Unreachable: ${health['errors'] ?? '-'}', style: const TextStyle(color: Colors.red)),
                   ]
                )
             )
          ),
          
          const SizedBox(height: 24),
          const Text('How we get this data', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text('We periodically read official government websites and compare changes. Every fact retains its source and quote. Results can still be delayed or incorrect, so always confirm with the official department.', style: TextStyle(color: Colors.grey)),
        ],
      ),
    );
  }

  Widget _buildSourcesTab() {
     if (_isLoading && _sourcesData == null) {
        return const Center(child: CircularProgressIndicator());
     }
     
     if (_sourcesData == null || _sourcesData!.isEmpty) {
        return const Center(child: Text('No sources available.'));
     }

     return RefreshIndicator(
       onRefresh: _fetchSummary,
       child: ListView.builder(
         padding: const EdgeInsets.all(12),
         itemCount: _sourcesData!.length,
         itemBuilder: (context, index) {
            final source = _sourcesData![index];
            final String status = source['healthStatus'] ?? 'Not checked yet';
            
            Color statusColor = Colors.grey;
            IconData statusIcon = Icons.help_outline;
            if (status == 'Working') {
              statusColor = Colors.green;
              statusIcon = Icons.check_circle;
            } else if (status == 'Not checked yet') {
              statusColor = Colors.grey;
              statusIcon = Icons.schedule;
            } else if (status.contains('48 hours')) {
              statusColor = Colors.amber.shade800;
              statusIcon = Icons.history;
            } else if (status == 'Slow') {
              statusColor = Colors.amber.shade800;
              statusIcon = Icons.timer_outlined;
            } else if (status == 'Certificate problem') {
              statusColor = Colors.red.shade700;
              statusIcon = Icons.lock_clock;
            } else if (status == 'Needs JavaScript') {
              statusColor = Colors.deepOrange;
              statusIcon = Icons.code;
            } else if (status == 'Blocked') {
              statusColor = Colors.red;
              statusIcon = Icons.block;
            } else if (status == 'Not found') {
              statusColor = Colors.red;
              statusIcon = Icons.search_off;
            } else {
              statusColor = Colors.red.shade800;
              statusIcon = Icons.error_outline;
            }

            final String lastSuccessStr = source['lastSuccessAt'] != null
                ? source['lastSuccessAt'].toString().split('T')[0]
                : 'None recorded';
            final String? errorReason = source['lastErrorReason'];
            
            return Card(
               margin: const EdgeInsets.only(bottom: 12),
               child: ListTile(
                  title: Text(source['name'] ?? source['domain'], style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Column(
                     crossAxisAlignment: CrossAxisAlignment.start,
                     children: [
                        const SizedBox(height: 4),
                        Text(source['domain'], style: const TextStyle(color: Colors.blue, decoration: TextDecoration.underline, fontSize: 12)),
                        const SizedBox(height: 8),
                        Wrap(
                           crossAxisAlignment: WrapCrossAlignment.center,
                           spacing: 8,
                           children: [
                              Chip(
                                 visualDensity: VisualDensity.compact,
                                 avatar: Icon(statusIcon, size: 14, color: statusColor),
                                 label: Text(status, style: TextStyle(fontSize: 10, color: statusColor, fontWeight: FontWeight.bold)),
                                 backgroundColor: statusColor.withValues(alpha: 0.1),
                              ),
                              Text('Trust: ${source['trustLevel'] ?? 'official'}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                           ],
                        ),
                        if (errorReason != null && errorReason.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text('Reason: $errorReason', style: TextStyle(fontSize: 11, color: Colors.red.shade700)),
                        ],
                        const SizedBox(height: 4),
                        Text('Last successful fetch: $lastSuccessStr', style: const TextStyle(fontSize: 11, color: Colors.blueGrey)),
                     ]
                  ),
                  onTap: () {
                     // Open Source Detail Page
                  },
               )
            );
         },
       )
     );
  }

  Widget _buildSchemesTab() {
     if (_isLoading && _schemesData == null) {
        return const Center(child: CircularProgressIndicator());
     }
     
     if (_schemesData == null || _schemesData!.isEmpty) {
        return const Center(child: Text('No schemes available.'));
     }

     final counts = _summaryData?['counts'] ?? {};
     final fetchedToday = counts['fetchedToday'] ?? 0;

     // Apply status filter when selected
     final filteredSchemes = _schemesData!.where((s) {
       if (_schemeStatusFilter == null) return true;
       final origin = (s['origin'] ?? '').toString().toLowerCase();
       final reviewStatus = (s['reviewStatus'] ?? '').toString().toLowerCase();
       final verificationStatus = (s['verificationStatus'] ?? '').toString().toLowerCase();
       final status = (s['status'] ?? '').toString().toLowerCase();

       if (_schemeStatusFilter == 'starter') {
         return origin == 'starter' || s['isStarter'] == true;
       } else if (_schemeStatusFilter == 'confirmed') {
         return verificationStatus == 'verified' || verificationStatus == 'confirmed' || reviewStatus == 'approved';
       } else if (_schemeStatusFilter == 'pending') {
         return reviewStatus == 'pending' || verificationStatus == 'pending';
       } else if (_schemeStatusFilter == 'rejected') {
         return reviewStatus == 'rejected' || status == 'rejected';
       }
       return true;
     }).toList();

     return RefreshIndicator(
       onRefresh: _fetchSummary,
       child: ListView.builder(
         padding: const EdgeInsets.all(12),
         itemCount: filteredSchemes.length + 1,
         itemBuilder: (context, index) {
            if (index == 0) {
              return Column(
                children: [
                  Card(
                    color: Colors.blue.shade50,
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          const Icon(Icons.info_outline, color: Color(0xFF1E3A8A)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '${_schemesData!.length} schemes in monitoring database ($fetchedToday fetched today).',
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                            ),
                          ),
                          Consumer<SchemeFetchProvider>(
                            builder: (context, fetchProvider, _) {
                              final isFetching = fetchProvider.isFetching;
                              return TextButton.icon(
                                icon: isFetching
                                    ? const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2))
                                    : const Icon(Icons.refresh, size: 16),
                                label: Text(isFetching ? 'Fetching...' : 'Fetch', style: const TextStyle(fontSize: 12)),
                                onPressed: isFetching ? null : _triggerLiveFetch,
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (_schemeStatusFilter != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: _schemeStatusFilter == 'confirmed'
                            ? Colors.green.shade50
                            : _schemeStatusFilter == 'rejected'
                                ? Colors.red.shade50
                                : _schemeStatusFilter == 'pending'
                                    ? Colors.orange.shade50
                                    : Colors.blueGrey.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: _schemeStatusFilter == 'confirmed'
                              ? Colors.green.shade300
                              : _schemeStatusFilter == 'rejected'
                                  ? Colors.red.shade300
                                  : _schemeStatusFilter == 'pending'
                                      ? Colors.orange.shade300
                                      : Colors.blueGrey.shade300,
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            _schemeStatusFilter == 'confirmed'
                                ? Icons.verified
                                : _schemeStatusFilter == 'rejected'
                                    ? Icons.cancel
                                    : _schemeStatusFilter == 'pending'
                                        ? Icons.hourglass_top
                                        : Icons.flag,
                            size: 18,
                            color: _schemeStatusFilter == 'confirmed'
                                ? Colors.green.shade800
                                : _schemeStatusFilter == 'rejected'
                                    ? Colors.red.shade800
                                    : _schemeStatusFilter == 'pending'
                                        ? Colors.orange.shade900
                                        : Colors.blueGrey.shade800,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Showing ${_schemeStatusFilter!.toUpperCase()} schemes (${filteredSchemes.length})',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 13,
                                color: _schemeStatusFilter == 'confirmed'
                                    ? Colors.green.shade900
                                    : _schemeStatusFilter == 'rejected'
                                        ? Colors.red.shade900
                                        : _schemeStatusFilter == 'pending'
                                            ? Colors.orange.shade900
                                            : Colors.blueGrey.shade900,
                              ),
                            ),
                          ),
                          TextButton(
                            style: TextButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              minimumSize: const Size(50, 30),
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            onPressed: () {
                              setState(() {
                                _schemeStatusFilter = null;
                              });
                            },
                            child: const Text('Show All', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                    ),
                  if (filteredSchemes.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 32),
                      child: Center(
                        child: Text(
                          'No schemes found for status "${_schemeStatusFilter!.toUpperCase()}".',
                          style: const TextStyle(color: Colors.grey, fontSize: 14),
                        ),
                      ),
                    ),
                ],
              );
            }

            final scheme = filteredSchemes[index - 1];
            final verification = scheme['verificationStatus'] ?? 'unverified';
            final origin = scheme['origin'] ?? 'starter';
            
            return Card(
               margin: const EdgeInsets.only(bottom: 12),
               child: ListTile(
                  title: Text(scheme['name'] ?? 'Unknown Scheme', style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Column(
                     crossAxisAlignment: CrossAxisAlignment.start,
                     children: [
                        const SizedBox(height: 6),
                        Wrap(
                           spacing: 6,
                           runSpacing: 4,
                           children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: verification == 'verified' ? Colors.green.shade50 : Colors.orange.shade50,
                                  borderRadius: BorderRadius.circular(4),
                                  border: Border.all(color: verification == 'verified' ? Colors.green.shade300 : Colors.orange.shade300),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(verification == 'verified' ? Icons.verified : Icons.help_outline, 
                                       size: 12, 
                                       color: verification == 'verified' ? Colors.green.shade800 : Colors.orange.shade800
                                    ),
                                    const SizedBox(width: 4),
                                    Text(verification.toUpperCase(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: verification == 'verified' ? Colors.green.shade800 : Colors.orange.shade800)),
                                  ],
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade100,
                                  borderRadius: BorderRadius.circular(4),
                                  border: Border.all(color: Colors.grey.shade400),
                                ),
                                child: Text('Origin: $origin', style: const TextStyle(fontSize: 11, color: Colors.black87)),
                              ),
                           ],
                        ),
                        const SizedBox(height: 4),
                        Text('Department: ${scheme['department'] ?? 'Not specified'}', style: const TextStyle(fontSize: 12)),
                        Text('Status: ${scheme['status'] ?? 'unknown'}', style: const TextStyle(fontSize: 12)),
                        Text('Last verified: ${scheme['lastVerified'] != null ? DateTime.tryParse(scheme['lastVerified'])?.toLocal().toString() ?? '-' : '-'}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                     ]
                  ),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 14),
                  onTap: () {
                     Navigator.push(
                       context,
                       MaterialPageRoute(
                         builder: (context) => EvidenceScreen(scheme: scheme),
                       ),
                     );
                  },
               )
            );
         },
       )
     );
  }

  Widget _buildCoverageTab() {
    if (_isLoading && _coverageData == null) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_coverageData == null || _coverageData!.isEmpty) {
      return const Center(child: Text('No department coverage data available.'));
    }

    final counts = _coverageFull?['counts'] ?? {};
    final totalDepts = _coverageFull?['totalDepartments'] ?? _coverageData!.length;
    final workingSites = _coverageFull?['workingSites'] ?? _coverageData!.where((d) => d['workingSite'] == true).length;
    final schemesIndexed = _coverageFull?['schemesIndexed'] ?? _coverageData!.fold<int>(0, (sum, d) => sum + ((d['schemesCount'] ?? 0) as int));
    final gaps = (_coverageFull?['gaps'] as List<dynamic>?) ?? [];
    final starterCount = counts['starter'] ?? 0;
    final confirmedCount = counts['confirmed'] ?? 0;
    final pendingCount = counts['pending'] ?? 0;
    final rejectedCount = counts['rejected'] ?? 0;

    return RefreshIndicator(
      onRefresh: _fetchSummary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: Colors.blue[50],
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Systematic Government Coverage', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text('Departments Monitored: $totalDepts'),
                  Text('Departments with Live Working Sites: $workingSites'),
                  Text('Schemes Indexed (with quoted facts): $schemesIndexed', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green)),
                  const Divider(height: 16),
                  const Divider(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Status Counts Breakdown:', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      const Text('(Tap to view)', style: TextStyle(fontSize: 11, color: Colors.blueGrey)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () {
                          setState(() => _schemeStatusFilter = 'starter');
                          _tabController?.animateTo(2);
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.grey.shade400),
                          ),
                          child: Text(
                            '• Starter: $starterCount',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                          ),
                        ),
                      ),
                      InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () {
                          setState(() => _schemeStatusFilter = 'confirmed');
                          _tabController?.animateTo(2);
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.green.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.green.shade400),
                          ),
                          child: Text(
                            '• Confirmed: $confirmedCount',
                            style: TextStyle(color: Colors.green.shade900, fontWeight: FontWeight.bold, fontSize: 12),
                          ),
                        ),
                      ),
                      InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () {
                          setState(() => _schemeStatusFilter = 'pending');
                          _tabController?.animateTo(2);
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.orange.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.orange.shade400),
                          ),
                          child: Text(
                            '• Pending: $pendingCount',
                            style: TextStyle(color: Colors.orange.shade900, fontWeight: FontWeight.bold, fontSize: 12),
                          ),
                        ),
                      ),
                      InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () {
                          setState(() => _schemeStatusFilter = 'rejected');
                          _tabController?.animateTo(2);
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.red.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.red.shade400),
                          ),
                          child: Text(
                            '• Rejected: $rejectedCount',
                            style: TextStyle(color: Colors.red.shade900, fontWeight: FontWeight.bold, fontSize: 12),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (gaps.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('Coverage Gaps (${gaps.length})', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            ...gaps.map((g) => Card(
              color: Colors.orange.shade50,
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(g['department'] ?? 'Department', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.orange.shade900)),
                    const SizedBox(height: 4),
                    Text('Reason: ${g['reason'] ?? 'No verified quoted facts'}', style: TextStyle(fontSize: 12, color: Colors.grey.shade800)),
                  ],
                ),
              ),
            )),
          ],
          const SizedBox(height: 16),
          const Text('Departments & Sources', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          ..._coverageData!.map((dept) {
            final schemesCount = dept['schemesCount'] ?? 0;
            final hasGap = dept['hasGap'] == true || schemesCount == 0;
            final String? gapReason = dept['gapReason'];
            final String siteStatus = dept['siteStatus'] ?? (dept['workingSite'] == true ? 'Working' : 'Not checked');

            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: hasGap ? Colors.orange[100] : Colors.green[100],
                  child: Icon(
                    hasGap ? Icons.warning_amber_rounded : Icons.check_circle_outline,
                    color: hasGap ? Colors.orange : Colors.green,
                  ),
                ),
                title: Text(dept['department'] ?? 'Department', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Category: ${dept['category'] ?? '-'}', style: const TextStyle(fontSize: 12)),
                    Text('Website: ${dept['website'] ?? '-'} ($siteStatus)', style: const TextStyle(fontSize: 11, color: Colors.blueGrey)),
                    const SizedBox(height: 2),
                    Text(
                      hasGap 
                        ? (gapReason != null ? 'Gap: $gapReason' : 'Gap: 0 schemes indexed') 
                        : 'Schemes indexed: $schemesCount',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: hasGap ? Colors.orange[800] : Colors.green[800],
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Starter: ${dept['starterCount'] ?? 0} | Confirmed: ${dept['confirmedCount'] ?? 0} | Pending: ${dept['pendingCount'] ?? 0} | Rejected: ${dept['rejectedCount'] ?? 0}',
                      style: const TextStyle(fontSize: 11, color: Colors.grey),
                    ),
                  ],
                ),
                trailing: Chip(
                  label: Text('$schemesCount schemes', style: const TextStyle(fontSize: 11)),
                  backgroundColor: hasGap ? Colors.orange[50] : Colors.green[50],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
