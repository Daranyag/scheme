import 'package:flutter/material.dart';
import '../models/profile/profile_model.dart';
import '../services/profile_service.dart';

class ProfileController extends ChangeNotifier {
  final ProfileService _profileService = ProfileService();
  
  ProfileModel? _profile;
  bool _isLoading = false;
  bool _isSaving = false;
  String? _errorMessage;

  ProfileModel? get profile => _profile;
  bool get isLoading => _isLoading;
  bool get isSaving => _isSaving;
  String? get errorMessage => _errorMessage;

  Future<void> loadProfile({bool force = false}) async {
    if (_profile != null && !force) return;
    
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _profile = await _profileService.getProfile();
    } catch (e) {
      _errorMessage = e.toString().replaceAll('Exception: ', '');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> updateProfile(ProfileModel updatedProfile, Function(String) onError) async {
    _isSaving = true;
    notifyListeners();

    try {
      _profile = await _profileService.updateProfile(updatedProfile);
      _isSaving = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isSaving = false;
      notifyListeners();
      onError(e.toString().replaceAll('Exception: ', ''));
      return false;
    }
  }
  
  void clearProfile() {
    _profile = null;
    notifyListeners();
  }
}
