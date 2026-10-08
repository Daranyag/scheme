import '../models/scheme.dart';
import '../models/user_profile.dart';

enum EligibilityStatus {
  eligible,
  possiblyEligibleVerify,
  notEligible,
}

class RuleEvaluationResult {
  final EligibilityStatus status;
  final String reason;
  final List<String> matchedCriteria;
  final List<String> failedCriteria;
  final List<String> missingFields;

  RuleEvaluationResult({
    required this.status,
    required this.reason,
    required this.matchedCriteria,
    required this.failedCriteria,
    this.missingFields = const [],
  });
}

class RuleEngine {
  /// Evaluates a scheme against a user profile with strict zero-hallucination rules.
  static RuleEvaluationResult evaluate(Scheme scheme, UserProfile profile) {
    final rules = scheme.rules;
    final List<String> matched = [];
    final List<String> failed = [];
    final List<String> missing = [];
    bool isApproximateIncomeNearLimit = false;
    bool isRetiredGovtPensionerNote = false;

    // 1. Evaluate explicit schema rules map
    if (rules.isNotEmpty) {
      for (var entry in rules.entries) {
        final key = entry.key;
        final condition = entry.value;

        switch (key) {
          case 'gender':
            if (profile.gender == null || profile.gender == 'prefer_not_to_say') {
              missing.add('Gender');
            } else if (profile.gender != condition) {
              failed.add('Gender requirement (${condition == 'F' ? 'Female' : 'Male'}) not met');
            } else {
              matched.add('Gender matches (${condition == 'F' ? 'Female' : 'Male'})');
            }
            break;

          case 'age':
            if (condition is Map && condition.containsKey('\$gte')) {
              final minAge = (condition['\$gte'] as num).toInt();
              if (profile.age == null) {
                missing.add('Age');
              } else if (profile.age! < minAge) {
                failed.add('Age must be at least $minAge years');
              } else {
                matched.add('Age meets minimum of $minAge years');
              }
            }
            break;

          case 'income':
            if (condition is Map && condition.containsKey('\$lt')) {
              final maxIncome = (condition['\$lt'] as num).toInt();
              int? evalIncome = profile.familyIncome;
              
              if (evalIncome == null && profile.incomeRangeBand != null) {
                switch (profile.incomeRangeBand) {
                  case 'under 1 lakh':
                    evalIncome = 100000;
                    break;
                  case '1–2.5 lakh':
                    evalIncome = 250000;
                    break;
                  case '2.5–5 lakh':
                    evalIncome = 500000;
                    break;
                  case 'above 5 lakh':
                    evalIncome = 1000000;
                    break;
                }
              }

              if (evalIncome == null) {
                missing.add('Annual family income');
              } else {
                if (evalIncome >= maxIncome) {
                  failed.add('Annual family income must be below ₹$maxIncome');
                } else {
                  matched.add('Income is below ₹$maxIncome limit');
                  // Check approximate range near limit
                  if (profile.incomeIsApproximate || profile.incomeRangeBand != null) {
                    if (evalIncome >= (maxIncome * 0.75)) {
                      isApproximateIncomeNearLimit = true;
                    }
                  }
                }
              }
            }
            break;

          case 'marital':
            if (profile.marital == null || profile.marital == 'prefer_not_to_say') {
              missing.add('Marital status');
            } else if (profile.marital != condition) {
              failed.add('Marital status must be $condition');
            } else {
              matched.add('Marital status matches ($condition)');
            }
            break;

          case 'destitute':
            if (condition == true && !profile.destitute && !profile.bplFamily) {
              failed.add('Must belong to destitute / BPL family');
            } else if (condition == true && (profile.destitute || profile.bplFamily)) {
              matched.add('Destitute / BPL status confirmed');
            }
            break;

          case 'govschool':
            if (condition == true && !profile.govschool) {
              failed.add('Must have studied Classes 6–12 in Govt / Govt-aided school');
            } else if (condition == true && profile.govschool) {
              matched.add('Government school education criteria met');
            }
            break;

          case 'highered':
            if (condition == true && !profile.highered) {
              failed.add('Must be currently enrolled in higher education');
            } else if (condition == true && profile.highered) {
              matched.add('Higher education enrolment confirmed');
            }
            break;

          case 'famhead':
            if (condition == true && !profile.famhead) {
              failed.add('Must be woman head of family on ration card');
            } else if (condition == true && profile.famhead) {
              matched.add('Woman head of family confirmed');
            }
            break;

          case 'disability':
            if (condition is Map && condition.containsKey('\$gte')) {
              final minDisability = (condition['\$gte'] as num).toInt();
              if (profile.disability < minDisability) {
                failed.add('Disability must be at least $minDisability%');
              } else {
                matched.add('Disability percentage ($minDisability%+) met');
              }
            }
            break;

          case 'fixedAssetsBand':
            if (condition == 'under ₹1 lakh') {
              if (profile.fixedAssetsBand == 'above ₹1 lakh') {
                failed.add('Fixed assets must be under ₹1 lakh');
              } else if (profile.fixedAssetsBand == null) {
                missing.add('Fixed assets value');
              } else {
                matched.add('Fixed assets requirement met');
              }
            }
            break;

          case 'retired':
            if (condition == true) {
              if (profile.workStatus == 'Retired') {
                matched.add('Retired status confirmed');
              } else if (profile.workStatus == null) {
                missing.add('Work status');
              } else {
                failed.add('Must be retired');
              }
            }
            break;

          case 'unemployed':
            if (condition == true) {
              if (profile.workStatus == 'Unemployed') {
                matched.add('Unemployed status confirmed');
              } else if (profile.workStatus == null) {
                missing.add('Work status');
              } else {
                failed.add('Must be unemployed');
              }
            }
            break;

          case 'student':
            if (condition == true) {
              if (profile.role == null) {
                missing.add('Current role');
              } else if (profile.role == 'School student') {
                if (profile.classStudied == null) {
                  missing.add('Class studying');
                } else if (['10', '11', '12'].contains(profile.classStudied)) {
                  matched.add('Senior school student (Class 10/11/12)');
                } else {
                  failed.add('Must be studying in Class 10, 11, or 12');
                }
              } else {
                failed.add('Must be a school student in Class 10, 11, or 12');
              }
            }
            break;
        }
      }
    }

    // 2. Check Government Employees & Retired Pensioners
    bool excludesGovtEmployees = false;
    if (!scheme.name.contains('State Government Employees')) {
      if (scheme.name.contains('Kalaignar Magalir Urimai') ||
          scheme.name.contains('KMUT') ||
          scheme.name.contains('Pension') ||
          scheme.name.contains('Destitute')) {
        excludesGovtEmployees = true;
      }
    }

    if (excludesGovtEmployees) {
      if (profile.govtEmployeeInFamily || profile.employmentSector == 'Government-Permanent') {
        failed.add('Government employees / families with a government employee are excluded under scheme rules');
      } else if (profile.retiredFrom == 'Government' && profile.receivesPension == true) {
        isRetiredGovtPensionerNote = true;
      }
    }

    // 3. Check KMUT explicit stored exclusions
    if (scheme.name.contains('Kalaignar Magalir Urimai') || scheme.name.contains('KMUT')) {
      if (profile.taxPayer) {
        failed.add('Family member pays income tax');
      }
      if (profile.hasCar) {
        failed.add('Family owns personal four-wheeler');
      }
      if (profile.excessLand ||
          (profile.landWetAcres != null && profile.landWetAcres! > 5) ||
          (profile.landDryAcres != null && profile.landDryAcres! > 10)) {
        failed.add('Family land exceeds 5 acres wetland or 10 acres dryland limit');
      }
      if (profile.electricityUnitsYear != null && profile.electricityUnitsYear! > 3600) {
        failed.add('Electricity usage exceeds 3,600 units/year limit');
      }
    }

    // 4. Determine final verdict based on failed, missing, and notes
    if (failed.isNotEmpty) {
      return RuleEvaluationResult(
        status: EligibilityStatus.notEligible,
        reason: failed.join(' • '),
        matchedCriteria: matched,
        failedCriteria: failed,
        missingFields: missing,
      );
    }

    if (missing.isNotEmpty) {
      return RuleEvaluationResult(
        status: EligibilityStatus.possiblyEligibleVerify,
        reason: 'Answer ${missing.join(', ')} to confirm eligibility.',
        matchedCriteria: matched,
        failedCriteria: [],
        missingFields: missing,
      );
    }

    if (isRetiredGovtPensionerNote) {
      return RuleEvaluationResult(
        status: EligibilityStatus.possiblyEligibleVerify,
        reason: 'You receive a pension, so check this condition with the office.',
        matchedCriteria: matched,
        failedCriteria: [],
        missingFields: [],
      );
    }

    if (isApproximateIncomeNearLimit) {
      return RuleEvaluationResult(
        status: EligibilityStatus.possiblyEligibleVerify,
        reason: 'Your income range is close to the limit.',
        matchedCriteria: matched,
        failedCriteria: [],
        missingFields: [],
      );
    }

    if (scheme.verify) {
      return RuleEvaluationResult(
        status: EligibilityStatus.possiblyEligibleVerify,
        reason: 'General scheme - verify specific course/age eligibility on official portal.',
        matchedCriteria: matched,
        failedCriteria: [],
        missingFields: [],
      );
    }

    return RuleEvaluationResult(
      status: EligibilityStatus.eligible,
      reason: 'All criteria fully matched.',
      matchedCriteria: matched,
      failedCriteria: [],
      missingFields: [],
    );
  }

  /// Calculates which unanswered question in the profile would resolve the most "Possibly eligible - verify" schemes.
  static Map<String, dynamic>? getNextBestQuestion(List<Scheme> schemes, UserProfile profile) {
    final Map<String, int> missingFieldCounts = {};

    for (var scheme in schemes) {
      final eval = evaluate(scheme, profile);
      if (eval.status == EligibilityStatus.possiblyEligibleVerify && eval.missingFields.isNotEmpty) {
        for (var field in eval.missingFields) {
          missingFieldCounts[field] = (missingFieldCounts[field] ?? 0) + 1;
        }
      }
    }

    if (missingFieldCounts.isEmpty) {
      // Return first empty general field
      if (profile.age == null) return {'field': 'Age', 'sectionIndex': 0};
      if (profile.familyIncome == null && profile.incomeRangeBand == null) return {'field': 'Annual family income', 'sectionIndex': 3};
      if (profile.marital == null) return {'field': 'Marital status', 'sectionIndex': 1};
      return null;
    }

    // Sort by frequency
    var sorted = missingFieldCounts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    String topField = sorted.first.key;
    int sectionIdx = 0;
    if (topField.contains('Age') || topField.contains('Gender')) sectionIdx = 0;
    else if (topField.contains('Marital')) sectionIdx = 1;
    else if (topField.contains('Income')) sectionIdx = 3;

    return {
      'field': topField,
      'count': sorted.first.value,
      'sectionIndex': sectionIdx,
    };
  }
}
