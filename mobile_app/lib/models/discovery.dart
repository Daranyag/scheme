class Discovery {
  final String id;
  final String name;
  final String nameTamil;
  final String benefit;
  final String domain;
  final String sourceUrl;
  final String confidence; // 'high' or 'medium'
  final String eligibilityStatus; // 'eligible' or 'possibly_eligible'
  final String lastChecked;
  final bool seen;
  final bool notRelevant;
  final String extractedBy;
  final int quotedFactsCount;

  Discovery({
    required this.id,
    required this.name,
    this.nameTamil = '',
    required this.benefit,
    required this.domain,
    required this.sourceUrl,
    required this.confidence,
    required this.eligibilityStatus,
    required this.lastChecked,
    this.seen = false,
    this.notRelevant = false,
    this.extractedBy = 'rules',
    this.quotedFactsCount = 0,
  });

  factory Discovery.fromJson(Map<String, dynamic> json) {
    return Discovery(
      id: json['_id'] ?? json['id'] ?? '',
      name: json['name'] ?? '',
      nameTamil: json['nameTamil'] ?? '',
      benefit: json['benefit'] ?? '',
      domain: json['domain'] ?? '',
      sourceUrl: json['sourceUrl'] ?? '',
      confidence: json['confidence'] ?? 'medium',
      eligibilityStatus: json['eligibilityStatus'] ?? 'possibly_eligible',
      lastChecked: json['lastChecked'] != null
          ? json['lastChecked'].toString().split('T')[0]
          : 'Recently',
      seen: json['seen'] ?? false,
      notRelevant: json['notRelevant'] ?? false,
      extractedBy: json['extractedBy'] ?? 'rules',
      quotedFactsCount: json['quotedFactsCount'] ?? 0,
    );
  }
}
