import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../controllers/scheme_controller.dart';
import '../../models/scheme_model.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

class SchemeDetailView extends StatefulWidget {
  final String id;
  const SchemeDetailView({super.key, required this.id});

  @override
  State<SchemeDetailView> createState() => _SchemeDetailViewState();
}

class _SchemeDetailViewState extends State<SchemeDetailView> {
  SchemeModel? _scheme;
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadScheme();
  }

  Future<void> _loadScheme() async {
    try {
      final controller = context.read<SchemeController>();
      final scheme = await controller.getSchemeById(widget.id);
      setState(() {
        _scheme = scheme;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _launchUrl(String urlString) async {
    final uri = Uri.tryParse(urlString);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open the official link.')));
      }
    }
  }

  Widget _buildSection(String title, String content) {
    if (content.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(content, style: const TextStyle(fontSize: 14)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scheme Details')),
      body: _isLoading 
        ? const Center(child: CircularProgressIndicator())
        : _errorMessage != null
          ? Center(child: Text(_errorMessage!, style: const TextStyle(color: Colors.red)))
          : _scheme == null
            ? const Center(child: Text('Scheme not found.'))
            : SingleChildScrollView(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_scheme!.schemeName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    _buildSection('Department', _scheme!.department),
                    _buildSection('Category', _scheme!.category),
                    _buildSection('Description', _scheme!.description.isNotEmpty ? _scheme!.description : _scheme!.shortDescription),
                    _buildSection('Benefits', _scheme!.benefit),
                    _buildSection('Eligibility', _scheme!.eligibility),
                    _buildSection('Age Limit', _scheme!.ageLimit),
                    _buildSection('Income Limit', _scheme!.incomeLimit),
                    _buildSection('Application Method', _scheme!.applicationMethod),
                    
                    if (_scheme!.documents.isNotEmpty)
                      _buildSection('Documents Required', _scheme!.documents.join('\n')),
                    
                    const Divider(),
                    const SizedBox(height: 16),
                    
                    const Text('Source: Government of Tamil Nadu', style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text('Last checked: ${_scheme!.lastVerifiedAt != null ? DateFormat('dd-MM-yyyy HH:mm').format(_scheme!.lastVerifiedAt!) : 'N/A'}', style: const TextStyle(color: Colors.grey)),
                    
                    const SizedBox(height: 24),
                    
                    if (_scheme!.officialUrl.isNotEmpty)
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () => _launchUrl(_scheme!.officialUrl),
                          child: const Text('View Official Source'),
                        ),
                      ),
                      
                    if (_scheme!.officialApplicationUrl.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 12.0),
                        child: SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () => _launchUrl(_scheme!.officialApplicationUrl),
                            child: const Text('Apply on Official Website'),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
    );
  }
}
