import 'dart:convert';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
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
      // Default to host machine LAN IP for physical device testing; 10.0.2.2 is only for emulators
      return 'http://10.144.174.65:3000';
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

  static const String _keyCachedSchemesJson = 'cached_schemes_json';
  static const String _keyCachedSchemesTime = 'cached_schemes_timestamp';
  static const String _keyCachedSchemesEtag = 'cached_schemes_etag';

  /// Loads bundled assets (starter-schemes.json + starter-schemes-additions.json)
  static Future<List<Scheme>> loadStarterAssets() async {
    final List<Scheme> result = [];
    try {
      final p1 = await rootBundle.loadString('assets/starter-schemes.json');
      final List<dynamic> d1 = jsonDecode(p1);
      for (var j in d1) {
        if (j is Map<String, dynamic>) {
          if (j['reviewStatus'] == 'rejected') continue;
          final s = Scheme.fromJson(j);
          if (s.name.isNotEmpty && !s.name.startsWith('Government Scheme') && s.reviewStatus != 'rejected') {
            result.add(s);
          }
        }
      }
    } catch (e) {
      debugPrint('[ApiService] Error loading starter-schemes.json asset: $e');
    }

    try {
      final p2 = await rootBundle.loadString('assets/starter-schemes-additions.json');
      final List<dynamic> d2 = jsonDecode(p2);
      for (var j in d2) {
        if (j is Map<String, dynamic>) {
          if (j['reviewStatus'] == 'rejected') continue;
          final s = Scheme.fromJson(j);
          if (s.name.isNotEmpty && !s.name.startsWith('Government Scheme') && s.reviewStatus != 'rejected') {
            result.add(s);
          }
        }
      }
    } catch (_) {}

    return result;
  }

  /// Immediately returns cached schemes from SharedPreferences, or bundled assets if no cache.
  static Future<SchemeResult> getLocalOrStarterSchemes() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedJson = prefs.getString(_keyCachedSchemesJson);
      final cachedTimeStr = prefs.getString(_keyCachedSchemesTime);

      if (cachedJson != null && cachedJson.trim().isNotEmpty) {
        try {
          final List<dynamic> raw = jsonDecode(cachedJson);
          final List<Scheme> list = [];
          for (var item in raw) {
            if (item is Map<String, dynamic>) {
              if (item['reviewStatus'] == 'rejected') continue;
              final s = Scheme.fromJson(item);
              if (s.name.isNotEmpty && !s.name.startsWith('Government Scheme') && s.reviewStatus != 'rejected') {
                list.add(s);
              }
            }
          }
          if (list.isNotEmpty) {
            DateTime? dt;
            if (cachedTimeStr != null) {
              dt = DateTime.tryParse(cachedTimeStr);
            }
            return SchemeResult(
              schemes: list,
              source: SchemeSource.deviceCache,
              lastUpdated: dt,
            );
          }
        } catch (e) {
          debugPrint('[ApiService] Error parsing cached schemes: $e');
        }
      }
    } catch (e) {
      debugPrint('[ApiService] SharedPreferences error: $e');
    }

    // First launch without server: show bundled starter data
    final starterList = await loadStarterAssets();
    if (starterList.isNotEmpty) {
      return SchemeResult(
        schemes: starterList,
        source: SchemeSource.starterAsset,
        lastUpdated: null,
      );
    }

    return SchemeResult(
      schemes: [],
      source: SchemeSource.none,
      lastUpdated: null,
    );
  }

  /// Fetches schemes from the server with 20s timeout on first load (10s on refresh),
  /// 1 automatic retry, ETag caching and gzip support.
  static Future<SchemeResult> fetchSchemesFromServer({bool isRefresh = false}) async {
    final timeout = isRefresh ? const Duration(seconds: 10) : const Duration(seconds: 20);
    SharedPreferences? prefs;
    String? etag;
    try {
      prefs = await SharedPreferences.getInstance();
      etag = prefs.getString(_keyCachedSchemesEtag);
    } catch (_) {}

    http.Response? response;
    String? lastError;

    // Up to 2 attempts (one automatic retry on failure)
    for (int attempt = 1; attempt <= 2; attempt++) {
      try {
        final headers = <String, String>{
          'Accept-Encoding': 'gzip',
        };
        if (etag != null && etag.isNotEmpty) {
          headers['If-None-Match'] = etag;
        }

        response = await http.get(
          Uri.parse('$baseUrl/api/schemes'),
          headers: headers,
        ).timeout(timeout);
        break; // Request completed
      } catch (e) {
        lastError = e.toString();
        debugPrint('[ApiService] Attempt $attempt failed: $e');
        if (attempt == 1) {
          await Future.delayed(const Duration(milliseconds: 300));
        }
      }
    }

    if (response == null) {
      return SchemeResult(
        schemes: [],
        source: SchemeSource.none,
        isError: true,
        errorMessage: lastError ?? 'Connection failed',
      );
    }

    // 304 Not Modified: Cache is up to date
    if (response.statusCode == 304) {
      final local = await getLocalOrStarterSchemes();
      final now = DateTime.now();
      if (prefs != null) {
        await prefs.setString(_keyCachedSchemesTime, now.toIso8601String());
      }
      return SchemeResult(
        schemes: local.schemes,
        source: SchemeSource.server,
        lastUpdated: now,
      );
    }

    if (response.statusCode == 200) {
      try {
        final List<dynamic> data = jsonDecode(response.body);
        final List<Scheme> schemes = [];
        for (var json in data) {
          if (json is Map<String, dynamic> && json['reviewStatus'] == 'rejected') continue;
          final scheme = Scheme.fromJson(json);
          if (scheme.name.isEmpty || scheme.name.startsWith('Government Scheme') || scheme.reviewStatus == 'rejected') {
            continue;
          }
          schemes.add(scheme);
        }

        final now = DateTime.now();
        if (prefs != null) {
          await prefs.setString(_keyCachedSchemesJson, response.body);
          await prefs.setString(_keyCachedSchemesTime, now.toIso8601String());
          final newEtag = response.headers['etag'];
          if (newEtag != null) {
            await prefs.setString(_keyCachedSchemesEtag, newEtag);
          }
        }

        return SchemeResult(
          schemes: schemes,
          source: SchemeSource.server,
          lastUpdated: now,
        );
      } catch (e) {
        return SchemeResult(
          schemes: [],
          source: SchemeSource.none,
          isError: true,
          errorMessage: 'Failed to parse schemes from server: $e',
        );
      }
    }

    return SchemeResult(
      schemes: [],
      source: SchemeSource.none,
      isError: true,
      errorMessage: 'Server returned HTTP ${response.statusCode}',
    );
  }

  /// Backwards-compatible scheme fetch
  static Future<List<Scheme>> fetchSchemes() async {
    final local = await getLocalOrStarterSchemes();
    if (local.schemes.isNotEmpty) {
      // Trigger background refresh
      fetchSchemesFromServer(isRefresh: true).catchError((e) {
        debugPrint('[ApiService] Background refresh error: $e');
        return SchemeResult(schemes: [], source: SchemeSource.none, isError: true);
      });
      return local.schemes;
    }

    final serverRes = await fetchSchemesFromServer(isRefresh: false);
    if (serverRes.schemes.isNotEmpty) {
      return serverRes.schemes;
    }
    return local.schemes;
  }

  /// Adds a scheme directly to local device cache and Dashboard, and syncs to backend server
  static Future<bool> addSchemeToDashboard(Scheme scheme) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final local = await getLocalOrStarterSchemes();
      final List<Scheme> currentList = List.from(local.schemes);

      // Check if already present by name
      final existingIndex = currentList.indexWhere((s) => s.name.trim().toLowerCase() == scheme.name.trim().toLowerCase());
      if (existingIndex >= 0) {
        currentList[existingIndex] = scheme;
      } else {
        currentList.insert(0, scheme);
      }

      final jsonList = currentList.map((s) => s.toJson()).toList();
      await prefs.setString(_keyCachedSchemesJson, jsonEncode(jsonList));
      await prefs.setString(_keyCachedSchemesTime, DateTime.now().toIso8601String());
      // Invalidate cached ETag so next server sync gets full updated list
      await prefs.remove(_keyCachedSchemesEtag);

      // Also persist to backend if accessible
      try {
        final uri = Uri.parse('$baseUrl/api/schemes');
        await http.post(
          uri,
          headers: {'Content-Type': 'application/json; charset=utf-8'},
          body: jsonEncode(scheme.toJson()),
        ).timeout(const Duration(seconds: 8));
      } catch (netErr) {
        debugPrint('[ApiService] Server sync error for scheme, saved locally: $netErr');
      }

      return true;
    } catch (e) {
      debugPrint('[ApiService] Error adding scheme to dashboard: $e');
      return false;
    }
  }
}

enum SchemeSource {
  none,
  starterAsset,
  deviceCache,
  server,
}

class SchemeResult {
  final List<Scheme> schemes;
  final SchemeSource source;
  final DateTime? lastUpdated;
  final bool isError;
  final String? errorMessage;

  SchemeResult({
    required this.schemes,
    required this.source,
    this.lastUpdated,
    this.isError = false,
    this.errorMessage,
  });
}

