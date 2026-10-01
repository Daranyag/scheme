import 'package:flutter/material.dart';
import '../models/eligibility/eligibility_result_model.dart';

class EligibilityCriterionCard extends StatelessWidget {
  final EligibilityCriterionModel criterion;

  const EligibilityCriterionCard({super.key, required this.criterion});

  @override
  Widget build(BuildContext context) {
    IconData icon;
    Color color;

    switch (criterion.status) {
      case 'PASS':
        icon = Icons.check_circle;
        color = Colors.green;
        break;
      case 'FAIL':
        icon = Icons.cancel;
        color = Colors.red;
        break;
      case 'POTENTIALLY_ELIGIBLE':
      case 'UNKNOWN':
      default:
        icon = Icons.help_outline;
        color = Colors.orange;
        break;
    }

    if (criterion.status == 'NOT_APPLICABLE') return const SizedBox.shrink();

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: Icon(icon, color: color, size: 32),
        title: Text(criterion.name, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text('Requirement: ${criterion.requiredValue ?? 'N/A'}'),
            Text('Your value: ${criterion.userValue ?? 'Not provided'}'),
            const SizedBox(height: 4),
            Text(criterion.reason, style: TextStyle(color: Colors.grey.shade700, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
