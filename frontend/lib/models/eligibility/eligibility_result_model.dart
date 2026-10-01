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
