import 'package:flutter/material.dart';
import '../models/dashboard_summary_model.dart';
import '../models/scheme_model.dart';
import '../models/profile/profile_model.dart';
import '../services/dashboard_service.dart';
import '../services/scheme_service.dart';

class DashboardController with ChangeNotifier {
  final DashboardService _service = DashboardService();
  final SchemeService _schemeService = SchemeService();
  
  DashboardSummaryModel? summary;
  List<SchemeModel> recommendations = [];
  List<SchemeModel> recentSchemes = [];
  List<String> categories = [];
  List<String> sources = [];
  
  bool isLoading = false;
  bool isRefreshing = false;
  String? errorMessage;
  int profileCompletion = 0;

  void calculateProfileCompletion(ProfileModel? profile) {
    if (profile == null) {
      profileCompletion = 0;
      return;
    }
    
    int filled = 0;
    int total = 9; // Important fields
    
    if (profile.name.isNotEmpty) filled++;
    if (profile.email.isNotEmpty) filled++;
    if (profile.age > 0) filled++;
    if (profile.gender.isNotEmpty) filled++;
    if (profile.income > 0) filled++;
    if (profile.occupation.isNotEmpty) filled++;
    if (profile.category.isNotEmpty) filled++;
    if (profile.disabilityStatus.isNotEmpty) filled++;
    if (profile.state.isNotEmpty) filled++;
    
    profileCompletion = ((filled / total) * 100).round();
  }

  Future<void> loadDashboard() async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      await Future.wait([
        _loadSummary(),
        _loadRecommendations(),
        _loadRecentSchemes(),
        _loadCategories(),
        _loadSources(),
      ]);
    } catch (e) {
      errorMessage = 'Some dashboard information could not be loaded.';
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> _loadSummary() async {
    try {
      summary = await _service.getSummary();
    } catch (_) {}
  }

  Future<void> _loadRecommendations() async {
    try {
      recommendations = await _service.getRecommendations();
    } catch (_) {}
  }

  Future<void> _loadRecentSchemes() async {
    try {
      recentSchemes = await _service.getRecentlyUpdated();
    } catch (_) {}
  }

  Future<void> _loadCategories() async {
    try {
      categories = await _schemeService.getCategories();
    } catch (_) {}
  }

  Future<void> _loadSources() async {
    try {
      final response = await _schemeService.getSchemes(); // Mocking source fetch if no specific api
      // Just extract unique sources for now, or assume we have a getSources in scheme service
      sources = response.map((e) => e.sourceName).toSet().toList();
    } catch (_) {}
  }

  Future<void> refreshDashboard() async {
    isRefreshing = true;
    notifyListeners();
    await loadDashboard();
    isRefreshing = false;
    notifyListeners();
  }
}
