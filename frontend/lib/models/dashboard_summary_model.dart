class DashboardSummaryModel {
  final int totalSchemes;
  final int activeSchemes;
  final int categoriesCount;
  final int sourcesCount;
  final DateTime? lastUpdatedAt;

  DashboardSummaryModel({
    required this.totalSchemes,
    required this.activeSchemes,
    required this.categoriesCount,
    required this.sourcesCount,
    this.lastUpdatedAt,
  });

  factory DashboardSummaryModel.fromJson(Map<String, dynamic> json) {
    return DashboardSummaryModel(
      totalSchemes: json['totalSchemes'] ?? 0,
      activeSchemes: json['activeSchemes'] ?? 0,
      categoriesCount: json['categories'] ?? 0,
      sourcesCount: json['sources'] ?? 0,
      lastUpdatedAt: json['lastUpdatedAt'] != null ? DateTime.tryParse(json['lastUpdatedAt']) : null,
    );
  }
}
