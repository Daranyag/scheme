import 'package:flutter/material.dart';
import '../models/scheme_model.dart';
import 'package:intl/intl.dart';

class SchemeSummaryCard extends StatelessWidget {
  final SchemeModel scheme;
  final VoidCallback onTap;
  final String? relevanceReason;

  const SchemeSummaryCard({
    super.key,
    required this.scheme,
    required this.onTap,
    this.relevanceReason,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 16.0),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(scheme.schemeName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              
              Row(
                children: [
                  Icon(Icons.category, size: 16, color: Colors.blueGrey),
                  const SizedBox(width: 4),
                  Expanded(child: Text('${scheme.category} • ${scheme.department}', style: const TextStyle(fontSize: 14, color: Colors.blueGrey))),
                ],
              ),
              
              const SizedBox(height: 8),
              Text(scheme.shortDescription.isNotEmpty ? scheme.shortDescription : (scheme.description.length > 100 ? '${scheme.description.substring(0, 100)}...' : scheme.description), style: const TextStyle(fontSize: 14)),
              
              if (relevanceReason != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.check_circle, color: Colors.green, size: 16),
                      const SizedBox(width: 8),
                      Expanded(child: Text(relevanceReason!, style: const TextStyle(color: Colors.green, fontSize: 12))),
                    ],
                  ),
                ),
              ],
              
              const SizedBox(height: 12),
              const Divider(),
              const SizedBox(height: 8),
              
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.verified, size: 16, color: Colors.blue),
                      const SizedBox(width: 4),
                      const Text('Official Source', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                    ],
                  ),
                  Text(
                    'Last checked: ${scheme.lastVerifiedAt != null ? DateFormat('dd MMM yyyy').format(scheme.lastVerifiedAt!) : 'N/A'}',
                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
