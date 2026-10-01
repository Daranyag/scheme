class SchemeModel {
  final String id;
  final String schemeId;
  final String schemeName;
  final String shortDescription;
  final String description;
  final String department;
  final String category;
  final String benefit;
  final String eligibility;
  final String ageLimit;
  final String incomeLimit;
  final List<String> documents;
  final String applicationMethod;
  final String officialUrl;
  final String officialApplicationUrl;
  final String sourceName;
  final String sourceType;
  final String state;
  final DateTime? lastFetchedAt;
  final DateTime? lastVerifiedAt;
  final bool isActive;

  SchemeModel({
    required this.id,
    required this.schemeId,
    required this.schemeName,
    this.shortDescription = '',
    this.description = '',
    this.department = '',
    this.category = '',
    this.benefit = '',
    this.eligibility = '',
    this.ageLimit = '',
    this.incomeLimit = '',
    this.documents = const [],
    this.applicationMethod = '',
    this.officialUrl = '',
    this.officialApplicationUrl = '',
    required this.sourceName,
    required this.sourceType,
    required this.state,
    this.lastFetchedAt,
    this.lastVerifiedAt,
    this.isActive = true,
  });

  factory SchemeModel.fromJson(Map<String, dynamic> json) {
    return SchemeModel(
      id: json['_id'] ?? '',
      schemeId: json['schemeId'] ?? '',
      schemeName: json['schemeName'] ?? '',
      shortDescription: json['shortDescription'] ?? '',
      description: json['description'] ?? '',
      department: json['department'] ?? '',
      category: json['category'] ?? '',
      benefit: json['benefit'] ?? '',
      eligibility: json['eligibility'] ?? '',
      ageLimit: json['ageLimit'] ?? '',
      incomeLimit: json['incomeLimit'] ?? '',
      documents: List<String>.from(json['documents'] ?? []),
      applicationMethod: json['applicationMethod'] ?? '',
      officialUrl: json['officialSourceUrl'] ?? json['officialUrl'] ?? '',
      officialApplicationUrl: json['officialApplicationUrl'] ?? '',
      sourceName: json['sourceName'] ?? '',
      sourceType: json['sourceType'] ?? '',
      state: json['state'] ?? '',
      lastFetchedAt: json['lastFetchedAt'] != null ? DateTime.tryParse(json['lastFetchedAt']) : null,
      lastVerifiedAt: json['lastVerifiedAt'] != null ? DateTime.tryParse(json['lastVerifiedAt']) : null,
      isActive: json['isActive'] ?? true,
    );
  }
}
