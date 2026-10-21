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
    bool isRetiredGovtPensionerNote = false;

    final nameTrimmed = scheme.name.trim();
    final nameLower = '${scheme.name} ${scheme.nameTamil}'.toLowerCase();

    // Check if this is a Government Department/Agency portal entry rather than an actual welfare scheme
    final isDepartmentOrAgencyOnly = (nameTrimmed.toLowerCase() == 'tnega' ||
        nameTrimmed.toLowerCase().contains('tnega') && !nameLower.contains('scheme') && !nameLower.contains('thogai') ||
        nameTrimmed.toLowerCase() == 'elcot' ||
        nameTrimmed.toLowerCase() == 'tidco' ||
        nameTrimmed.toLowerCase() == 'sipcot' ||
        nameTrimmed.toLowerCase().startsWith('information technology and digital services department') ||
        nameTrimmed.toLowerCase().startsWith('தகவல் தொழில்நுட்பவியல் மற்றும் டிஜிட்டல் சேவைகள் துறை'));

    if (isDepartmentOrAgencyOnly) {
      return RuleEvaluationResult(
        status: EligibilityStatus.notEligible,
        reason: 'Government department or agency portal, not an individual welfare beneficiary scheme.',
        matchedCriteria: [],
        failedCriteria: ['Not an individual welfare scheme (Department portal entry)'],
        missingFields: [],
      );
    }

    // 1. Evaluate explicit schema rules map
    if (rules.isNotEmpty) {
      for (var entry in rules.entries) {
        final key = entry.key;
        final condition = entry.value;

        switch (key) {
          case 'gender':
            final normProfileGender = (profile.gender == 'Female' || profile.gender == 'F')
                ? 'F'
                : ((profile.gender == 'Male' || profile.gender == 'M') ? 'M' : profile.gender);
            final normCondition = (condition == 'Female' || condition == 'F')
                ? 'F'
                : ((condition == 'Male' || condition == 'M') ? 'M' : condition);

            if (profile.gender == null || profile.gender == 'prefer_not_to_say' || profile.gender!.isEmpty) {
              missing.add('Gender');
            } else if (normProfileGender != normCondition) {
              failed.add('Gender requirement (${condition == 'F' ? 'Female' : 'Male'}) not met');
            } else {
              matched.add('Gender matches (${condition == 'F' ? 'Female' : 'Male'})');
            }
            break;

          case 'age':
            if (condition is Map) {
              if (profile.age == null) {
                missing.add('Age');
              } else {
                bool agePass = true;
                if (condition.containsKey('\$gte')) {
                  final minAge = (condition['\$gte'] as num).toInt();
                  if (profile.age! < minAge) {
                    failed.add('Age must be at least $minAge years (profile is ${profile.age})');
                    agePass = false;
                  }
                }
                if (condition.containsKey('\$gt')) {
                  final minAge = (condition['\$gt'] as num).toInt();
                  if (profile.age! <= minAge) {
                    failed.add('Age must be greater than $minAge years (profile is ${profile.age})');
                    agePass = false;
                  }
                }
                if (condition.containsKey('\$lte')) {
                  final maxAge = (condition['\$lte'] as num).toInt();
                  if (profile.age! > maxAge) {
                    failed.add('Age must be at most $maxAge years (profile is ${profile.age})');
                    agePass = false;
                  }
                }
                if (condition.containsKey('\$lt')) {
                  final maxAge = (condition['\$lt'] as num).toInt();
                  if (profile.age! >= maxAge) {
                    failed.add('Age must be under $maxAge years (profile is ${profile.age})');
                    agePass = false;
                  }
                }
                if (agePass) {
                  matched.add('Age (${profile.age} years) meets criteria');
                }
              }
            } else if (condition is num) {
              if (profile.age == null) {
                missing.add('Age');
              } else if (profile.age != condition.toInt()) {
                failed.add('Age must be $condition years');
              } else {
                matched.add('Age requirement ($condition) met');
              }
            }
            break;

          case 'income':
          case 'annualIncome':
            if (condition is Map) {
              final maxIncome = (condition['\$lte'] ?? condition['\$lt'] as num?)?.toInt();
              final isStrictLt = condition.containsKey('\$lt') && !condition.containsKey('\$lte');
              if (maxIncome != null) {
                int? evalIncome = profile.familyIncome;
                
                if (evalIncome == null && profile.incomeRangeBand != null) {
                  switch (profile.incomeRangeBand) {
                    case 'under 1 lakh':
                    case 'under ₹1 lakh':
                      evalIncome = 90000;
                      break;
                    case '1–2.5 lakh':
                    case '₹1 to 2.5 lakh':
                      evalIncome = 240000;
                      break;
                    case '2.5–5 lakh':
                    case '₹2.5 to 5 lakh':
                      evalIncome = 450000;
                      break;
                    case 'above 5 lakh':
                    case 'above ₹5 lakh':
                      evalIncome = 600000;
                      break;
                  }
                }

                if (evalIncome == null) {
                  missing.add('Annual family income');
                } else {
                  if (isStrictLt ? (evalIncome >= maxIncome) : (evalIncome > maxIncome)) {
                    failed.add('Annual family income must be below ₹$maxIncome');
                  } else {
                    matched.add(isStrictLt ? 'Income is below ₹$maxIncome limit' : 'Income is within ₹$maxIncome limit');
                  }
                }
              }
            }
            break;

          case 'community':
          case 'communityCategory':
            final reqComm = condition.toString().toUpperCase().trim();
            final userComm = profile.community?.toUpperCase().trim();
            if (userComm == null || userComm.isEmpty || userComm == 'PREFER_NOT_TO_SAY') {
              missing.add('Community category');
            } else {
              final isMatch = (reqComm == 'SC/ST' || reqComm == 'SC, ST')
                  ? (userComm == 'SC' || userComm == 'ST')
                  : (reqComm.contains(userComm));
              if (isMatch) {
                matched.add('Community category matches ($reqComm)');
              } else {
                failed.add('Community category ($reqComm) not met (profile is $userComm)');
              }
            }
            break;

          case 'courseLevel':
            final reqLevel = condition.toString().toLowerCase().trim();
            final isGraduatedCourse = profile.role == 'Completed studies' ||
                profile.role == 'Not studying' ||
                ((profile.highestQual == 'Graduate' || profile.highestQual == 'Post-Graduate') &&
                    profile.role != 'College student' &&
                    profile.role != 'Higher studies');
            if (isGraduatedCourse) {
              failed.add('Scholarship requires active enrolled student; profile states graduated / completed studies');
            } else if (reqLevel == 'school') {
              if (profile.role == 'School student') {
                matched.add('Enrolled as school student');
              } else if (profile.role == null) {
                missing.add('School student enrollment');
              } else {
                failed.add('School-level scheme requires school student enrollment; profile is ${profile.role}');
              }
            } else if (profile.role == null) {
              missing.add('Current education enrollment');
            } else if (profile.role == 'College student' || profile.role == 'Higher studies') {
              if (profile.courseType != null &&
                  profile.courseType!.toLowerCase().trim() != reqLevel &&
                  profile.courseType != 'UG' &&
                  reqLevel != 'college') {
                failed.add('Course level must be $condition');
              } else {
                matched.add('Enrolled in $condition level course');
              }
            } else {
              failed.add('Must be currently studying at $condition level');
            }
            break;

          case 'marital':
            final normProfileMarital = profile.marital?.toLowerCase().trim();
            final normCondMarital = condition.toString().toLowerCase().trim();
            if (profile.marital == null || profile.marital == 'prefer_not_to_say') {
              missing.add('Marital status');
            } else if (normProfileMarital != normCondMarital) {
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
            final isGraduatedHighered = profile.role == 'Completed studies' ||
                profile.role == 'Not studying' ||
                ((profile.highestQual == 'Graduate' || profile.highestQual == 'Post-Graduate') &&
                    profile.role != 'College student' &&
                    profile.role != 'Higher studies');
            if (condition == true && (isGraduatedHighered || !profile.highered)) {
              failed.add('Must be currently enrolled in higher education');
            } else if (condition == true && profile.highered) {
              matched.add('Higher education enrolment confirmed');
            }
            break;

          case 'famhead':
            if (condition == true && !profile.famhead && profile.rationCardHead != 'self' && profile.rationCardHead != 'spouse') {
              failed.add('Must be woman head of family on ration card');
            } else if (condition == true && (profile.famhead || profile.rationCardHead == 'self')) {
              matched.add('Woman head of family confirmed');
            } else if (condition == true && profile.rationCardHead == 'spouse') {
              matched.add('Wife of the male head, who is treated as head for this scheme (confirm with the office)');
            }
            break;

          case 'rationCardHead':
            final headVal = profile.rationCardHead ?? (profile.famhead ? 'self' : null);
            if (headVal == null || headVal == 'unknown') {
              missing.add('Ration card head');
            } else if (headVal == 'spouse') {
              matched.add('Wife of the male head, who is treated as head for this scheme (confirm with the office)');
            } else if (headVal == 'self') {
              matched.add('Woman head of family on ration card');
            } else {
              // 'other', 'none'
              failed.add('Must be woman head of family or wife of male head on ration card');
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
              final isGraduatedStudent = profile.role == 'Completed studies' ||
                  profile.role == 'Not studying' ||
                  ((profile.highestQual == 'Graduate' || profile.highestQual == 'Post-Graduate') &&
                      profile.role != 'College student' &&
                      profile.role != 'Higher studies');
              if (isGraduatedStudent) {
                failed.add('Requires active student status (profile states graduated / not studying)');
              } else if (profile.role == null) {
                missing.add('Current role / student status');
              } else if (profile.role == 'School student') {
                if (profile.classStudied == null) {
                  missing.add('Class studying');
                } else if (['10', '11', '12'].contains(profile.classStudied)) {
                  matched.add('Senior school student (Class 10/11/12)');
                } else {
                  matched.add('Active school student');
                }
              } else if (profile.role == 'College student' || profile.role == 'Higher studies') {
                matched.add('Active student status confirmed');
              } else {
                failed.add('Must be a currently enrolled student');
              }
            }
            break;

          case 'pregnant':
          case 'isPregnant':
            if (condition == true) {
              if (profile.isPregnant == true) {
                matched.add('Currently pregnant (eligible for maternity support & nutrition kits)');
              } else if (profile.isPregnant == null) {
                missing.add('Pregnancy status');
              } else {
                failed.add('Must be currently pregnant');
              }
            }
            break;

          case 'hasNewborn':
          case 'newborn':
            if (condition == true) {
              if (profile.hasNewborn == true) {
                matched.add('Recently delivered newborn baby (eligible for newborn welfare & gift scheme)');
              } else if (profile.hasNewborn == null) {
                missing.add('Newborn baby status');
              } else {
                failed.add('Requires recently delivered newborn child (0–1 year)');
              }
            }
            break;

          case 'deliveryPlace':
            if (condition == 'Government Hospital') {
              if (profile.deliveryPlace == 'Government Hospital') {
                matched.add('Institutional delivery in Government Hospital / PHC');
              } else if (profile.deliveryPlace == null) {
                missing.add('Delivery hospital place');
              } else {
                failed.add('Requires delivery in Government Hospital / PHC');
              }
            }
            break;

          case 'isStudent':
            if (condition == true) {
              if (profile.role == 'School student' || profile.role == 'College student' || profile.role == 'Higher studies') {
                matched.add('Currently studying as a student');
              } else if (profile.role == null) {
                missing.add('Student status');
              } else {
                failed.add('Requires active student status');
              }
            }
            break;

          case 'studiedInGovtSchool':
            if (condition == true) {
              if (profile.govschool == true || profile.institutionType == 'Government' || profile.institutionType == 'Government-aided') {
                matched.add('Education in Government / Government-aided institution');
              } else {
                failed.add('Requires study in Government / Government-aided institution');
              }
            }
            break;

          case 'workerType':
            if (condition == 'manual_worker' || condition == 'unorganised') {
              if (profile.welfareBoard || profile.workStatus == 'Daily wage' || profile.workStatus == 'Agricultural labourer' || profile.workStatus == 'Self-employed') {
                matched.add('Eligible unorganised / board worker');
              } else if (profile.workStatus == null) {
                missing.add('Occupation / worker type');
              } else {
                failed.add('Scheme is for unorganised / manual workers');
              }
            } else if (condition == 'folk_artiste') {
              if (profile.workStatus == 'Folk artiste' || profile.welfareBoard) {
                matched.add('Registered folk artiste / welfare board member');
              } else if (profile.workStatus == null) {
                missing.add('Folk artiste / welfare board registration');
              } else {
                failed.add('Must be a registered Folk Artiste');
              }
            }
            break;

          case 'needsSpectacles':
          case 'hasEyeProblem':
          case 'eyeProblem':
            if (condition == true) {
              if (profile.hasEyeProblem || profile.healthConditions.contains('Eye / Vision problem')) {
                matched.add('Requires spectacles / has vision health condition');
              } else {
                missing.add('Prescription for spectacles / eye checkup');
              }
            }
            break;

          case 'healthCondition':
          case 'disease':
            final condStr = condition.toString().toLowerCase();
            final hasMatch = profile.healthConditions.any((hc) => hc.toLowerCase().contains(condStr));
            if (hasMatch) {
              matched.add('Eligible health condition: $condition');
            } else {
              missing.add('Health condition: $condition');
            }
            break;
        }
      }
    }

    // 2. Comprehensive check for all fetched / stored scholarships and education schemes
    final catLower = scheme.category.toLowerCase();
    final benefitLower = scheme.benefit.toLowerCase();
    final isScholarshipScheme = catLower.contains('scholarship') ||
        nameLower.contains('scholarship') ||
        nameLower.contains('கல்வி உதவித்தொகை') ||
        nameLower.contains('post-matric') ||
        nameLower.contains('pre-matric') ||
        nameLower.contains('pudhumai') ||
        nameLower.contains('pudhalvan') ||
        nameLower.contains('award') ||
        nameLower.contains('memorial award') ||
        nameLower.contains('prize') ||
        (catLower.contains('education') || catLower.contains('social welfare')) &&
            (benefitLower.contains('allowance') ||
             benefitLower.contains('tuition') ||
             benefitLower.contains('scholarship') ||
             benefitLower.contains('award') ||
             benefitLower.contains('prize') ||
             benefitLower.contains('public examination') ||
             benefitLower.contains('ranks in the') ||
             nameLower.contains('award') ||
             nameLower.contains('prize') ||
             nameLower.contains('student'));

    if (isScholarshipScheme) {
      final isGraduatedOrNotStudying = profile.role == 'Completed studies' ||
          profile.role == 'Not studying' ||
          ((profile.highestQual == 'Graduate' || profile.highestQual == 'Post-Graduate') &&
              profile.role != 'College student' &&
              profile.role != 'Higher studies');

      if (isGraduatedOrNotStudying) {
        if (!failed.any((f) => f.contains('graduated / completed studies') || f.contains('not studying'))) {
          failed.add('Scholarship requires active enrolled student; profile indicates graduated / completed studies');
        }
      } else if (profile.role == null) {
        if (!missing.contains('Current education enrollment') && !missing.contains('Current role / student status')) {
          missing.add('Current education enrollment');
        }
      }

      // Check Post-Matric / Higher Education specific requirements
      final isPostMatric = nameLower.contains('post-matric') ||
          (scheme.rules.containsKey('courseLevel') && scheme.rules['courseLevel'] != 'school') ||
          nameLower.contains('pudhumai') ||
          nameLower.contains('pudhalvan');

      if (isPostMatric && profile.role == 'School student') {
        if (!failed.any((f) => f.contains('Post-Matric') || f.contains('higher education'))) {
          failed.add('Post-Matric scholarship requires college enrollment; profile indicates school student');
        }
      }

      final isSchoolLevel = nameLower.contains('pre-matric') ||
          nameLower.contains('upto 12th') ||
          nameLower.contains('10th and 12th') ||
          nameLower.contains('12th public') ||
          nameLower.contains('10th') ||
          nameLower.contains('12th') ||
          nameLower.contains('plusone') ||
          nameLower.contains('plus2') ||
          (scheme.rules.containsKey('courseLevel') && scheme.rules['courseLevel'] == 'school');

      if (isSchoolLevel && (profile.role == 'College student' || profile.role == 'Higher studies' || isGraduatedOrNotStudying)) {
        if (!failed.any((f) => f.contains('school student') || f.contains('Pre-Matric') || f.contains('School-level') || f.contains('10th / 12th'))) {
          failed.add('School-level / 12th examination award is strictly for active 10th/12th school students, not graduates');
        }
      }

      // Check SC/ST community targeting
      final isScStTargeted = nameLower.contains('sc/st') ||
          nameLower.contains('sc and st') ||
          nameLower.contains('adi dravidar') ||
          nameLower.contains('ஆதி திராவிடர்') ||
          nameLower.contains('tribal') ||
          nameLower.contains('பழங்குடியினர்') ||
          scheme.rules['communityCategory'] == 'SC' ||
          scheme.rules['communityCategory'] == 'ST';

      if (isScStTargeted) {
        if (profile.community == null || profile.community!.isEmpty || profile.community == 'prefer_not_to_say') {
          if (!missing.contains('Community category')) {
            missing.add('Community category');
          }
        } else {
          final uComm = profile.community!.toUpperCase().trim();
          if (uComm != 'SC' && uComm != 'ST') {
            if (!failed.any((f) => f.contains('SC/ST') || f.contains('Community category'))) {
              failed.add('Scheme is specifically for SC/ST students (profile community is ${profile.community})');
            }
          }
        }
      }

      // Check BC/MBC community targeting
      final isBcMbcTargeted = nameLower.contains('bc/mbc') ||
          nameLower.contains('backward class') ||
          nameLower.contains('மிகவும் பிற்படுத்தப்பட்ட') ||
          nameLower.contains('பிற்படுத்தப்பட்ட') ||
          scheme.rules['communityCategory'] == 'BC' ||
          scheme.rules['communityCategory'] == 'MBC';

      if (isBcMbcTargeted) {
        if (profile.community == null || profile.community!.isEmpty || profile.community == 'prefer_not_to_say') {
          if (!missing.contains('Community category')) {
            missing.add('Community category');
          }
        } else {
          final uComm = profile.community!.toUpperCase().trim();
          if (uComm != 'BC' && uComm != 'MBC') {
            if (!failed.any((f) => f.contains('BC/MBC') || f.contains('Community category'))) {
              failed.add('Scheme is specifically for BC/MBC students (profile community is ${profile.community})');
            }
          }
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

    // 3. Check MSME, Manufacturing, and Industrial Enterprise targeting
    final isEnterpriseTargeted = nameLower.contains('generator') ||
        nameLower.contains('special capital') ||
        nameLower.contains('subsidy for purchase of generator') ||
        scheme.unmappedCriteria.any((c) => c.toLowerCase().contains('manufacturer')) ||
        (scheme.rules.containsKey('target') && scheme.rules['target'] == 'manufacturer');

    if (isEnterpriseTargeted) {
      if (profile.workStatus == 'Self-employed') {
        if (profile.isManufacturer) {
          matched.add('Registered manufacturing enterprise / industrial unit');
        } else {
          missing.add('Whether you own a manufacturing or industrial enterprise');
        }
      } else if (profile.workStatus == null) {
        missing.add('Work status (Self-employed / Manufacturer)');
      } else {
        failed.add('Scheme is specifically for manufacturing and industrial enterprises');
      }
    }

    // 4. Check Farmers, Agriculture, and Cultivation targeting
    final unmappedStr = scheme.unmappedCriteria.join(' ').toLowerCase();
    final isFarmerScheme = scheme.rules['targetOccupation'] == 'farmer' ||
        unmappedStr.contains('farmers') ||
        unmappedStr.contains('beneficiaries: farmers') ||
        nameLower.contains('farmer') ||
        nameLower.contains('seeds') ||
        nameLower.contains('crops') ||
        nameLower.contains('gypsum') ||
        nameLower.contains('rhizobium') ||
        nameLower.contains('agricultural crops') ||
        nameLower.contains('farmers interest group');

    if (isFarmerScheme) {
      final double totalAcres = (profile.landWetAcres ?? 0.0) + (profile.landDryAcres ?? 0.0);
      final bool hasNoLandAnswered = (profile.landWetAcres != null && profile.landWetAcres == 0) &&
                                     (profile.landDryAcres != null && profile.landDryAcres == 0);

      if (profile.workStatus == 'Farmer') {
        matched.add('Occupation: Farmer');
      } else if (totalAcres > 0) {
        matched.add('Owns agricultural land ($totalAcres acres)');
      } else if (hasNoLandAnswered && (profile.workStatus != null && profile.workStatus != 'Farmer')) {
        failed.add('Requires farmer status or agricultural land (Profile has 0 acres land and work status is ${profile.workStatus})');
      } else if (hasNoLandAnswered && profile.workStatus == null) {
        missing.add('Whether you are a Farmer');
      } else if (profile.workStatus == null && profile.landWetAcres == null && profile.landDryAcres == null) {
        missing.add('Whether you are a Farmer or own agricultural land');
      } else if (profile.workStatus != null && profile.workStatus != 'Farmer') {
        failed.add('Scheme is specifically for farmers and agricultural cultivators');
      }

      // Check crop-specific schemes (e.g. Oil seeds, Gypsum, Certified Seeds, Pulses)
      final isOilSeedsScheme = nameLower.contains('oil seeds') || nameLower.contains('gypsum') || nameLower.contains('groundnut');
      final isPulsesScheme = nameLower.contains('pulses') || nameLower.contains('rhizobium');
      final isPaddyScheme = nameLower.contains('paddy') || nameLower.contains('certified seeds');

      if (isOilSeedsScheme || isPulsesScheme || isPaddyScheme) {
        if (profile.cropsCultivated.isEmpty) {
          missing.add('What crops you cultivate (e.g., Oil seeds, Paddy, Pulses)');
        } else {
          bool cropMatched = false;
          final userCrops = profile.cropsCultivated.join(' ').toLowerCase();
          if (isOilSeedsScheme && (userCrops.contains('oil seeds') || userCrops.contains('groundnut'))) {
            cropMatched = true;
            matched.add('Cultivates Oil seeds / Groundnut');
          } else if (isPulsesScheme && userCrops.contains('pulses')) {
            cropMatched = true;
            matched.add('Cultivates Pulses');
          } else if (isPaddyScheme && userCrops.contains('paddy')) {
            cropMatched = true;
            matched.add('Cultivates Paddy');
          }

          if (!cropMatched && (profile.workStatus == 'Farmer' || totalAcres > 0)) {
            final expectedCrop = isOilSeedsScheme ? 'Oil seeds / Groundnut' : (isPulsesScheme ? 'Pulses' : 'Paddy');
            failed.add('Scheme requires cultivating $expectedCrop (profile crops: ${profile.cropsCultivated.join(', ')})');
          }
        }
      }
    }

    // 5. Check Widow targeting
    final isWidowScheme = scheme.rules['marital'] == 'Widowed' ||
        unmappedStr.contains('widow') ||
        nameLower.contains('widow') ||
        nameLower.contains('destitute widow') ||
        nameLower.contains('deceased journalist pensioner');

    if (isWidowScheme) {
      final pMarital = profile.marital?.toLowerCase().trim();
      if (profile.marital == null || profile.marital == 'prefer_not_to_say') {
        if (!missing.contains('Marital status') && !missing.contains('Whether widowed')) {
          missing.add('Marital status (Widow/Widower)');
        }
      } else if (pMarital != 'widowed' && pMarital != 'widow') {
        if (!failed.any((f) => f.contains('Widow') || f.contains('widowed'))) {
          failed.add('Scheme is specifically for widows / families of deceased');
        }
      } else {
        matched.add('Widowed status confirmed');
      }
    }

    // 6. Check Folk Artiste / Artisan / Weaver targeting
    final isWeaverOrArtisanScheme = scheme.rules['workerType'] == 'weaver' ||
        scheme.rules['workerType'] == 'folk_artiste' ||
        unmappedStr.contains('weaver') ||
        unmappedStr.contains('handloom') ||
        unmappedStr.contains('folk artiste') ||
        nameLower.contains('handloom') ||
        nameLower.contains('textile park');

    if (isWeaverOrArtisanScheme) {
      if (profile.workStatus == null) {
        if (!missing.contains('Occupation / worker type')) {
          missing.add('Occupation (Weaver / Artisan / Handloom)');
        }
      } else if (profile.workStatus != 'Folk artiste' && 
                 profile.workStatus != 'Weaver' && 
                 profile.workStatus != 'Handloom' && 
                 !profile.welfareBoard) {
        failed.add('Scheme is specifically for weavers, handloom or folk artisans');
      } else {
        matched.add('Artisan / Handloom / Weaver worker confirmed');
      }
    }

    // 7. Check Student & Youth Skilling (e.g., Naan Mudhalvan, youth skill programmes)
    final isSkillingScheme = nameLower.contains('naan mudhalvan') ||
        nameLower.contains('skilling') ||
        nameLower.contains('employability programme');

    if (isSkillingScheme) {
      final isStudent = profile.role == 'School student' ||
          profile.role == 'College student' ||
          profile.role == 'Higher studies';
      final isYoungAdult = profile.age != null && profile.age! >= 18 && profile.age! <= 35;

      if (isStudent || isYoungAdult) {
        matched.add('Eligible student / youth (aged 18–35 or enrolled student)');
      } else {
        missing.add('Student / Youth enrollment in family (Classes 9–12 / College)');
      }
    }

    // 8. Check Bank Consumer / Cooperative / Micro Loans & Jewel Loans
    final isLoanScheme = nameLower.contains('loan') ||
        nameLower.contains('கடன்') ||
        nameLower.contains('consumer durables') ||
        nameLower.contains('jewel') ||
        nameLower.contains('mortgage') ||
        benefitLower.contains('loan') ||
        benefitLower.contains('rate of interest') ||
        benefitLower.contains('credit');

    if (isLoanScheme) {
      if (profile.interestedInLoan == false) {
        failed.add('Profile indicates not interested in applying for a loan');
      } else if (profile.interestedInLoan == null) {
        missing.add('Whether interested in applying for a loan');
      } else {
        matched.add('Interested in loan credit');
        // Check specific loan type match if specified
        if ((nameLower.contains('jewel') || benefitLower.contains('jewel')) && profile.loanType != null) {
          if (profile.loanType == 'Jewel loan') {
            matched.add('Requested loan type: Jewel loan');
          } else {
            failed.add('Scheme is for Jewel loans; profile specified ${profile.loanType}');
          }
        } else if ((nameLower.contains('consumer') || nameLower.contains('two wheelers')) && profile.loanType != null) {
          if (profile.loanType == 'Consumer durable loan' || profile.loanType == 'Two-wheeler loan') {
            matched.add('Requested loan type: ${profile.loanType}');
          } else {
            failed.add('Scheme is for consumer/vehicle loans; profile specified ${profile.loanType}');
          }
        }
      }

      if (profile.workStatus == 'Unemployed' || profile.destitute) {
        failed.add('Cooperative / bank loans require demonstrable income source / repayment capacity');
      } else if (profile.workStatus == null && profile.familyIncome == null && profile.incomeRangeBand == null) {
        missing.add('Occupation or regular family income (to assess loan eligibility)');
      }
    }

    // 9. Check Graduate Unemployed & Youth Initiatives (e.g., TVK / Vijay announcement & TN Unemployed Assistance)
    final isGraduateUnemployedScheme = nameLower.contains('unemployed youth') ||
        nameLower.contains('unemployment allowance') ||
        nameLower.contains('வேலைவாய்ப்பற்ற') ||
        nameLower.contains('graduate assistance') ||
        nameLower.contains('youth skill');

    if (isGraduateUnemployedScheme) {
      if (profile.workStatus == 'Unemployed' && (profile.highestQual == 'Graduate' || profile.highestQual == 'Post-Graduate')) {
        matched.add('Unemployed Graduate / Degree holder');
      } else if (profile.workStatus != 'Unemployed' && profile.workStatus != null) {
        failed.add('Scheme requires unemployed status (profile is ${profile.workStatus})');
      } else if (profile.highestQual != null && profile.highestQual != 'Graduate' && profile.highestQual != 'Post-Graduate') {
        failed.add('Scheme requires graduation qualification (profile is ${profile.highestQual})');
      } else {
        missing.add('Work status and graduation qualification');
      }
    }

    // 9. Determine final verdict based on failed, missing, and notes
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
        reason: 'Answer ${missing.join(', ')} in your profile to confirm eligibility.',
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

    if (scheme.verify && matched.isEmpty && rules.isEmpty) {
      // Require specific profile details before showing general schemes as verified
      final requiredAttribute = scheme.category.toLowerCase().contains('education')
          ? 'Current education enrollment'
          : (scheme.category.toLowerCase().contains('loan')
              ? 'Income or occupation details'
              : 'Relevant category details');
      return RuleEvaluationResult(
        status: EligibilityStatus.possiblyEligibleVerify,
        reason: 'General scheme: specify $requiredAttribute to confirm.',
        matchedCriteria: matched,
        failedCriteria: [],
        missingFields: [requiredAttribute],
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
    if (topField.contains('Age') || topField.contains('Gender')) {
      sectionIdx = 0;
    } else if (topField.contains('Marital') || topField.contains('Widow') || topField.contains('Ration') || topField.contains('Head')) {
      sectionIdx = 1;
    } else if (topField.contains('Student') || topField.contains('School') || topField.contains('Education') || topField.contains('Course')) {
      sectionIdx = 2;
    } else if (topField.contains('Income') || topField.contains('Farmer') || topField.contains('Work') || topField.contains('Occupation') || topField.contains('Weaver')) {
      sectionIdx = 3;
    } else if (topField.contains('land') || topField.contains('Land') || topField.contains('Asset') || topField.contains('Vehicle')) {
      sectionIdx = 4;
    } else if (topField.contains('Disability') || topField.contains('Spectacle') || topField.contains('Eye') || topField.contains('Health')) {
      sectionIdx = 5;
    }

    return {
      'field': topField,
      'count': sorted.first.value,
      'sectionIndex': sectionIdx,
    };
  }
}
