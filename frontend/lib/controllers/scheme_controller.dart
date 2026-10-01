import 'package:flutter/material.dart';
import '../models/scheme_model.dart';
import '../services/scheme_service.dart';

class SchemeController with ChangeNotifier {
  final SchemeService _service = SchemeService();
  
  List<SchemeModel> schemes = [];
  List<String> categories = [];
  String? selectedCategory;
  String searchQuery = '';
  
  bool isLoading = false;
  bool isRefreshing = false;
  String? errorMessage;
  DateTime? lastUpdated;

  Future<void> loadCategories() async {
    try {
      categories = await _service.getCategories();
      notifyListeners();
    } catch (e) {
      // Ignore category load error silently or log
    }
  }

  Future<void> loadSchemes() async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      schemes = await _service.getSchemes(category: selectedCategory, search: searchQuery);
      if (categories.isEmpty) {
        await loadCategories();
      }
      lastUpdated = DateTime.now();
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshSchemes() async {
    isRefreshing = true;
    notifyListeners();
    try {
      await _service.refreshSchemes();
      await loadSchemes();
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isRefreshing = false;
      notifyListeners();
    }
  }

  void setSearchQuery(String query) {
    searchQuery = query;
    loadSchemes();
  }

  void setCategory(String? category) {
    selectedCategory = category;
    loadSchemes();
  }

  Future<SchemeModel> getSchemeById(String id) async {
    return await _service.getSchemeById(id);
  }
}
