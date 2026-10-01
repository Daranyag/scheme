import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../controllers/eligibility_controller.dart';
import '../../widgets/eligibility_criterion_card.dart';

class EligibilityView extends StatefulWidget {
  final String schemeId;
  const EligibilityView({super.key, required this.schemeId});

  @override
  State<EligibilityView> createState() => _EligibilityViewState();
}

class _EligibilityViewState extends State<EligibilityView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<EligibilityController>().checkEligibility(widget.schemeId);
    });
  }

  Color _getStatusColor(String status) {
    if (status == 'ELIGIBLE') return Colors.green;
    if (status == 'POTENTIALLY_ELIGIBLE') return Colors.orange;
    if (status == 'NOT_ELIGIBLE') return Colors.red;
    return Colors.grey;
  }

  String _getStatusText(String status) {
    if (status == 'ELIGIBLE') return 'Eligible';
    if (status == 'POTENTIALLY_ELIGIBLE') return 'Potentially Eligible';
    if (status == 'NOT_ELIGIBLE') return 'Not Eligible';
    return 'Insufficient Information';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Eligibility Checker')),
      body: Consumer<EligibilityController>(
        builder: (context, controller, child) {
          if (controller.isLoading) return const Center(child: CircularProgressIndicator());
          if (controller.errorMessage != null) {
            return Center(child: Text(controller.errorMessage!, style: const TextStyle(color: Colors.red)));
          }
          if (controller.result == null) return const Center(child: Text('No result found'));

          final result = controller.result!;
          
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(result.schemeName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: _getStatusColor(result.status).withOpacity(0.1),
                    border: Border.all(color: _getStatusColor(result.status)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.assignment_turned_in, color: _getStatusColor(result.status)),
                          const SizedBox(width: 8),
                          Text('Your Result: ${_getStatusText(result.status)}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: _getStatusColor(result.status))),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(result.summary),
                    ],
                  ),
                ),
                
                const SizedBox(height: 24),
                const Text('Criteria Details', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                
                ...result.criteria.map((c) => EligibilityCriterionCard(criterion: c)),
                
                if (result.documents.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  const Text('Required Documents', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  ...result.documents.map((d) => ListTile(
                    leading: const Icon(Icons.file_present),
                    title: Text(d),
                  )),
                ],
                
                const SizedBox(height: 24),
                const Text('Important:', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.orange)),
                const SizedBox(height: 4),
                const Text('This eligibility result is an automated assessment based on your profile and the eligibility information available from official Tamil Nadu Government sources. Final eligibility and approval are determined by the concerned Government department.', style: TextStyle(fontSize: 12, color: Colors.grey)),
                
                const SizedBox(height: 32),
                if (result.officialSourceUrl != null)
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.open_in_new),
                      label: Text(result.officialApplicationUrl != null ? 'Apply on Official Website' : 'View Official Source'),
                      onPressed: () async {
                        final url = Uri.parse(result.officialApplicationUrl ?? result.officialSourceUrl!);
                        if (await canLaunchUrl(url)) await launchUrl(url);
                      },
                    ),
                  ),
                  
                const SizedBox(height: 16),
                Center(child: Text('Last verified: ${result.lastVerifiedAt ?? 'Date unavailable'}', style: const TextStyle(fontSize: 12, color: Colors.grey))),
              ],
            ),
          );
        },
      ),
    );
  }
}
