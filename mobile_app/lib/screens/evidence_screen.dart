import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../services/api_service.dart';

class EvidenceScreen extends StatefulWidget {
  final Map<String, dynamic> scheme;

  const EvidenceScreen({super.key, required this.scheme});

  @override
  State<EvidenceScreen> createState() => _EvidenceScreenState();
}

class _EvidenceScreenState extends State<EvidenceScreen> {
  bool _isLoading = true;
  String? _errorMessage;
  List<dynamic> _facts = [];

  @override
  void initState() {
    super.initState();
    _fetchEvidence();
  }

  Future<void> _fetchEvidence() async {
    try {
      final schemeId = widget.scheme['_id'];
      final response = await http.get(Uri.parse('${ApiService.baseUrl}/api/data/schemes/$schemeId/evidence'));
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() {
          _facts = data['facts'] ?? [];
          _isLoading = false;
        });
      } else {
        setState(() {
          _errorMessage = 'Failed to load evidence.';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Network error.';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Evidence Ledger'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Text(_errorMessage!))
              : _facts.isEmpty
                  ? const Center(child: Text('No verified facts found for this scheme.'))
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _facts.length,
                      itemBuilder: (context, index) {
                        final fact = _facts[index];
                        final isConflict = fact['conflict'] == true;
                        
                        return Card(
                          margin: const EdgeInsets.only(bottom: 16),
                          shape: RoundedRectangleBorder(
                            side: BorderSide(
                              color: isConflict ? Colors.red.shade300 : Colors.grey.shade300,
                              width: isConflict ? 2 : 1,
                            ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Chip(
                                      label: Text(fact['field']?.toString().toUpperCase() ?? 'UNKNOWN FIELD', 
                                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                                      visualDensity: VisualDensity.compact,
                                    ),
                                    Text(
                                      fact['fetchedAt'] != null 
                                          ? DateTime.tryParse(fact['fetchedAt'])?.toLocal().toString().split('.')[0] ?? '' 
                                          : '',
                                      style: const TextStyle(fontSize: 12, color: Colors.grey),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  'Value: ${fact['value'] ?? 'N/A'}',
                                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(height: 8),
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade100,
                                    border: Border(left: BorderSide(color: Theme.of(context).colorScheme.primary, width: 4)),
                                  ),
                                  child: Text(
                                    '"${fact['exactQuote'] ?? 'No exact quote available'}"',
                                    style: const TextStyle(fontStyle: FontStyle.italic, fontSize: 13),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Row(
                                  children: [
                                    const Icon(Icons.link, size: 14, color: Colors.blue),
                                    const SizedBox(width: 4),
                                    Expanded(
                                      child: Text(
                                        fact['sourceDomain'] ?? fact['sourceUrl'] ?? 'Unknown Source',
                                        style: const TextStyle(fontSize: 12, color: Colors.blue, decoration: TextDecoration.underline),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: Colors.green.shade50,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        fact['sourceTrust'] ?? 'official',
                                        style: TextStyle(fontSize: 10, color: Colors.green.shade800, fontWeight: FontWeight.bold),
                                      ),
                                    )
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}
