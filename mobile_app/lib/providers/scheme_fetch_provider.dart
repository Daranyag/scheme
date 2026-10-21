import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';

class SchemeFetchProvider extends ChangeNotifier {
  bool _isFetching = false;
  String? _statusMessage;
  String? _errorMessage;
  int _lastAdded = 0;
  int _lastUpdated = 0;
  DateTime? _lastFetchCompletedTime;

  bool get isFetching => _isFetching;
  String? get statusMessage => _statusMessage;
  String? get errorMessage => _errorMessage;
  int get lastAdded => _lastAdded;
  int get lastUpdated => _lastUpdated;
  DateTime? get lastFetchCompletedTime => _lastFetchCompletedTime;

  Future<void> startBackgroundFetch() async {
    if (_isFetching) return;

    _isFetching = true;
    _statusMessage = 'Fetching schemes in background from tn.gov.in...';
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await http.post(
        Uri.parse('${ApiService.baseUrl}/api/data/fetch-official?limit=25'),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        _lastAdded = data['results']?['added'] ?? 0;
        _lastUpdated = data['results']?['updated'] ?? 0;
        _statusMessage = 'Fetch Complete! Added $_lastAdded new, updated $_lastUpdated schemes.';
        _lastFetchCompletedTime = DateTime.now();
      } else {
        _errorMessage = 'Fetch failed with status: ${res.statusCode}';
        _statusMessage = null;
      }
    } catch (e) {
      _errorMessage = 'Fetch error: $e';
      _statusMessage = null;
    } finally {
      _isFetching = false;
      notifyListeners();
    }
  }

  Future<void> startFetchAllSources() async {
    if (_isFetching) return;

    _isFetching = true;
    _statusMessage = 'Fetching from all official Tamil Nadu sources in background...';
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await http.post(
        Uri.parse('${ApiService.baseUrl}/api/data/fetch-all-sources'),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        _lastAdded = data['results']?['added'] ?? 0;
        _lastUpdated = data['results']?['updated'] ?? 0;
        final totalSources = data['results']?['totalSources'] ?? 0;
        _statusMessage = 'All Sources Fetched! ($totalSources sources checked). Added $_lastAdded, updated $_lastUpdated schemes.';
        _lastFetchCompletedTime = DateTime.now();
      } else {
        final data = jsonDecode(res.body);
        _errorMessage = data['error'] ?? 'Fetch failed with status: ${res.statusCode}';
        _statusMessage = null;
      }
    } catch (e) {
      _errorMessage = 'Fetch error: $e';
      _statusMessage = null;
    } finally {
      _isFetching = false;
      notifyListeners();
    }
  }

  Future<bool> startCustomSourceFetch(String targetUrl) async {
    if (_isFetching) return false;

    final trimmed = targetUrl.trim();
    if (trimmed.isEmpty) {
      _errorMessage = 'Please enter an official Tamil Nadu portal URL.';
      notifyListeners();
      return false;
    }

    // Client-side quick check
    final lower = trimmed.toLowerCase();
    final isTN = lower.contains('tn.gov.in') ||
        lower.contains('nic.in') ||
        lower.contains('cmchistn.com') ||
        lower.contains('tnagriculture.in') ||
        lower.contains('karuvoolam.tn.gov.in') ||
        lower.contains('tnesevai.tn.gov.in') ||
        lower.contains('cra.tn.gov.in') ||
        lower.contains('kmut.tn.gov.in');

    if (!isTN) {
      _errorMessage = 'Only official Tamil Nadu Government sources (*.tn.gov.in, *.nic.in, or verified TN portals) are permitted.';
      notifyListeners();
      return false;
    }

    _isFetching = true;
    _statusMessage = 'Fetching scheme from $trimmed in background...';
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await http.post(
        Uri.parse('${ApiService.baseUrl}/api/data/fetch-custom'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'targetUrl': trimmed}),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        _lastAdded = data['results']?['added'] ?? 0;
        _lastUpdated = data['results']?['updated'] ?? 0;
        _statusMessage = 'Source successfully fetched! Added $_lastAdded new, updated $_lastUpdated schemes.';
        _lastFetchCompletedTime = DateTime.now();
        return true;
      } else {
        final data = jsonDecode(res.body);
        _errorMessage = data['error'] ?? 'Fetch failed with status: ${res.statusCode}';
        _statusMessage = null;
        return false;
      }
    } catch (e) {
      _errorMessage = 'Fetch error: $e';
      _statusMessage = null;
      return false;
    } finally {
      _isFetching = false;
      notifyListeners();
    }
  }

  Future<void> autoFetchIfStale({Duration minInterval = const Duration(minutes: 30)}) async {
    if (_isFetching) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      final lastEpoch = prefs.getInt('last_auto_fetch_epoch') ?? 0;
      final nowEpoch = DateTime.now().millisecondsSinceEpoch;

      if (nowEpoch - lastEpoch < minInterval.inMilliseconds) {
        // Recently fetched; avoid overloading government servers
        return;
      }

      await prefs.setInt('last_auto_fetch_epoch', nowEpoch);
      // Run background fetch seamlessly
      startBackgroundFetch();
    } catch (_) {
      // Best effort background sync
    }
  }

  void clearStatus() {
    _statusMessage = null;
    _errorMessage = null;
    notifyListeners();
  }
}
