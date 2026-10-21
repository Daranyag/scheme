import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/models/scheme.dart';
import 'package:mobile_app/models/user_profile.dart';
import 'package:mobile_app/services/rule_engine.dart';

void main() {
  group('Rule Engine Tests', () {
    test('65-year-old destitute widow with income 80,000 evaluation', () {
      final profile = UserProfile(
        age: 65,
        gender: 'F',
        familyIncome: 80000,
        marital: 'widowed',
        disability: 0,
        destitute: true,
        fixedAssetsBand: 'under ₹1 lakh',
        famhead: false,
        govschool: false,
        highered: false,
        hasCar: false,
        excessLand: false,
      );

      final file = File('assets/starter-schemes.json');
      final jsonStr = file.existsSync()
          ? file.readAsStringSync()
          : File('../server/data/starter-schemes.json').readAsStringSync();
      final List<dynamic> list = jsonDecode(jsonStr);
      final schemes = list.map((item) => Scheme.fromJson(item as Map<String, dynamic>)).toList();

      final eligibleSchemes = <String>[];
      final verifySchemes = <String>[];
      final notEligibleSchemes = <String>[];

      for (var scheme in schemes) {
        final eval = RuleEngine.evaluate(scheme, profile);
        if (eval.status == EligibilityStatus.eligible) {
          eligibleSchemes.add(scheme.name);
        } else if (eval.status == EligibilityStatus.possiblyEligibleVerify) {
          verifySchemes.add(scheme.name);
        } else {
          notEligibleSchemes.add(scheme.name);
        }
      }

      // Assertions for 65-year-old destitute widow
      expect(eligibleSchemes, contains('Destitute Widow Pension'));
      expect(eligibleSchemes, contains('Old Age Pension (IGNOAPS / TN)'));
      expect(eligibleSchemes, contains('CM Comprehensive Health Insurance (CMCHIS)'));
      expect(eligibleSchemes, contains('Vidiyal Payanam (Free Bus Travel)'));

      expect(verifySchemes, contains('Naan Mudhalvan'));

      expect(notEligibleSchemes, contains('Tamil Pudhalvan')); // Wrong gender
      expect(notEligibleSchemes, contains('Pudhumai Penn')); // Not in higher education / govschool
      expect(notEligibleSchemes, contains('Unmarried Poor Women Pension')); // Not single
    });

    test('Disqualifiers test - KMUT car & land disqualification', () {
      final eligibleWoman = UserProfile(
        age: 30,
        gender: 'F',
        familyIncome: 100000,
        marital: 'married',
        famhead: true,
        hasCar: false,
        excessLand: false,
      );

      final disqualifiedWoman = UserProfile(
        age: 30,
        gender: 'F',
        familyIncome: 100000,
        marital: 'married',
        famhead: true,
        hasCar: true, // Disqualified
        excessLand: false,
      );

      final kmutScheme = Scheme.fromJson({
        "name": "Kalaignar Magalir Urimai Thogai",
        "benefit": "₹1,000/month",
        "rules": { "gender": "F", "age": { "\$gte": 21 }, "famhead": true, "income": { "\$lt": 250000 } }
      });

      expect(RuleEngine.evaluate(kmutScheme, eligibleWoman).status, EligibilityStatus.eligible);
      expect(RuleEngine.evaluate(kmutScheme, disqualifiedWoman).status, EligibilityStatus.notEligible);
    });

    test('Income threshold strict comparison', () {
      final scheme = Scheme.fromJson({
        "name": "Income Test Scheme",
        "benefit": "Test",
        "rules": { "income": { "\$lt": 120000 } }
      });

      final profileBelow = UserProfile(familyIncome: 119999);
      final profileEqual = UserProfile(familyIncome: 120000);

      expect(RuleEngine.evaluate(scheme, profileBelow).status, EligibilityStatus.eligible);
      expect(RuleEngine.evaluate(scheme, profileEqual).status, EligibilityStatus.notEligible);
    });

    group('Kalaignar Magalir Urimai Thogai rule tests', () {
      final kmutScheme = Scheme.fromJson({
        "name": "Kalaignar Magalir Urimai Thogai",
        "benefit": "₹1,000/month",
        "rules": {
          "gender": "F",
          "age": { "\$gte": 21 },
          "rationCardHead": { "\$in": ["self", "spouse"] },
          "income": { "\$lt": 250000 },
          "govtEmployeeInFamily": false,
          "taxPayer": false,
          "fourWheeler": false
        }
      });

      test('age 20 -> not eligible', () {
        final profile = UserProfile(
          gender: 'F',
          age: 20,
          familyIncome: 100000,
          rationCardHead: 'spouse',
        );
        final eval = RuleEngine.evaluate(kmutScheme, profile);
        expect(eval.status, EligibilityStatus.notEligible);
        expect(eval.failedCriteria.any((c) => c.contains('Age must be at least 21 years')), isTrue);
      });

      test('age 21 -> eligible', () {
        final profile = UserProfile(
          gender: 'F',
          age: 21,
          familyIncome: 100000,
          rationCardHead: 'spouse',
        );
        final eval = RuleEngine.evaluate(kmutScheme, profile);
        expect(eval.status, EligibilityStatus.eligible);
        expect(eval.matchedCriteria.any((c) => c.contains('Age') && c.contains('21')), isTrue);
      });

      test('income 249,999 -> eligible', () {
        final profile = UserProfile(
          gender: 'F',
          age: 25,
          familyIncome: 249999,
          rationCardHead: 'self',
        );
        final eval = RuleEngine.evaluate(kmutScheme, profile);
        expect(eval.status, EligibilityStatus.eligible);
        expect(eval.matchedCriteria, contains('Income is below ₹250000 limit'));
      });

      test('income 250,000 -> not eligible', () {
        final profile = UserProfile(
          gender: 'F',
          age: 25,
          familyIncome: 250000,
          rationCardHead: 'self',
        );
        final eval = RuleEngine.evaluate(kmutScheme, profile);
        expect(eval.status, EligibilityStatus.notEligible);
        expect(eval.failedCriteria, contains('Annual family income must be below ₹250000'));
      });

      test('income missing -> possibly eligible / verify', () {
        final profile = UserProfile(
          gender: 'F',
          age: 25,
          familyIncome: null,
          rationCardHead: 'self',
        );
        final eval = RuleEngine.evaluate(kmutScheme, profile);
        expect(eval.status, EligibilityStatus.possiblyEligibleVerify);
        expect(eval.missingFields, contains('Annual family income'));
      });

      test('rationCardHead unknown -> possibly eligible / verify', () {
        final profile = UserProfile(
          gender: 'F',
          age: 25,
          familyIncome: 100000,
          rationCardHead: 'unknown',
        );
        final eval = RuleEngine.evaluate(kmutScheme, profile);
        expect(eval.status, EligibilityStatus.possiblyEligibleVerify);
        expect(eval.missingFields, contains('Ration card head'));
      });

      test('male -> not eligible', () {
        final profile = UserProfile(
          gender: 'M',
          age: 25,
          familyIncome: 100000,
          rationCardHead: 'self',
        );
        final eval = RuleEngine.evaluate(kmutScheme, profile);
        expect(eval.status, EligibilityStatus.notEligible);
        expect(eval.failedCriteria, contains('Gender requirement (Female) not met'));
      });

      test('My husband explanation shows exact text', () {
        final profile = UserProfile(
          gender: 'F',
          age: 30,
          familyIncome: 150000,
          rationCardHead: 'spouse',
        );
        final eval = RuleEngine.evaluate(kmutScheme, profile);
        expect(eval.status, EligibilityStatus.eligible);
        expect(
          eval.matchedCriteria,
          contains('Wife of the male head, who is treated as head for this scheme (confirm with the office)'),
        );
      });

      test('Profile (a): female, 40, married, income unanswered -> Kalaignar under Possibly eligible - verify', () {
        final profileA = UserProfile(
          gender: 'F',
          age: 40,
          marital: 'married',
        );
        final eval = RuleEngine.evaluate(kmutScheme, profileA);
        expect(eval.status, EligibilityStatus.possiblyEligibleVerify);
        expect(eval.missingFields, contains('Annual family income'));
      });

      test('Profile (b): same after answering My husband and ₹1 to 2.5 lakh -> moves to Eligible', () {
        final profileB = UserProfile(
          gender: 'F',
          age: 40,
          marital: 'married',
          rationCardHead: 'spouse',
          incomeRangeBand: '₹1 to 2.5 lakh',
        );
        final eval = RuleEngine.evaluate(kmutScheme, profileB);
        expect(eval.status, EligibilityStatus.eligible);
      });

      test('Profile (c): female, 19, college student, govt school -> Pudhumai Penn eligible', () {
        final pudhumaiScheme = Scheme.fromJson({
          "name": "Pudhumai Penn",
          "benefit": "₹1,000/month",
          "rules": {
            "gender": "F",
            "govschool": true,
            "highered": true,
          }
        });
        final profileC = UserProfile(
          gender: 'F',
          age: 19,
          role: 'College student',
          govschool: true,
          highered: true,
        );
        final eval = RuleEngine.evaluate(pudhumaiScheme, profileC);
        expect(eval.status, EligibilityStatus.eligible);
      });

      test('Graduated profile -> Post-Matric and student scholarships not eligible', () {
        final postMatricScheme = Scheme.fromJson({
          "name": "Post-Matric Scholarship for SC/ST",
          "category": "Scholarships (SC/ST/BC/MBC/Minority)",
          "benefit": "100% compulsory non-refundable fees",
          "rules": {
            "communityCategory": "SC",
            "courseLevel": "UG",
            "annualIncome": {"\$lte": 250000}
          }
        });
        final gradProfile = UserProfile(
          gender: 'F',
          age: 23,
          community: 'SC',
          familyIncome: 150000,
          role: 'Completed studies',
          highestQual: 'Graduate',
        );
        final eval = RuleEngine.evaluate(postMatricScheme, gradProfile);
        expect(eval.status, EligibilityStatus.notEligible);
        expect(eval.failedCriteria.any((f) => f.contains('graduated / completed studies')), isTrue);
      });

      test('Non-SC/ST community profile -> Post-Matric SC/ST not eligible', () {
        final postMatricScheme = Scheme.fromJson({
          "name": "Post-Matric Scholarship for SC/ST",
          "category": "Scholarships (SC/ST/BC/MBC/Minority)",
          "benefit": "100% compulsory non-refundable fees",
          "rules": {
            "communityCategory": "SC",
            "courseLevel": "UG",
            "annualIncome": {"\$lte": 250000}
          }
        });
        final bcStudentProfile = UserProfile(
          gender: 'F',
          age: 20,
          community: 'BC',
          familyIncome: 150000,
          role: 'College student',
          courseType: 'UG',
        );
        final eval = RuleEngine.evaluate(postMatricScheme, bcStudentProfile);
        expect(eval.status, EligibilityStatus.notEligible);
        expect(eval.failedCriteria.any((f) => f.contains('Community category') || f.contains('SC/ST')), isTrue);
      });

      test('Eligible SC student -> Post-Matric SC/ST eligible', () {
        final postMatricScheme = Scheme.fromJson({
          "name": "Post-Matric Scholarship for SC/ST",
          "category": "Scholarships (SC/ST/BC/MBC/Minority)",
          "benefit": "100% compulsory non-refundable fees",
          "rules": {
            "communityCategory": "SC",
            "courseLevel": "UG",
            "annualIncome": {"\$lte": 250000}
          }
        });
        final scStudentProfile = UserProfile(
          gender: 'F',
          age: 20,
          community: 'SC',
          familyIncome: 180000,
          role: 'College student',
          courseType: 'UG',
        );
        final eval = RuleEngine.evaluate(postMatricScheme, scStudentProfile);
        expect(eval.status, EligibilityStatus.eligible);
      });
    });
  });
}
