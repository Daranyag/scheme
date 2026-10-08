import 'dart:convert';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/discovery.dart';
import '../models/scheme.dart';
import '../models/user_profile.dart';
import 'dio_client.dart';

class ApiService {
  static const String _serverAddressKey = 'custom_server_address';
  static String? _customServerAddress;

  static Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _customServerAddress = prefs.getString(_serverAddressKey);
  }

  static String get baseUrl {
    const envUrl = String.fromEnvironment('API_BASE_URL');
    if (envUrl.isNotEmpty) {
      return envUrl;
    }
    if (_customServerAddress != null && _customServerAddress!.trim().isNotEmpty) {
      return _customServerAddress!.trim();
    }
    if (kIsWeb) {
      return 'http://localhost:3000';
    }
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }

  static Future<void> setCustomServerAddress(String? address) async {
    final prefs = await SharedPreferences.getInstance();
    if (address == null || address.trim().isEmpty) {
      await prefs.remove(_serverAddressKey);
      _customServerAddress = null;
    } else {
      var formatted = address.trim();
      if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
        formatted = 'http://$formatted';
      }
      await prefs.setString(_serverAddressKey, formatted);
      _customServerAddress = formatted;
    }
    DioClient.updateBaseUrl();
  }

  static Future<Map<String, dynamic>> testConnection() async {
    final stopwatch = Stopwatch()..start();
    try {
      final res = await DioClient.dio.get('/api/health').timeout(const Duration(seconds: 5));
      stopwatch.stop();
      if (res.statusCode == 200) {
        return {
          'success': true,
          'durationMs': stopwatch.elapsedMilliseconds,
          'status': 200,
          'data': res.data,
        };
      }
      return {
        'success': false,
        'durationMs': stopwatch.elapsedMilliseconds,
        'status': res.statusCode,
        'errorType': 'http_error',
        'message': 'HTTP ${res.statusCode}',
      };
    } on DioException catch (e) {
      stopwatch.stop();
      String type = 'server_unreachable';
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout) {
        type = 'timeout';
      } else if (e.response?.statusCode == 429) {
        type = 'rate_limited';
      } else if (e.response?.statusCode != null) {
        type = 'http_${e.response?.statusCode}';
      }
      return {
        'success': false,
        'durationMs': stopwatch.elapsedMilliseconds,
        'errorType': type,
        'message': e.message ?? e.toString(),
      };
    } catch (e) {
      stopwatch.stop();
      return {
        'success': false,
        'durationMs': stopwatch.elapsedMilliseconds,
        'errorType': 'unknown',
        'message': e.toString(),
      };
    }
  }

  static const String _deviceIdKey = 'anonymous_device_id';

  static Future<String> getOrCreateDeviceId() async {
    final prefs = await SharedPreferences.getInstance();
    String? deviceId = prefs.getString(_deviceIdKey);
    if (deviceId == null || deviceId.isEmpty) {
      final rnd = Random.secure();
      final bytes = List<int>.generate(16, (_) => rnd.nextInt(256));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
      deviceId = '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
      await prefs.setString(_deviceIdKey, deviceId);
    }
    return deviceId;
  }

  static Future<bool> syncProfile(UserProfile profile) async {
    try {
      final deviceId = await getOrCreateDeviceId();
      final payload = profile.toSyncPayload(deviceId);

      final response = await http
          .post(
            Uri.parse('$baseUrl/api/profile/sync'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 5));

      return response.statusCode == 200;
    } catch (e) {
      debugPrint('Profile sync error: $e');
      return false;
    }
  }

  static Future<bool> saveFullProfile(UserProfile profile) async {
    try {
      final response = await DioClient.dio.post(
        '/api/profile/full',
        data: {'fullProfile': profile.toJson()},
        options: Options(sendTimeout: const Duration(seconds: 5), receiveTimeout: const Duration(seconds: 5)),
      );
      return response.statusCode == 200;
    } catch (e) {
      debugPrint('Full profile save error: $e');
      return false;
    }
  }

  static Future<Map<String, dynamic>?> fetchFullProfile() async {
    try {
      final response = await DioClient.dio.get(
        '/api/profile/full',
        options: Options(sendTimeout: const Duration(seconds: 5), receiveTimeout: const Duration(seconds: 5)),
      );

      if (response.statusCode == 200 && response.data != null) {
        final data = response.data;
        if (data['fullProfile'] != null && (data['fullProfile'] as Map).isNotEmpty) {
          return data['fullProfile'] as Map<String, dynamic>;
        }
      }
    } catch (e) {
      debugPrint('Full profile fetch error: $e');
    }
    return null;
  }

  static Future<Map<String, dynamic>> fetchDiscoveries() async {
    try {
      final deviceId = await getOrCreateDeviceId();
      final response = await http
          .get(Uri.parse('$baseUrl/api/discoveries?deviceId=$deviceId'))
          .timeout(const Duration(seconds: 4));

      if (response.statusCode == 200) {
        final map = jsonDecode(response.body);
        final List<dynamic> list = map['discoveries'] ?? [];
        final discoveries = list.map((j) => Discovery.fromJson(j)).toList();
        return {
          'discoveries': discoveries,
          'unseenCount': map['unseenCount'] ?? 0,
        };
      }
    } catch (e) {
      debugPrint('Error fetching discoveries: $e');
    }

    return {
      'discoveries': <Discovery>[],
      'unseenCount': 0,
    };
  }

  static Future<bool> dismissDiscovery(String discoveryId) async {
    try {
      final response = await http
          .post(Uri.parse('$baseUrl/api/discoveries/$discoveryId/dismiss'))
          .timeout(const Duration(seconds: 4));
      return response.statusCode == 200;
    } catch (e) {
      debugPrint('Error dismissing discovery: $e');
      return false;
    }
  }

  static Future<List<Scheme>> fetchSchemes() async {
    try {
      final response = await http
          .get(Uri.parse('$baseUrl/api/schemes'))
          .timeout(const Duration(seconds: 4));

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        final List<Scheme> schemes = [];
        for (var json in data) {
          final scheme = Scheme.fromJson(json);
          if (scheme.name.isEmpty || scheme.name.startsWith('Government Scheme')) {
            debugPrint('[WARNING] Server record missing real name (id: ${json['_id']}). Skipping record.');
            continue;
          }
          schemes.add(scheme);
        }
        return schemes;
      }
    } catch (e) {
      debugPrint('API fetch error, falling back to local schemes: $e');
    }

    // Offline / fallback starter schemes
    return getFallbackSchemes();
  }

  static List<Scheme> getFallbackSchemes() {
    final List<Map<String, dynamic>> raw = [
      {
        "name": "Kalaignar Magalir Urimai Thogai",
        "benefit": "₹1,000/month by DBT to the woman head of an eligible family.",
        "rules": { "gender": "F", "age": { "\$gte": 21 }, "famhead": true, "income": { "\$lt": 250000 } },
        "also": [
          "Family land under 5 acres wetland / 10 acres dryland",
          "Household electricity use under 3,600 units/year",
          "Only one woman per ration card",
          "Not eligible: government employees, income tax payers, owners of personal four-wheeler"
        ],
        "docs": ["Family (ration) card", "Aadhaar", "Bank passbook (Aadhaar-linked)"],
        "steps": [
          "Check the conditions above, including land and electricity limits.",
          "Apply online or at a Taluk special camp when registration is open.",
          "Keep your ration card, Aadhaar and bank details ready."
        ],
        "links": [["Official portal", "https://kmut.tn.gov.in"]]
      },
      {
        "name": "Pudhumai Penn",
        "benefit": "₹1,000/month for girls in higher education who studied Classes 6–12 in a government school.",
        "rules": { "gender": "F", "govschool": true, "highered": true },
        "also": [
          "Recognized UG, diploma, ITI or professional course",
          "Distance / open-university courses are not eligible"
        ],
        "docs": ["Aadhaar", "School transfer certificate (for your EMIS number)", "Address proof", "Bank account details"],
        "steps": [
          "Ask your school or college to register you on the scheme portal.",
          "The institution logs in and enters your details. Upload your documents.",
          "Submit and keep the acknowledgement."
        ],
        "links": [["Social Welfare Department", "https://tnsocialwelfare.tn.gov.in/en/specilisationswoman-welfare/pudhumai-penn"]]
      },
      {
        "name": "Tamil Pudhalvan",
        "benefit": "₹1,000/month for boys in higher education who studied Classes 6–12 in government schools.",
        "rules": { "gender": "M", "govschool": true, "highered": true },
        "also": [
          "Government-aided schools count if Tamil medium",
          "Private school students are not eligible"
        ],
        "docs": ["Aadhaar", "Bank account details", "School transfer certificate (Class 6–12)", "College admission proof"],
        "steps": [
          "Get your EMIS / UMIS ID from your college nodal officer.",
          "Log in to the UMIS portal with that ID and fill in the application.",
          "Upload your documents and submit."
        ],
        "links": [["UMIS portal", "https://umis.tn.gov.in"]]
      },
      {
        "name": "Old Age Pension (IGNOAPS / TN)",
        "benefit": "₹1,200/month for destitute elderly.",
        "rules": { "age": { "\$gte": 60 }, "destitute": true },
        "also": ["Belonging to a below-poverty-line family"],
        "docs": ["Aadhaar", "Age proof", "Income certificate", "Destitute affidavit", "Bank passbook"],
        "steps": [
          "Get the free application form from your e-Sevai centre or Taluk office.",
          "Attach your documents and submit.",
          "Officials verify the application (field check, then approval)."
        ],
        "links": [
          ["Official eligibility page", "https://cra.tn.gov.in/eleg_schemes.php"],
          ["e-Sevai portal", "https://www.tnesevai.tn.gov.in"]
        ]
      },
      {
        "name": "Destitute Widow Pension",
        "benefit": "₹1,200/month for destitute widows.",
        "rules": { "gender": "F", "marital": "widowed", "age": { "\$gte": 18 }, "destitute": true },
        "also": ["Fixed assets not above ₹1,00,000"],
        "docs": ["Destitute Widow Certificate (Revenue Dept)", "Husband's death certificate", "Income certificate", "Aadhaar-linked bank account"],
        "steps": [
          "Get the free application form from your e-Sevai centre or Taluk office.",
          "Attach your documents and submit.",
          "Officials verify the application."
        ],
        "links": [
          ["Official eligibility page", "https://cra.tn.gov.in/eleg_schemes.php"],
          ["e-Sevai portal", "https://www.tnesevai.tn.gov.in"]
        ]
      },
      {
        "name": "Destitute / Deserted Wives Pension",
        "benefit": "₹1,200/month for destitute deserted or divorced women.",
        "rules": { "gender": "F", "marital": "deserted", "age": { "\$gte": 30 }, "destitute": true },
        "also": ["Legally divorced or deserted for at least 5 years"],
        "docs": ["Aadhaar", "Desertion certificate / Court legal-separation decree", "Income certificate", "Bank passbook"],
        "steps": [
          "Get the free application form from your e-Sevai centre or Taluk office.",
          "Attach your documents and submit."
        ],
        "links": [["Official eligibility page", "https://cra.tn.gov.in/eleg_schemes.php"]]
      },
      {
        "name": "Unmarried Poor Women Pension",
        "benefit": "₹1,200/month for destitute unmarried women aged 50+.",
        "rules": { "gender": "F", "marital": "single", "age": { "\$gte": 50 }, "destitute": true },
        "also": ["No income from other sources and limited assets"],
        "docs": ["Aadhaar", "Unmarried certificate", "Income certificate", "Bank passbook"],
        "steps": ["Apply at your e-Sevai centre or Taluk office with documents."],
        "links": [["Official eligibility page", "https://cra.tn.gov.in/eleg_schemes.php"]]
      },
      {
        "name": "Differently Abled Pension (DAPS)",
        "benefit": "₹1,500/month for persons with 40%+ disability.",
        "rules": { "age": { "\$gte": 18 }, "disability": { "\$gte": 40 } },
        "also": ["Unemployed, or annual income not above ₹3 lakh"],
        "docs": ["Disability Certificate (40%+)", "Aadhaar", "Bank passbook"],
        "steps": ["Submit application form at e-Sevai centre or District Welfare Office for Differently Abled."],
        "links": [["Official eligibility page", "https://cra.tn.gov.in/eleg_schemes.php"]]
      },
      {
        "name": "CM Comprehensive Health Insurance (CMCHIS)",
        "benefit": "Cashless treatment cover of ₹5 lakh per family per year.",
        "rules": { "income": { "\$lt": 120000 } },
        "also": ["Your name must be on the family card"],
        "docs": ["Income certificate", "Family card", "Aadhaar"],
        "steps": [
          "Get an income certificate from VAO.",
          "Visit the CMCHIS registration centre at Collectorate with documents.",
          "Receive your smart card for cashless treatment."
        ],
        "links": [["Official CMCHIS portal", "https://www.cmchistn.com/"]]
      },
      {
        "name": "Vidiyal Payanam (Free Bus Travel)",
        "benefit": "Free travel for women in eligible government town buses.",
        "rules": { "gender": "F" },
        "also": ["Applies in government town buses"],
        "docs": [],
        "steps": ["Board eligible government town buses directly."],
        "links": []
      },
      {
        "name": "Naan Mudhalvan",
        "benefit": "Free skilling, certification and employability programme for students and youth.",
        "rules": {},
        "verify": true,
        "also": ["For students (Class 9-12 & college) and youth"],
        "docs": [],
        "steps": ["Register through your school/college or portal."],
        "links": [["Main portal", "https://naanmudhalvan.tn.gov.in"]]
      }
    ];

    return raw.map((json) => Scheme.fromJson(json)).toList();
  }
}
