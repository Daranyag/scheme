import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../services/api_service.dart';
import 'evidence_screen.dart';

class DataSourcesScreen extends StatefulWidget {
  const DataSourcesScreen({super.key});

  @override
  State<DataSourcesScreen> createState() => _DataSourcesScreenState();
}

class _DataSourcesScreenState extends State<DataSourcesScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _secureStorage = const FlutterSecureStorage();
  
  bool _isAdmin = false;
  bool _isLoading = true;
  String? _errorMessage;
  Map<String, dynamic>? _summaryData;
  List<dynamic>? _sourcesData;
  List<dynamic>? _schemesData;
  DateTime? _lastFetchTime;

  @override
  void initState() {
    super.initState();
    _checkAdminStatus();
    _loadOfflineData();
    _fetchSummary();
  }
  
  void _setupTabs() {
    final tabCount = _isAdmin ? 9 : 4;
    _tabController = TabController(length: tabCount, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _checkAdminStatus() async {
    final key = await _secureStorage.read(key: 'admin_key');
    if (key != null && key.isNotEmpty) {
      setState(() {
        _isAdmin = true;
        _setupTabs();
      });
    } else {
      _setupTabs();
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
      ]);
      
      if (responses[0].statusCode == 200) {
        final data = jsonDecode(responses[0].body);
        final sourcesData = responses[1].statusCode == 200 ? jsonDecode(responses[1].body)['sources'] : [];
        final schemesData = responses[2].statusCode == 200 ? jsonDecode(responses[2].body)['schemes'] : [];
        
        setState(() {
          _summaryData = data;
          _sourcesData = sourcesData;
          _schemesData = schemesData;
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
       setState(() {
         _isAdmin = true;
         _setupTabs();
       });
       ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Admin access unlocked')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_tabController == null) {
       return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    
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
                  const Text('Data Freshness', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text('Total Schemes: ${counts['totalSchemes'] ?? '-'}'),
                  Text('Verified (Official): ${counts['verifiedSchemes'] ?? '-'}'),
                  Text('Announced: ${counts['announcedSchemes'] ?? '-'}'),
                  const SizedBox(height: 8),
                  if ((counts['pendingSchemesFound'] ?? 0) > 0)
                     Text('${counts['pendingSchemesFound']} more found, waiting for review', style: const TextStyle(color: Colors.grey, fontStyle: FontStyle.italic)),
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
            final status = source['healthStatus'] ?? 'unknown';
            
            Color statusColor = Colors.grey;
            IconData statusIcon = Icons.help_outline;
            if (status == 'working') { statusColor = Colors.green; statusIcon = Icons.check_circle; }
            else if (status == 'tls_expired') { statusColor = Colors.red; statusIcon = Icons.lock_clock; }
            else if (status == 'blocked') { statusColor = Colors.orange; statusIcon = Icons.block; }
            
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
                        Row(
                           children: [
                              Chip(
                                 visualDensity: VisualDensity.compact,
                                 avatar: Icon(statusIcon, size: 14, color: statusColor),
                                 label: Text(status.toUpperCase(), style: TextStyle(fontSize: 10, color: statusColor, fontWeight: FontWeight.bold)),
                                 backgroundColor: statusColor.withValues(alpha: 0.1),
                              ),
                              const SizedBox(width: 8),
                              Text('Trust: ${source['trustLevel'] ?? 'official'}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                           ]
                        )
                     ]
                  ),
                  onTap: () {
                     // TODO: Open Source Detail Page
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

     return RefreshIndicator(
       onRefresh: _fetchSummary,
       child: ListView.builder(
         padding: const EdgeInsets.all(12),
         itemCount: _schemesData!.length,
         itemBuilder: (context, index) {
            final scheme = _schemesData![index];
            final verification = scheme['verificationStatus'] ?? 'unverified';
            
            return Card(
               margin: const EdgeInsets.only(bottom: 12),
               child: ListTile(
                  title: Text(scheme['name'] ?? 'Unknown Scheme', style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Column(
                     crossAxisAlignment: CrossAxisAlignment.start,
                     children: [
                        const SizedBox(height: 6),
                        Row(
                           children: [
                              Icon(verification == 'verified' ? Icons.verified : Icons.help_outline, 
                                 size: 14, 
                                 color: verification == 'verified' ? Colors.blue : Colors.orange
                              ),
                              const SizedBox(width: 4),
                              Text(verification.toUpperCase(), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                           ]
                        ),
                        const SizedBox(height: 4),
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
}
