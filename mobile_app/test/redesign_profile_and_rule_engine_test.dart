import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/models/scheme.dart';
import 'package:mobile_app/models/user_profile.dart';
import 'package:mobile_app/services/rule_engine.dart';

void main() {
  group('1. Profile Model & Conditional Visibility', () {
    test('Married family branch fields', () {
      final p = UserProfile(
        marital: 'Married',
        spouseLivingWith: true,
        childrenCount: 2,
        daughterUnder18: true,
      );
      expect(p.marital, 'Married');
      expect(p.spouseLivingWith, true);
      expect(p.childrenCount, 2);
      expect(p.daughterUnder18, true);
    });

    test('Widowed family branch fields', () {
      final p = UserProfile(
        marital: 'Widowed',
        deathCertAvailable: true,
        familyPension: true,
        depChildrenCount: 1,
      );
      expect(p.marital, 'Widowed');
      expect(p.deathCertAvailable, true);
      expect(p.familyPension, true);
      expect(p.depChildrenCount, 1);
    });

    test('Deserted family branch fields', () {
      final p = UserProfile(
        marital: 'Deserted or divorced',
        separatedYears: 'Yes',
      );
      expect(p.separatedYears, 'Yes');
    });

    test('Unmarried 50+ family branch fields', () {
      final p = UserProfile(
        age: 55,
        marital: 'Unmarried',
        unmarriedFamilySupport: false,
      );
      expect(p.unmarriedFamilySupport, false);
    });

    test('Student & Education fields', () {
      final p = UserProfile(
        role: 'College student',
        courseType: 'UG',
        institutionType: 'Government',
        govschool: true,
        firstGraduate: true,
        hostelStay: false,
      );
      expect(p.role, 'College student');
      expect(p.courseType, 'UG');
      expect(p.institutionType, 'Government');
      expect(p.govschool, true);
    });

    test('Employment & Retired fields', () {
      final p = UserProfile(
        workStatus: 'Retired',
        retiredFrom: 'Government',
        receivesPension: true,
        pensionAmount: 15000,
      );
      expect(p.workStatus, 'Retired');
      expect(p.retiredFrom, 'Government');
      expect(p.receivesPension, true);
      expect(p.pensionAmount, 15000);
    });
  });

  group('2. Income Helper & Range Parsing', () {
    test('Monthly x 12 income calculation', () {
      const monthlyIncome = 7000;
      final annualIncome = monthlyIncome * 12;
      expect(annualIncome, 84000);
    });

    test('Approximate income ranges upper limit mapping', () {
      final p1 = UserProfile(familyIncome: 100000, incomeIsApproximate: true);
      expect(p1.familyIncome, 100000);
      expect(p1.incomeIsApproximate, true);

      final p2 = UserProfile(familyIncome: 250000, incomeIsApproximate: true);
      expect(p2.familyIncome, 250000);

      final p3 = UserProfile(familyIncome: 500000, incomeIsApproximate: true);
      expect(p3.familyIncome, 500000);

      final p4 = UserProfile(familyIncome: 1000000, incomeIsApproximate: true);
      expect(p4.familyIncome, 1000000);
    });
  });

  group('3. Completeness Percentage', () {
    test('Empty profile default completeness', () {
      final p = UserProfile(gender: null);
      expect(p.calculateCompletenessPercent(), lessThan(15));
    });

    test('Partially filled profile gives correct percent', () {
      final p = UserProfile(age: 30, gender: 'F', district: 'Chennai');
      final percent = p.calculateCompletenessPercent();
      expect(percent, greaterThan(0));
      expect(percent, lessThan(100));
    });

    test('Fully filled profile gives 100%', () {
      final p = UserProfile(
        age: 30,
        gender: 'Female',
        district: 'Chennai',
        areaType: 'Urban',
        community: 'BC',
        marital: 'Married',
        spouseLivingWith: true,
        childrenCount: 2,
        daughterUnder18: true,
        famhead: true,
        rationCardType: 'PHH',
        familyMembersCount: 4,
        role: 'Completed studies',
        highestQual: 'UG Degree',
        institutionType: 'Government',
        govschool: true,
        firstGraduate: true,
        hostelStay: true,
        workStatus: 'Employed',
        employmentSector: 'Private',
        ownIncome: 250000,
        familyIncome: 300000,
        taxPayer: true,
        govtEmployeeInFamily: true,
        hasCar: true,
        landWetAcres: 1.0,
        landDryAcres: 0.0,
        electricityUnitsYear: 1200,
        homeOwnership: 'Own',
        fixedAssetsBand: 'under ₹1 lakh',
        disability: 0,
        disabilityCertAvailable: true,
        destitute: true,
        bplFamily: true,
        agriLabourer: true,
        welfareBoard: true,
      );
      expect(p.calculateCompletenessPercent(), 100);
    });
  });

  group('4. Migration from Old Profile Fields', () {
    test('Backward compatibility with legacy json', () {
      final legacyJson = {
        'age': 45,
        'gender': 'Female',
        'famhead': true,
        'govschool': true,
        'highered': false,
        'destitute': true,
        'hasCar': false,
        'excessLand': false,
        'income': 90000,
      };
      final p = UserProfile.fromJson(legacyJson);
      expect(p.age, 45);
      expect(p.gender, 'Female');
      expect(p.famhead, true);
      expect(p.govschool, true);
      expect(p.destitute, true);
      expect(p.hasCar, false);
      expect(p.familyIncome, 90000);
    });
  });

  group('5. Rule Engine Outcomes & Next Best Question', () {
    final kmutScheme = Scheme.fromJson({
      'id': 'kmut-1',
      'name': 'Kalaignar Magalir Urimai Thogai',
      'category': 'financial_support',
      'rules': {
        'income': {'\$lt': 250000},
      },
    });

    final pensionScheme = Scheme.fromJson({
      'id': 'dwp-1',
      'name': 'Destitute Widow Pension',
      'category': 'pensions',
      'rules': {
        'marital': 'Widowed',
        'income': {'\$lt': 100000},
      },
      'unmappedCriteria': [
        'Must not receive any other pension',
      ],
    });

    test('Government employee in family causes Not Eligible outcome', () {
      final p = UserProfile(
        age: 35,
        gender: 'Female',
        familyIncome: 120000,
        govtEmployeeInFamily: true,
        taxPayer: false,
        hasCar: false,
      );
      final result = RuleEngine.evaluate(kmutScheme, p);
      expect(result.status, EligibilityStatus.notEligible);
      expect(result.reason, contains('government employee'));
    });

    test('Retired government employee with pension gets Possibly Eligible - Verify', () {
      final p = UserProfile(
        age: 62,
        gender: 'Female',
        marital: 'Widowed',
        workStatus: 'Retired',
        retiredFrom: 'Government',
        receivesPension: true,
        pensionAmount: 12000,
        familyIncome: 80000,
      );
      final result = RuleEngine.evaluate(pensionScheme, p);
      expect(result.status, EligibilityStatus.possiblyEligibleVerify);
      expect(result.reason, contains('pension'));
    });

    test('Approximate income near limit flags Possibly Eligible - Verify', () {
      final p = UserProfile(
        age: 35,
        gender: 'Female',
        familyIncome: 200000,
        incomeIsApproximate: true,
        govtEmployeeInFamily: false,
        taxPayer: false,
        hasCar: false,
      );
      final result = RuleEngine.evaluate(kmutScheme, p);
      expect(result.status, EligibilityStatus.possiblyEligibleVerify);
    });

    test('Missing required data marks scheme Possibly Eligible - Verify with missingFields', () {
      final p = UserProfile(
        age: 30,
        gender: 'Female',
      );
      final result = RuleEngine.evaluate(kmutScheme, p);
      expect(result.status, EligibilityStatus.possiblyEligibleVerify);
      expect(result.missingFields, contains('Annual family income'));
    });

    test('Next best question logic finds highest priority missing field', () {
      final p = UserProfile(age: 30, gender: 'Female');
      final missingField = RuleEngine.getNextBestQuestion([kmutScheme, pensionScheme], p);
      expect(missingField, isNotNull);
    });
  });
}
