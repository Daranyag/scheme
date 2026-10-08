import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/models/scheme.dart';
import 'package:mobile_app/models/user_profile.dart';
import 'package:mobile_app/services/rule_engine.dart';

void main() {
  late List<Scheme> allSchemes;

  setUpAll(() {
    final file = File('../server/data/starter-schemes.json');
    final jsonString = file.readAsStringSync();
    final List<dynamic> list = jsonDecode(jsonString);
    allSchemes = list.map((item) => Scheme.fromJson(item)).toList();
  });

  void evaluateAndPrintDashboard(String label, UserProfile profile) {
    print('\n==================================================');
    print('PROFILE: $label');
    print('Completeness: ${profile.calculateCompletenessPercent()}%');
    print('--------------------------------------------------');

    final eligible = <Scheme>[];
    final possiblyEligible = <Map<String, dynamic>>[];
    final notEligible = <Map<String, dynamic>>[];

    for (final s in allSchemes) {
      final res = RuleEngine.evaluate(s, profile);
      if (res.status == EligibilityStatus.eligible) {
        eligible.add(s);
      } else if (res.status == EligibilityStatus.possiblyEligibleVerify) {
        possiblyEligible.add({
          'scheme': s,
          'reason': res.reason,
          'missing': res.missingFields,
        });
      } else {
        notEligible.add({
          'scheme': s,
          'reason': res.reason,
        });
      }
    }

    print('🟢 ELIGIBLE SCHEMES (${eligible.length}):');
    for (final s in eligible) {
      print('  • ${s.name} - ${s.benefit}');
    }

    print('\n🟡 POSSIBLY ELIGIBLE - VERIFY (${possiblyEligible.length}):');
    for (final item in possiblyEligible) {
      final Scheme s = item['scheme'];
      final List<String> missing = item['missing'];
      final missingText = missing.isNotEmpty ? ' [Answer ${missing.length} more question(s) to confirm]' : '';
      print('  • ${s.name}: ${item['reason']}$missingText');
    }

    print('\n🔴 NOT ELIGIBLE (${notEligible.length}):');
    for (final item in notEligible) {
      final Scheme s = item['scheme'];
      print('  • ${s.name}: ${item['reason']}');
    }
  }

  test('Evaluate Profiles (a) through (f)', () {
    // (a) 65-year-old destitute widow with income 80,000 and half questions skipped
    final profileA = UserProfile(
      age: 65,
      gender: 'Female',
      marital: 'Widowed',
      destitute: true,
      familyIncome: 80000,
    );
    evaluateAndPrintDashboard('(a) 65-year-old destitute widow with income 80,000 (half skipped)', profileA);

    // (b) Woman head of family with a government employee in family
    final profileB = UserProfile(
      age: 35,
      gender: 'Female',
      marital: 'Married',
      famhead: true,
      govtEmployeeInFamily: true,
      familyIncome: 120000,
      taxPayer: false,
      hasCar: false,
    );
    evaluateAndPrintDashboard('(b) Woman head of family with a government employee in family', profileB);

    // (c) Retired government employee with a pension
    final profileC = UserProfile(
      age: 65,
      gender: 'Female',
      marital: 'Widowed',
      workStatus: 'Retired',
      retiredFrom: 'Government',
      receivesPension: true,
      pensionAmount: 15000,
      familyIncome: 180000,
    );
    evaluateAndPrintDashboard('(c) Retired government employee with a pension', profileC);

    // (d1) College student (UG, government school background)
    final profileD1 = UserProfile(
      age: 19,
      gender: 'Female',
      marital: 'Unmarried',
      role: 'College student',
      courseType: 'UG',
      institutionType: 'Government',
      govschool: true,
      firstGraduate: true,
    );
    evaluateAndPrintDashboard('(d1) College student (UG, government school background)', profileD1);

    // (d2) School student
    final profileD2 = UserProfile(
      age: 14,
      gender: 'Male',
      marital: 'Unmarried',
      role: 'School student',
      classStudied: '9',
      institutionType: 'Government',
      govschool: true,
    );
    evaluateAndPrintDashboard('(d2) School student (Class 9 Govt School)', profileD2);

    // (e) Unemployed woman with other income entered
    final profileE = UserProfile(
      age: 40,
      gender: 'Female',
      marital: 'Married',
      workStatus: 'Unemployed',
      otherIncome: 45000,
      familyIncome: 45000,
      expenseSources: ['Spouse\'s income', 'Rent'],
    );
    evaluateAndPrintDashboard('(e) Unemployed woman with other income entered', profileE);

    // (f) User who fills only age and gender
    final profileF = UserProfile(
      age: 28,
      gender: 'Female',
    );
    evaluateAndPrintDashboard('(f) User who fills only age and gender', profileF);
  });
}
