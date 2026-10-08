import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LanguageProvider extends ChangeNotifier {
  String _currentLanguage = 'en';

  String get currentLanguage => _currentLanguage;
  bool get isTamil => _currentLanguage == 'ta';

  LanguageProvider() {
    _loadLanguage();
  }

  Future<void> _loadLanguage() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _currentLanguage = prefs.getString('app_language') ?? 'en';
      notifyListeners();
    } catch (e) {
      debugPrint('Error loading language: $e');
    }
  }

  Future<void> toggleLanguage() async {
    _currentLanguage = _currentLanguage == 'en' ? 'ta' : 'en';
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('app_language', _currentLanguage);
    } catch (e) {
      debugPrint('Error saving language: $e');
    }
  }

  Future<void> setLanguage(String langCode) async {
    if (_currentLanguage != langCode) {
      _currentLanguage = langCode;
      notifyListeners();
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('app_language', _currentLanguage);
      } catch (e) {
        debugPrint('Error saving language: $e');
      }
    }
  }
}
