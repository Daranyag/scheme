class SchemeLink {
  final String title;
  final String url;
  final String linkStatus;
  final bool isWorking;
  final String checkedAt;
  final String reason;

  bool get hasTlsError => linkStatus == 'tls_error' || linkStatus == 'tls_expired' || linkStatus == 'tls_other';
  bool get is404 => linkStatus == 'http_404' || linkStatus == '404';

  SchemeLink({
    required this.title,
    required this.url,
    this.linkStatus = 'ok',
    this.isWorking = true,
    this.checkedAt = '',
    this.reason = '',
  });

  factory SchemeLink.fromList(dynamic list) {
    if (list is List && list.isNotEmpty) {
      final title = list[0].toString();
      final url = list.length > 1 ? list[1].toString() : '';
      return SchemeLink(title: title, url: url);
    }
    return SchemeLink(title: 'Official Link', url: list.toString());
  }

  factory SchemeLink.fromJson(Map<String, dynamic> json) {
    final status = json['linkStatus']?.toString() ?? (json['working'] == false ? '404' : 'ok');
    return SchemeLink(
      title: json['title'] ?? json['sourceName'] ?? 'Official Link',
      url: json['url'] ?? json['link'] ?? '',
      linkStatus: status,
      isWorking: json['working'] != false && status != 'tls_error' && status != '404' && status != 'timeout',
      checkedAt: json['checkedAt']?.toString() ?? json['verifiedAt']?.toString() ?? '',
      reason: json['reason']?.toString() ?? '',
    );
  }
}

class Scheme {
  final String id;
  final String name;
  final String nameTamil;
  final String category;
  final String benefit;
  final String status;
  final Map<String, dynamic> rules;
  final List<String> unmappedCriteria;
  final List<String> requiredDocuments;
  final List<String> howToApply;
  final List<SchemeLink> officialLinks;
  final bool verify;
  final String verificationLevel;
  final String verificationStatus;
  final String verificationReason;
  final String pageUsed;
  final String lastVerified;
  final bool changedRecently;
  final List<Map<String, dynamic>> changeHistory;

  // Aliases for backwards compatibility
  List<String> get also => unmappedCriteria;
  List<String> get docs => requiredDocuments;
  List<String> get steps => howToApply;
  List<SchemeLink> get links => officialLinks;

  Scheme({
    required this.id,
    required this.name,
    this.nameTamil = '',
    this.category = 'General',
    required this.benefit,
    this.status = 'ACTIVE',
    required this.rules,
    required this.unmappedCriteria,
    required this.requiredDocuments,
    required this.howToApply,
    required this.officialLinks,
    required this.verify,
    this.verificationLevel = 'secondary-source',
    this.verificationStatus = 'unreachable',
    this.verificationReason = 'no candidate link',
    this.pageUsed = '',
    this.lastVerified = '',
    this.changedRecently = false,
    this.changeHistory = const [],
  });

  factory Scheme.fromJson(Map<String, dynamic> json) {
    String parsedName = '';
    if (json['name'] != null && json['name'].toString().trim().isNotEmpty) {
      final nameStr = json['name'].toString().trim();
      if (!nameStr.startsWith('Government Scheme')) {
        parsedName = nameStr;
      }
    }
    if (parsedName.isEmpty && json['schemeName'] != null && json['schemeName'].toString().trim().isNotEmpty) {
      final nameStr = json['schemeName'].toString().trim();
      if (!nameStr.startsWith('Government Scheme')) {
        parsedName = nameStr;
      }
    }

    // Parse links
    List<SchemeLink> parsedLinks = [];
    if (json['officialLinks'] is List && (json['officialLinks'] as List).isNotEmpty) {
      for (var item in (json['officialLinks'] as List)) {
        if (item is List) {
          parsedLinks.add(SchemeLink.fromList(item));
        } else if (item is Map<String, dynamic>) {
          parsedLinks.add(SchemeLink.fromJson(item));
        }
      }
    } else if (json['verifiedLinks'] is List && (json['verifiedLinks'] as List).isNotEmpty) {
      for (var item in (json['verifiedLinks'] as List)) {
        if (item is Map<String, dynamic>) {
          parsedLinks.add(SchemeLink.fromJson(item));
        }
      }
    } else if (json['links'] is List) {
      for (var item in (json['links'] as List)) {
        if (item is List) {
          parsedLinks.add(SchemeLink.fromList(item));
        } else if (item is Map<String, dynamic>) {
          parsedLinks.add(SchemeLink.fromJson(item));
        }
      }
    }

    List<String> criteria = [];
    if (json['unmappedCriteria'] is List && (json['unmappedCriteria'] as List).isNotEmpty) {
      criteria = List<String>.from((json['unmappedCriteria'] as List).map((e) => e.toString()));
    } else if (json['also'] is List && (json['also'] as List).isNotEmpty) {
      criteria = List<String>.from((json['also'] as List).map((e) => e.toString()));
    }

    List<String> documents = [];
    if (json['requiredDocuments'] is List && (json['requiredDocuments'] as List).isNotEmpty) {
      documents = List<String>.from((json['requiredDocuments'] as List).map((e) => e.toString()));
    } else if (json['docs'] is List && (json['docs'] as List).isNotEmpty) {
      documents = List<String>.from((json['docs'] as List).map((e) => e.toString()));
    } else if (json['documents'] is List && (json['documents'] as List).isNotEmpty) {
      documents = List<String>.from((json['documents'] as List).map((e) => e.toString()));
    }

    List<String> applySteps = [];
    if (json['howToApply'] is List && (json['howToApply'] as List).isNotEmpty) {
      applySteps = List<String>.from((json['howToApply'] as List).map((e) => e.toString()));
    } else if (json['steps'] is List && (json['steps'] as List).isNotEmpty) {
      applySteps = List<String>.from((json['steps'] as List).map((e) => e.toString()));
    } else if (json['applicationSteps'] is List && (json['applicationSteps'] as List).isNotEmpty) {
      applySteps = List<String>.from((json['applicationSteps'] as List).map((e) => e.toString()));
    }

    List<Map<String, dynamic>> history = [];
    if (json['changeHistory'] is List) {
      history = (json['changeHistory'] as List)
          .whereType<Map<String, dynamic>>()
          .toList();
    }

    final level = json['verificationLevel']?.toString() ?? 'secondary-source';
    final status = json['verificationStatus']?.toString() ??
        (level == 'official' ? 'verified' : (level == 'differs' ? 'differs' : 'unreachable'));

    return Scheme(
      id: json['_id']?.toString() ?? json['schemeId']?.toString() ?? '',
      name: parsedName,
      nameTamil: json['nameTamil']?.toString() ?? '',
      category: json['category']?.toString() ?? json['department']?.toString() ?? 'General',
      benefit: json['benefit'] ?? json['description'] ?? '',
      status: json['status']?.toString() ?? 'ACTIVE',
      rules: json['rules'] is Map ? Map<String, dynamic>.from(json['rules']) : {},
      unmappedCriteria: criteria,
      requiredDocuments: documents,
      howToApply: applySteps,
      officialLinks: parsedLinks,
      verify: json['verify'] == true,
      verificationLevel: level,
      verificationStatus: status,
      verificationReason: json['verificationReason']?.toString() ?? 'no candidate link',
      pageUsed: json['pageUsed']?.toString() ?? '',
      lastVerified: json['lastVerified']?.toString() ?? '',
      changedRecently: json['changedRecently'] == true,
      changeHistory: history,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'nameTamil': nameTamil,
      'category': category,
      'benefit': benefit,
      'status': status,
      'rules': rules,
      'unmappedCriteria': unmappedCriteria,
      'also': also,
      'requiredDocuments': requiredDocuments,
      'docs': docs,
      'howToApply': howToApply,
      'steps': steps,
      'officialLinks': officialLinks.map((l) => [l.title, l.url]).toList(),
      'links': officialLinks.map((l) => [l.title, l.url]).toList(),
      'verify': verify,
      'verificationLevel': verificationLevel,
      'verificationStatus': verificationStatus,
      'verificationReason': verificationReason,
      'pageUsed': pageUsed,
      'lastVerified': lastVerified,
      'changedRecently': changedRecently,
      'changeHistory': changeHistory,
    };
  }
}
