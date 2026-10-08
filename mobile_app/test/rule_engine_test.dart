import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/models/scheme.dart';
import 'package:mobile_app/models/user_profile.dart';
import 'package:mobile_app/services/api_service.dart';
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
        famhead: false,
        govschool: false,
        highered: false,
        hasCar: false,
        excessLand: false,
      );

      final schemes = ApiService.getFallbackSchemes();

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
  });
}
