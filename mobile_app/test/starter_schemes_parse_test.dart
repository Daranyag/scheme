import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/models/scheme.dart';

void main() {
  test('Parses every record in starter-schemes.json with Dart Scheme model', () {
    final file = File('../server/data/starter-schemes.json');
    expect(file.existsSync(), isTrue, reason: 'starter-schemes.json must exist');

    final jsonString = file.readAsStringSync();
    final List<dynamic> rawList = jsonDecode(jsonString);

    expect(rawList.length, greaterThanOrEqualTo(11));

    for (var i = 0; i < rawList.length; i++) {
      final map = rawList[i] as Map<String, dynamic>;
      final scheme = Scheme.fromJson(map);

      expect(scheme.name, isNotEmpty, reason: 'Scheme $i must have a non-empty name');
      expect(scheme.name.startsWith('Government Scheme'), isFalse, reason: 'Scheme $i name cannot be fallback ID');
      expect(scheme.benefit, isNotEmpty, reason: 'Scheme $i must have non-empty benefit');
      expect(scheme.rules, isNotNull, reason: 'Scheme $i must have rules object');

      // Documents, steps and links should be parsed into non-null lists
      expect(scheme.requiredDocuments, isNotNull);
      expect(scheme.docs, isNotNull);
      expect(scheme.howToApply, isNotNull);
      expect(scheme.steps, isNotNull);
      expect(scheme.officialLinks, isNotNull);
      expect(scheme.links, isNotNull);
    }
  });
}
