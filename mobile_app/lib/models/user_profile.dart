import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class UserProfile {
  // Section 1: Personal details
  int? age;
  String? gender; // F, M, O, prefer_not_to_say
  String? district;
  String? areaType; // Rural, Urban
  String? community; // OC, BC, MBC, SC, ST, prefer_not_to_say

  // Section 2: Family
  String? marital; // unmarried, married, widowed, deserted, prefer_not_to_say
  // Married / pregnancy follow-ups
  bool? spouseLivingWith;
  int? childrenCount;
  bool? daughterUnder18;
  bool? isPregnant; // Are you currently pregnant?
  bool? hasNewborn; // Have you recently given birth (child aged 0-1 year)?
  String? deliveryPlace; // Government Hospital, Private Hospital, Home / Other
  bool? interestedInLoan; // Interested in applying for a loan? (Asked if married)
  String? loanType; // Jewel loan, Land / Mortgage loan, Two-wheeler loan, Consumer durable loan, Business loan
  // Widowed follow-ups
  bool? deathCertAvailable;
  bool? familyPension;
  int? depChildrenCount;
  // Deserted / divorced follow-up
  String? separatedYears; // Yes, No, Court certificate available
  // Unmarried age 50+ follow-up
  bool? unmarriedFamilySupport;

  bool famhead; // Legacy: Head of family on ration card
  String? rationCardHead; // self, spouse, other, none, unknown
  bool? isTnResident; // Permanent resident of Tamil Nadu?
  String? rationCardType; // PHH, PHH-AAY, NPHH, No ration card, Not sure
  int? familyMembersCount;

  // Section 3: Education
  String? role; // Not studying, School student, College student, Higher studies, Completed studies
  String? classStudied; // 1-12
  String? courseType; // UG, PG, Diploma / Polytechnic, ITI, Professional course, Research / PhD
  String? highestQual;
  String? institutionType; // Government, Government-aided, Private
  bool govschool; // Studied 6-12 in Govt/Govt-aided school
  String? courseMode; // Regular, Distance / open university
  bool? firstGraduate;
  bool? hostelStay;
  bool highered;

  // Section 4: Work & income
  String? workStatus; // Employed, Self-employed, Farmer, Agricultural labourer, Daily wage, Unemployed, Homemaker, Retired, Student only
  String? employmentSector; // Government-Permanent, Government-Temporary, Private, Other
  String? govtServiceStatus; // Active, Pensioner, Family Pensioner
  String? pensionSystem; // CPS, EPF, Old Pension Scheme, None
  int? ownIncome;
  String? farmerType; // Own land, Tenant, Landless labourer
  bool? isFarming; // Currently actively farming / cultivating crops?
  List<String> cropsCultivated; // Oil seeds, Paddy, Pulses, Groundnut, Cotton, Sugarcane, Millets, Horticulture
  bool isManufacturer; // Owns or runs MSME / Manufacturing enterprise
  String? enterpriseType; // Micro, Small, Medium, None
  List<String> expenseSources; // Spouse's income, Children's income, Pension, Rent, Farming, Savings interest, Money from relatives, None
  int? otherIncome;
  String? retiredFrom; // Government, Private, Other
  bool? receivesPension;
  int? pensionAmount;

  int? familyIncome;
  String? incomeRangeBand; // under 1 lakh, 1–2.5 lakh, 2.5–5 lakh, above 5 lakh, Not sure
  bool incomeIsApproximate;

  bool govtEmployeeInFamily;
  bool taxPayer;

  // Section 5: Assets & household
  bool hasCar; // Owns personal four-wheeler
  double? landWetAcres;
  double? landDryAcres;
  bool excessLand;
  int? electricityUnitsYear;
  String? homeOwnership; // Own, Rented, None, Hut or thatched
  String? fixedAssetsBand; // under ₹1 lakh, above ₹1 lakh, Not sure

  // Section 6: Health
  int disability; // 0-100
  bool? disabilityCertAvailable;
  bool hasEyeProblem; // Eye sight problem / requires spectacles / cataract
  List<String> healthConditions; // e.g. 'Eye / Vision problem', 'Cancer', 'Kidney / Dialysis', 'Heart disease', 'TB', 'None'

  // Section 7: Additional details
  bool destitute;
  bool bplFamily;
  bool agriLabourer;
  bool welfareBoard;

  UserProfile({
    this.age,
    this.gender = 'F',
    this.district,
    this.areaType,
    this.community,
    this.marital = 'unmarried',
    this.spouseLivingWith,
    this.childrenCount,
    this.daughterUnder18,
    this.isPregnant,
    this.hasNewborn,
    this.deliveryPlace,
    this.interestedInLoan,
    this.loanType,
    this.deathCertAvailable,
    this.familyPension,
    this.depChildrenCount,
    this.separatedYears,
    this.unmarriedFamilySupport,
    this.famhead = false,
    this.rationCardHead,
    this.isTnResident,
    this.rationCardType,
    this.familyMembersCount,
    this.role,
    this.classStudied,
    this.courseType,
    this.highestQual,
    this.institutionType,
    this.govschool = false,
    this.courseMode,
    this.firstGraduate,
    this.hostelStay,
    this.highered = false,
    this.workStatus,
    this.employmentSector,
    this.govtServiceStatus,
    this.pensionSystem,
    this.ownIncome,
    this.farmerType,
    this.isFarming,
    List<String>? cropsCultivated,
    this.isManufacturer = false,
    this.enterpriseType,
    List<String>? expenseSources,
    this.otherIncome,
    this.retiredFrom,
    this.receivesPension,
    this.pensionAmount,
    this.familyIncome,
    this.incomeRangeBand,
    this.incomeIsApproximate = false,
    this.govtEmployeeInFamily = false,
    this.taxPayer = false,
    this.hasCar = false,
    this.landWetAcres,
    this.landDryAcres,
    this.excessLand = false,
    this.electricityUnitsYear,
    this.homeOwnership,
    this.fixedAssetsBand,
    this.disability = 0,
    this.disabilityCertAvailable,
    this.hasEyeProblem = false,
    List<String>? healthConditions,
    this.destitute = false,
    this.bplFamily = false,
    this.agriLabourer = false,
    this.welfareBoard = false,
  })  : cropsCultivated = cropsCultivated ?? [],
        expenseSources = expenseSources ?? [],
        healthConditions = healthConditions ?? [] {
    // Derive "self" automatically for unmarried, widowed or deserted women who say they head their household
    if (rationCardHead == null) {
      if (famhead) {
        rationCardHead = 'self';
      }
    }
    if (role == 'College student' || role == 'Higher studies') {
      highered = true;
    } else if (role == 'Completed studies' || role == 'Not studying') {
      highered = false;
    }
  }

  // Backward compatibility getter for `income`
  int? get income => familyIncome;
  set income(int? val) => familyIncome = val;

  Map<String, dynamic> toJson() {
    return {
      'age': age,
      'gender': gender,
      'district': district,
      'area_type': areaType,
      'community': community,
      'marital': marital,
      'spouse_living_with': spouseLivingWith,
      'children_count': childrenCount,
      'daughter_under_18': daughterUnder18,
      'is_pregnant': isPregnant,
      'has_newborn': hasNewborn,
      'delivery_place': deliveryPlace,
      'interested_in_loan': interestedInLoan,
      'loan_type': loanType,
      'death_cert_available': deathCertAvailable,
      'family_pension': familyPension,
      'dep_children_count': depChildrenCount,
      'separated_years': separatedYears,
      'unmarried_family_support': unmarriedFamilySupport,
      'famhead': famhead || rationCardHead == 'self',
      'ration_card_head': rationCardHead,
      'is_tn_resident': isTnResident,
      'ration_card_type': rationCardType,
      'family_members_count': familyMembersCount,
      'role': role,
      'class_studied': classStudied,
      'course_type': courseType,
      'highest_qual': highestQual,
      'institution_type': institutionType,
      'govschool': govschool,
      'course_mode': courseMode,
      'first_graduate': firstGraduate,
      'hostel_stay': hostelStay,
      'highered': highered,
      'work_status': workStatus,
      'employment_sector': employmentSector,
      'govt_service_status': govtServiceStatus,
      'pension_system': pensionSystem,
      'own_income': ownIncome,
      'farmer_type': farmerType,
      'is_farming': isFarming,
      'crops_cultivated': cropsCultivated,
      'is_manufacturer': isManufacturer,
      'enterprise_type': enterpriseType,
      'expense_sources': expenseSources,
      'other_income': otherIncome,
      'retired_from': retiredFrom,
      'receives_pension': receivesPension,
      'pension_amount': pensionAmount,
      'family_income': familyIncome,
      'income': familyIncome,
      'income_range_band': incomeRangeBand,
      'income_is_approximate': incomeIsApproximate,
      'govt_employee_in_family': govtEmployeeInFamily,
      'tax_payer': taxPayer,
      'has_car': hasCar,
      'land_wet_acres': landWetAcres,
      'land_dry_acres': landDryAcres,
      'excess_land': excessLand,
      'electricity_units_year': electricityUnitsYear,
      'home_ownership': homeOwnership,
      'fixed_assets_band': fixedAssetsBand,
      'disability': disability,
      'disability_cert_available': disabilityCertAvailable,
      'has_eye_problem': hasEyeProblem,
      'health_conditions': healthConditions,
      'destitute': destitute,
      'bpl_family': bplFamily,
      'agri_labourer': agriLabourer,
      'welfare_board': welfareBoard,
    };
  }

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    // Helper to normalize Tamil numerals (௦-௯) and numbers
    String normalizeNumerals(dynamic val) {
      if (val == null) return '';
      String s = val.toString().trim();
      const tamilDigits = {
        '௦': '0', '௧': '1', 'உ': '2', '௩': '3', '௪': '4',
        '௫': '5', '௬': '6', '௭': '7', '௮': '8', '௯': '9',
      };
      tamilDigits.forEach((ta, en) {
        s = s.replaceAll(ta, en);
      });
      // Handle Tamil shorthand numbers if user typed 'லட்சம்' / 'கோடி'
      return s;
    }

    double? parseDbl(dynamic val) {
      if (val == null) return null;
      final cleaned = normalizeNumerals(val);
      return double.tryParse(cleaned);
    }

    int? parseInt(dynamic val) {
      if (val == null) return null;
      final cleaned = normalizeNumerals(val);
      return int.tryParse(cleaned);
    }

    bool? parseBool(dynamic val) {
      if (val == null) return null;
      if (val is bool) return val;
      final s = val.toString().trim().toLowerCase();
      if (s == 'true' || s == 'yes' || s == 'ஆம்' || s == 'சரி') return true;
      if (s == 'false' || s == 'no' || s == 'இல்லை') return false;
      return null;
    }

    int? parsedAge = parseInt(json['age']);
    int? parsedIncome = parseInt(json['family_income'] ?? json['income']);

    List<String> parsedExpenses = [];
    if (json['expense_sources'] != null) {
      if (json['expense_sources'] is List) {
        parsedExpenses = (json['expense_sources'] as List).map((e) => e.toString()).toList();
      }
    }

    List<String> parsedHealthConditions = [];
    if (json['health_conditions'] != null && json['health_conditions'] is List) {
      parsedHealthConditions = (json['health_conditions'] as List).map((e) => e.toString()).toList();
    }

    List<String> parsedCrops = [];
    if (json['crops_cultivated'] != null && json['crops_cultivated'] is List) {
      parsedCrops = (json['crops_cultivated'] as List).map((e) => e.toString()).toList();
    }

    // Normalize string fields that could be entered in Tamil
    String? normalizeTamilString(dynamic val) {
      if (val == null) return null;
      final str = val.toString().trim();
      final lower = str.toLowerCase();
      // Gender
      if (str == 'பெண்' || str == 'மகளிர்' || lower == 'female' || lower == 'f') return 'F';
      if (str == 'ஆண்' || lower == 'male' || lower == 'm') return 'M';
      if (str == 'மற்றவை' || str == 'திருநங்கை' || str == 'மூன்றாம் பாலினம்' || lower == 'other' || lower == 'o') return 'O';
      // Marital
      if (str == 'திருமணம் ஆகாதவர்' || str == 'மணமாகாதவர்' || lower == 'unmarried' || lower == 'single') return 'unmarried';
      if (str == 'திருமணமானவர்' || str == 'மணம் ஆனவர்' || lower == 'married') return 'married';
      if (str == 'விதவை' || str == 'கைம்பெண்' || lower == 'widowed' || lower == 'widow') return 'widowed';
      if (str == 'கைவிடப்பட்டவர்' || str == 'விவாகரத்து' || str == 'பிரிந்தவர்' || lower == 'deserted' || lower == 'divorced') return 'deserted';
      // District (common Tamil names to standard English database district key)
      const districtMap = {
        'சென்னை': 'Chennai', 'கோவை': 'Coimbatore', 'கோயம்புத்தூர்': 'Coimbatore',
        'மதுரை': 'Madurai', 'திருச்சி': 'Tiruchirappalli', 'திருச்சிராப்பள்ளி': 'Tiruchirappalli',
        'சேலம்': 'Salem', 'ஈரோடு': 'Erode', 'திருப்பூர்': 'Tiruppur', 'நெல்லை': 'Tirunelveli',
        'திருநெல்வேலி': 'Tirunelveli', 'திண்டுக்கல்': 'Dindigul', 'தஞ்சாவூர்': 'Thanjavur',
        'வேலூர்': 'Vellore', 'கடலூர்': 'Cuddalore', 'விழுப்புரம்': 'Viluppuram',
        'நாகப்பட்டினம்': 'Nagapattinam', 'கன்னியாகுமரி': 'Kanyakumari', 'தூத்துக்குடி': 'Thoothukudi',
        'தருமபுரி': 'Dharmapuri', 'கிருஷ்ணகிரி': 'Krishnagiri', 'காஞ்சிபுரம்': 'Kanchipuram',
        'செங்கல்பட்டு': 'Chengalpattu', 'திருவள்ளூர்': 'Tiruvallur', 'திருவண்ணாமலை': 'Tiruvannamalai',
        'நாமக்கல்': 'Namakkal', 'கரூர்': 'Karur', 'நீலகிரி': 'Nilgiris', 'பெரம்பலூர்': 'Perambalur',
        'அரியலூர்': 'Ariyalur', 'புதுக்கோட்டை': 'Pudukkottai', 'சிவகங்கை': 'Sivaganga',
        'ராமநாதபுரம்': 'Ramanathapuram', 'விருதுநகர்': 'Virudhunagar', 'தேனி': 'Theni',
        'தென்காசி': 'Tenkasi', 'திருப்பத்தூர்': 'Tirupathur', 'ராணிப்பேட்டை': 'Ranipet',
        'மயிலாடுதுறை': 'Mayiladuthurai', 'திருவாரூர்': 'Tiruvarur',
      };
      if (districtMap.containsKey(str)) return districtMap[str];
      return str;
    }

    return UserProfile(
      age: parsedAge,
      gender: normalizeTamilString(json['gender']) ?? 'F',
      district: normalizeTamilString(json['district']),
      areaType: json['area_type'],
      community: json['community'],
      marital: normalizeTamilString(json['marital']) ?? 'unmarried',
      spouseLivingWith: parseBool(json['spouse_living_with']),
      childrenCount: parseInt(json['children_count']),
      daughterUnder18: parseBool(json['daughter_under_18']),
      isPregnant: parseBool(json['is_pregnant']),
      hasNewborn: parseBool(json['has_newborn']),
      deliveryPlace: json['delivery_place'],
      interestedInLoan: parseBool(json['interested_in_loan']),
      loanType: json['loan_type'],
      deathCertAvailable: parseBool(json['death_cert_available']),
      familyPension: parseBool(json['family_pension']),
      depChildrenCount: parseInt(json['dep_children_count']),
      separatedYears: json['separated_years'],
      unmarriedFamilySupport: parseBool(json['unmarried_family_support']),
      famhead: parseBool(json['famhead']) ?? false,
      rationCardHead: json['ration_card_head'] ?? json['rationCardHead'] ?? (parseBool(json['famhead']) == true ? 'self' : null),
      isTnResident: parseBool(json['is_tn_resident'] ?? json['isTnResident']),
      rationCardType: json['ration_card_type'],
      familyMembersCount: parseInt(json['family_members_count']),
      role: json['role'],
      classStudied: json['class_studied'],
      courseType: json['course_type'],
      highestQual: json['highest_qual'],
      institutionType: json['institution_type'],
      govschool: parseBool(json['govschool']) ?? false,
      courseMode: json['course_mode'],
      firstGraduate: parseBool(json['first_graduate']),
      hostelStay: parseBool(json['hostel_stay']),
      highered: parseBool(json['highered']) ?? false,
      workStatus: json['work_status'],
      employmentSector: json['employment_sector'],
      ownIncome: parseInt(json['own_income']),
      farmerType: json['farmer_type'],
      isFarming: parseBool(json['is_farming']),
      cropsCultivated: parsedCrops,
      isManufacturer: parseBool(json['is_manufacturer']) ?? false,
      enterpriseType: json['enterprise_type'],
      expenseSources: parsedExpenses,
      otherIncome: parseInt(json['other_income']),
      retiredFrom: json['retired_from'],
      receivesPension: parseBool(json['receives_pension']),
      pensionAmount: parseInt(json['pension_amount']),
      familyIncome: parsedIncome,
      incomeRangeBand: json['income_range_band'],
      incomeIsApproximate: parseBool(json['income_is_approximate']) ?? false,
      govtEmployeeInFamily: parseBool(json['govt_employee_in_family']) ?? false,
      taxPayer: parseBool(json['tax_payer']) ?? false,
      hasCar: parseBool(json['has_car']) ?? false,
      landWetAcres: parseDbl(json['land_wet_acres']),
      landDryAcres: parseDbl(json['land_dry_acres']),
      excessLand: parseBool(json['excess_land']) ?? false,
      electricityUnitsYear: parseInt(json['electricity_units_year']),
      homeOwnership: json['home_ownership'],
      fixedAssetsBand: json['fixed_assets_band'],
      disability: parseInt(json['disability']) ?? 0,
      disabilityCertAvailable: parseBool(json['disability_cert_available']),
      hasEyeProblem: parseBool(json['has_eye_problem']) ?? false,
      healthConditions: parsedHealthConditions,
      destitute: parseBool(json['destitute']) ?? false,
      bplFamily: parseBool(json['bpl_family']) ?? false,
      agriLabourer: parseBool(json['agri_labourer']) ?? false,
      welfareBoard: parseBool(json['welfare_board']) ?? false,
    );
  }

  Map<String, dynamic> toSyncPayload(String deviceId) {
    String incomeBand = incomeRangeBand ?? 'under 1 lakh';
    if (familyIncome != null) {
      if (familyIncome! < 100000) {
        incomeBand = 'under 1 lakh';
      } else if (familyIncome! <= 250000) {
        incomeBand = '1–2.5 lakh';
      } else if (familyIncome! <= 500000) {
        incomeBand = '2.5–5 lakh';
      } else {
        incomeBand = 'above 5 lakh';
      }
    }

    return {
      'deviceId': deviceId,
      'profile': {
        'age': age,
        'gender': gender,
        'incomeBand': incomeBand,
        'income': familyIncome,
        'marital': marital,
        'disability': disability,
        'role': role,
        'employmentSector': employmentSector,
        'workStatus': workStatus,
        'retiredFrom': retiredFrom,
        'receivesPension': receivesPension,
        'rationCardHead': rationCardHead,
        'isTnResident': isTnResident,
        'flags': {
          'famhead': famhead || rationCardHead == 'self',
          'govschool': govschool,
          'highered': highered,
          'destitute': destitute,
          'has_car': hasCar,
          'excess_land': excessLand,
          'govt_employee_in_family': govtEmployeeInFamily,
          'tax_payer': taxPayer,
          'bpl_family': bplFamily,
          'agri_labourer': agriLabourer,
          'welfare_board': welfareBoard,
        }
      }
    };
  }

  /// Calculates section completion metrics (e.g. "3 of 5 answered")
  Map<String, Map<String, int>> getSectionCompletionCounts() {
    int s1Filled = 0, s1Total = 5;
    if (age != null) s1Filled++;
    if (gender != null && gender!.isNotEmpty) s1Filled++;
    if (district != null && district!.isNotEmpty) s1Filled++;
    if (areaType != null && areaType!.isNotEmpty) s1Filled++;
    if (community != null && community!.isNotEmpty) s1Filled++;

    int s2Filled = 0, s2Total = 4;
    if (marital != null && marital!.isNotEmpty) s2Filled++;
    if (rationCardHead != null && rationCardHead!.isNotEmpty || famhead) s2Filled++; // counts as answered/filled
    if (rationCardType != null && rationCardType!.isNotEmpty) s2Filled++;
    if (familyMembersCount != null) s2Filled++;

    int s3Filled = 0, s3Total = 5;
    if (role != null && role!.isNotEmpty) s3Filled++;
    if (institutionType != null && institutionType!.isNotEmpty) s3Filled++;
    if (govschool) s3Filled++;
    if (firstGraduate != null) s3Filled++;
    if (hostelStay != null) s3Filled++;

    int s4Filled = 0, s4Total = 5;
    if (workStatus != null && workStatus!.isNotEmpty) s4Filled++;
    if (familyIncome != null || (incomeRangeBand != null && incomeRangeBand!.isNotEmpty)) s4Filled++;
    if (govtEmployeeInFamily) s4Filled++;
    if (taxPayer) s4Filled++;
    if (employmentSector != null || retiredFrom != null || ownIncome != null) s4Filled++;

    int s5Filled = 0, s5Total = 5;
    if (hasCar) s5Filled++;
    if (landWetAcres != null || landDryAcres != null) s5Filled++;
    if (electricityUnitsYear != null) s5Filled++;
    if (homeOwnership != null && homeOwnership!.isNotEmpty) s5Filled++;
    if (fixedAssetsBand != null && fixedAssetsBand!.isNotEmpty) s5Filled++;

    int s6Filled = 0, s6Total = 2;
    if (disability >= 0) s6Filled++;
    if (disabilityCertAvailable != null) s6Filled++;

    int s7Filled = 0, s7Total = 4;
    if (destitute) s7Filled++;
    if (bplFamily) s7Filled++;
    if (agriLabourer) s7Filled++;
    if (welfareBoard) s7Filled++;

    return {
      'Personal details': {'filled': s1Filled, 'total': s1Total},
      'Family': {'filled': s2Filled, 'total': s2Total},
      'Education': {'filled': s3Filled, 'total': s3Total},
      'Work & income': {'filled': s4Filled, 'total': s4Total},
      'Assets & household': {'filled': s5Filled, 'total': s5Total},
      'Health': {'filled': s6Filled, 'total': s6Total},
      'Additional details': {'filled': s7Filled, 'total': s7Total},
    };
  }

  /// Overall completion percentage (0 - 100)
  int calculateCompletenessPercent() {
    final counts = getSectionCompletionCounts();
    int totalFilled = 0;
    int totalQuestions = 0;

    counts.forEach((key, val) {
      totalFilled += val['filled']!;
      totalQuestions += val['total']!;
    });

    if (totalQuestions == 0) return 0;
    return ((totalFilled / totalQuestions) * 100).round();
  }

  static const String _prefKey = 'user_profile_data';

  static Future<UserProfile> loadFromPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonString = prefs.getString(_prefKey);
    if (jsonString != null && jsonString.isNotEmpty) {
      try {
        final map = jsonDecode(jsonString) as Map<String, dynamic>;
        return UserProfile.fromJson(map);
      } catch (e) {
        // Fallback default
      }
    }
    return UserProfile();
  }

  Future<bool> saveToPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonString = jsonEncode(toJson());
    return await prefs.setString(_prefKey, jsonString);
  }

  static Future<bool> clearFromPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    return await prefs.remove(_prefKey);
  }
}
