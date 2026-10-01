const fs = require('fs');
const path = require('path');

const write = (filePath, content) => {
  const fullPath = path.resolve(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log('Created/Updated:', filePath);
};

const updateFile = (filePath, search, replace) => {
  const fullPath = path.resolve(__dirname, filePath);
  if (!fs.existsSync(fullPath)) return;
  let content = fs.readFileSync(fullPath, 'utf8');
  content = content.replace(search, replace);
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log('Updated:', filePath);
};

// ================= BACKEND ================= //

write('backend/src/services/eligibility/eligibilityRules.js', `
const evaluateAge = (userAge, schemeAgeCriteria) => {
  if (!schemeAgeCriteria || (!schemeAgeCriteria.min && !schemeAgeCriteria.max)) {
    return { status: 'UNKNOWN', reason: 'Official age requirement not published.' };
  }
  if (userAge === undefined || userAge === null) {
    return { status: 'POTENTIALLY_ELIGIBLE', reason: 'Your age is missing from profile.' };
  }
  
  if (schemeAgeCriteria.min && userAge < schemeAgeCriteria.min) {
    return { status: 'FAIL', reason: \`Requires minimum age of \${schemeAgeCriteria.min}.\` };
  }
  if (schemeAgeCriteria.max && userAge > schemeAgeCriteria.max) {
    return { status: 'FAIL', reason: \`Requires maximum age of \${schemeAgeCriteria.max}.\` };
  }
  return { status: 'PASS', reason: 'Age meets the published requirement.' };
};

const evaluateIncome = (userIncome, schemeIncomeCriteria) => {
  if (!schemeIncomeCriteria || schemeIncomeCriteria.max === undefined) {
    return { status: 'NOT_APPLICABLE', reason: 'No income limit published.' };
  }
  if (userIncome === undefined || userIncome === null) {
    return { status: 'POTENTIALLY_ELIGIBLE', reason: 'Your income is missing from profile.' };
  }
  if (userIncome > schemeIncomeCriteria.max) {
    return { status: 'FAIL', reason: \`Income exceeds the limit of ₹\${schemeIncomeCriteria.max}.\` };
  }
  return { status: 'PASS', reason: 'Income is within published limits.' };
};

const evaluateDisability = (userDisability, schemeDisabilityReq) => {
  if (!schemeDisabilityReq) {
    return { status: 'NOT_APPLICABLE', reason: 'No specific disability requirement published.' };
  }
  if (!userDisability) {
    return { status: 'POTENTIALLY_ELIGIBLE', reason: 'Disability status missing from profile.' };
  }
  if (schemeDisabilityReq === true && userDisability !== 'Yes') {
    return { status: 'FAIL', reason: 'Scheme requires differently abled status.' };
  }
  return { status: 'PASS', reason: 'Disability requirement met.' };
};

const evaluateState = (userState) => {
  if (userState !== 'Tamil Nadu') {
    return { status: 'FAIL', reason: 'Only residents of Tamil Nadu are eligible.' };
  }
  return { status: 'PASS', reason: 'Tamil Nadu residence verified.' };
};

module.exports = { evaluateAge, evaluateIncome, evaluateDisability, evaluateState };
`);

write('backend/src/services/eligibility/eligibilityEvaluator.js', `
const rules = require('./eligibilityRules');

const evaluateAll = (user, scheme) => {
  const criteria = [];
  
  // State
  const stateEval = rules.evaluateState(user.state);
  criteria.push({ name: 'Residence', status: stateEval.status, userValue: user.state, requiredValue: 'Tamil Nadu', reason: stateEval.reason });

  // Age
  const ageReq = scheme.ageLimit || null;
  const ageEval = rules.evaluateAge(user.age, ageReq);
  const ageReqStr = ageReq ? (ageReq.min ? \`\${ageReq.min}+\` : \`Below \${ageReq.max}\`) : 'Unknown';
  criteria.push({ name: 'Age', status: ageEval.status, userValue: user.age, requiredValue: ageReqStr, reason: ageEval.reason });

  // Income
  const incReq = scheme.incomeLimit ? { max: scheme.incomeLimit } : null;
  const incEval = rules.evaluateIncome(user.income, incReq);
  const incReqStr = incReq ? \`Up to ₹\${incReq.max}\` : 'None';
  if (incEval.status !== 'NOT_APPLICABLE') {
    criteria.push({ name: 'Income', status: incEval.status, userValue: user.income ? \`₹\${user.income}\` : null, requiredValue: incReqStr, reason: incEval.reason });
  }

  // Disability
  const disReq = scheme.disabilityEligibility;
  const disEval = rules.evaluateDisability(user.disabilityStatus, disReq);
  if (disReq || disEval.status !== 'NOT_APPLICABLE') {
    criteria.push({ name: 'Disability Status', status: disEval.status, userValue: user.disabilityStatus, requiredValue: disReq ? 'Required' : 'Not required', reason: disEval.reason });
  }

  return criteria;
};

module.exports = { evaluateAll };
`);

write('backend/src/services/eligibility/eligibilityResultBuilder.js', `
const buildResult = (scheme, criteria) => {
  let status = 'ELIGIBLE';
  let hasUnknown = false;
  
  for (const c of criteria) {
    if (c.status === 'FAIL') {
      status = 'NOT_ELIGIBLE';
      break;
    }
    if (c.status === 'UNKNOWN' || c.status === 'POTENTIALLY_ELIGIBLE') {
      hasUnknown = true;
    }
  }

  if (status !== 'NOT_ELIGIBLE' && hasUnknown) {
    status = 'POTENTIALLY_ELIGIBLE';
  }
  
  let summary = '';
  if (status === 'ELIGIBLE') summary = 'You appear to meet the published eligibility criteria.';
  else if (status === 'POTENTIALLY_ELIGIBLE') summary = 'You may be eligible, but some information is missing or unknown.';
  else summary = 'Based on the information in your profile, you do not currently meet one or more published criteria.';

  let evaluationConfidence = 'HIGH';
  if (hasUnknown) evaluationConfidence = 'MEDIUM';
  if (criteria.filter(c => c.status === 'UNKNOWN').length > 2) evaluationConfidence = 'LOW';
  
  if (evaluationConfidence === 'LOW' && status !== 'NOT_ELIGIBLE') {
    status = 'INSUFFICIENT_INFORMATION';
    summary = 'There is not enough information to determine eligibility automatically. Please check the official Tamil Nadu Government source.';
  }

  return {
    schemeId: scheme._id,
    schemeName: scheme.schemeName,
    status,
    summary,
    criteria,
    documents: scheme.documents || [],
    officialSourceUrl: scheme.officialSourceUrl,
    officialApplicationUrl: scheme.officialApplicationUrl,
    lastVerifiedAt: scheme.lastVerifiedAt || new Date().toISOString(),
    evaluationConfidence
  };
};

module.exports = { buildResult };
`);

write('backend/src/services/eligibility/eligibilityEngine.js', `
const { evaluateAll } = require('./eligibilityEvaluator');
const { buildResult } = require('./eligibilityResultBuilder');

const checkEligibility = (user, scheme) => {
  const criteria = evaluateAll(user, scheme);
  return buildResult(scheme, criteria);
};

module.exports = { checkEligibility };
`);

write('backend/src/controllers/eligibilityController.js', `
const User = require('../models/User');
const Scheme = require('../models/Scheme');
const eligibilityEngine = require('../services/eligibility/eligibilityEngine');

const checkEligibility = async (req, res) => {
  try {
    const { schemeId } = req.body;
    if (!schemeId) return res.status(400).json({ success: false, message: 'schemeId is required' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const scheme = await Scheme.findById(schemeId);
    if (!scheme) return res.status(404).json({ success: false, message: 'Scheme not found' });

    if (scheme.state && scheme.state !== 'Tamil Nadu') {
      return res.status(400).json({ success: false, message: 'Only Tamil Nadu schemes are supported.' });
    }

    const result = eligibilityEngine.checkEligibility(user, scheme);

    res.json({
      success: true,
      message: 'Eligibility calculated successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { checkEligibility };
`);

write('backend/src/routes/eligibilityRoutes.js', `
const express = require('express');
const router = express.Router();
const { checkEligibility } = require('../controllers/eligibilityController');
const { protect } = require('../middleware/authMiddleware');

router.post('/check', protect, checkEligibility);

module.exports = router;
`);

// Add route to server.js
updateFile('backend/server.js', 
  "const dashboardRoutes = require('./src/routes/dashboardRoutes');", 
  "const dashboardRoutes = require('./src/routes/dashboardRoutes');\nconst eligibilityRoutes = require('./src/routes/eligibilityRoutes');"
);
updateFile('backend/server.js', 
  "app.use('/api/dashboard', dashboardRoutes);", 
  "app.use('/api/dashboard', dashboardRoutes);\napp.use('/api/eligibility', eligibilityRoutes);"
);


// Update Scheme model with new criteria fields
updateFile('backend/src/models/Scheme.js',
  "eligibility: { type: String },",
  "eligibility: { type: String },\n    ageLimit: { min: Number, max: Number },\n    incomeLimit: Number,\n    disabilityEligibility: Boolean,\n    documents: [String],"
);


// ================= FRONTEND ================= //

write('frontend/lib/models/eligibility/eligibility_result_model.dart', `
class EligibilityResultModel {
  final String schemeId;
  final String schemeName;
  final String status;
  final String summary;
  final List<EligibilityCriterionModel> criteria;
  final List<String> documents;
  final String? officialSourceUrl;
  final String? officialApplicationUrl;
  final String? lastVerifiedAt;
  final String evaluationConfidence;

  EligibilityResultModel({
    required this.schemeId,
    required this.schemeName,
    required this.status,
    required this.summary,
    required this.criteria,
    required this.documents,
    this.officialSourceUrl,
    this.officialApplicationUrl,
    this.lastVerifiedAt,
    required this.evaluationConfidence,
  });

  factory EligibilityResultModel.fromJson(Map<String, dynamic> json) {
    return EligibilityResultModel(
      schemeId: json['schemeId'] ?? '',
      schemeName: json['schemeName'] ?? '',
      status: json['status'] ?? 'UNKNOWN',
      summary: json['summary'] ?? '',
      criteria: (json['criteria'] as List?)?.map((x) => EligibilityCriterionModel.fromJson(x)).toList() ?? [],
      documents: List<String>.from(json['documents'] ?? []),
      officialSourceUrl: json['officialSourceUrl'],
      officialApplicationUrl: json['officialApplicationUrl'],
      lastVerifiedAt: json['lastVerifiedAt'],
      evaluationConfidence: json['evaluationConfidence'] ?? 'LOW',
    );
  }
}

class EligibilityCriterionModel {
  final String name;
  final String status;
  final dynamic userValue;
  final dynamic requiredValue;
  final String reason;

  EligibilityCriterionModel({
    required this.name,
    required this.status,
    this.userValue,
    this.requiredValue,
    required this.reason,
  });

  factory EligibilityCriterionModel.fromJson(Map<String, dynamic> json) {
    return EligibilityCriterionModel(
      name: json['name'] ?? '',
      status: json['status'] ?? 'UNKNOWN',
      userValue: json['userValue'],
      requiredValue: json['requiredValue'],
      reason: json['reason'] ?? '',
    );
  }
}
`);

write('frontend/lib/services/eligibility_service.dart', `
import 'package:dio/dio.dart';
import '../models/eligibility/eligibility_result_model.dart';
import 'api_service.dart';

class EligibilityService {
  final ApiService _apiService = ApiService();

  Future<EligibilityResultModel> checkEligibility(String schemeId) async {
    try {
      final response = await _apiService.client.post('/eligibility/check', data: {'schemeId': schemeId});
      if (response.data['success']) {
        return EligibilityResultModel.fromJson(response.data['data']);
      } else {
        throw Exception(response.data['message']);
      }
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to check eligibility');
    }
  }
}
`);

write('frontend/lib/controllers/eligibility_controller.dart', `
import 'package:flutter/material.dart';
import '../models/eligibility/eligibility_result_model.dart';
import '../services/eligibility_service.dart';

class EligibilityController extends ChangeNotifier {
  final EligibilityService _eligibilityService = EligibilityService();
  
  bool _isLoading = false;
  EligibilityResultModel? _result;
  String? _errorMessage;

  bool get isLoading => _isLoading;
  EligibilityResultModel? get result => _result;
  String? get errorMessage => _errorMessage;

  Future<void> checkEligibility(String schemeId) async {
    _isLoading = true;
    _errorMessage = null;
    _result = null;
    notifyListeners();

    try {
      _result = await _eligibilityService.checkEligibility(schemeId);
    } catch (e) {
      _errorMessage = e.toString().replaceAll('Exception: ', '');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void clearResult() {
    _result = null;
    _errorMessage = null;
    notifyListeners();
  }
}
`);

write('frontend/lib/widgets/eligibility_criterion_card.dart', `
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
            Text('Requirement: \${criterion.requiredValue ?? 'N/A'}'),
            Text('Your value: \${criterion.userValue ?? 'Not provided'}'),
            const SizedBox(height: 4),
            Text(criterion.reason, style: TextStyle(color: Colors.grey.shade700, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
`);

write('frontend/lib/views/eligibility/eligibility_view.dart', `
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
                          Text('Your Result: \${_getStatusText(result.status)}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: _getStatusColor(result.status))),
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
                Center(child: Text('Last verified: \${result.lastVerifiedAt ?? 'Date unavailable'}', style: const TextStyle(fontSize: 12, color: Colors.grey))),
              ],
            ),
          );
        },
      ),
    );
  }
}
`);

// Add to app_routes.dart
updateFile('frontend/lib/app/routes/app_routes.dart',
  "import '../../views/schemes/scheme_detail_view.dart';",
  "import '../../views/schemes/scheme_detail_view.dart';\nimport '../../views/eligibility/eligibility_view.dart';"
);
updateFile('frontend/lib/app/routes/app_routes.dart',
  "path: '/schemes/:id',",
  "path: '/eligibility/:id',\n        builder: (context, state) => EligibilityView(schemeId: state.pathParameters['id']!),\n      ),\n      GoRoute(\n        path: '/schemes/:id',"
);

// Add to app.dart Providers
updateFile('frontend/lib/app/app.dart',
  "import '../controllers/dashboard_controller.dart';",
  "import '../controllers/dashboard_controller.dart';\nimport '../controllers/eligibility_controller.dart';"
);
updateFile('frontend/lib/app/app.dart',
  "ChangeNotifierProvider(create: (_) => DashboardController()),",
  "ChangeNotifierProvider(create: (_) => DashboardController()),\n        ChangeNotifierProvider(create: (_) => EligibilityController()),"
);

// Add to scheme_detail_view.dart
updateFile('frontend/lib/views/schemes/scheme_detail_view.dart',
  "// Details Tab",
  "SizedBox(width: double.infinity, child: ElevatedButton(onPressed: () => context.push('/eligibility/\${scheme.id}'), child: const Text('Check My Eligibility'))),\n                  const SizedBox(height: 16),\n                  // Details Tab"
);

console.log("Module 5 completely generated!");
