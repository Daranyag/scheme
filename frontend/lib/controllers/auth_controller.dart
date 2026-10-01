import 'package:flutter/material.dart';
import '../models/auth/login_request.dart';
import '../models/auth/register_request.dart';
import '../services/auth_service.dart';
import '../services/storage_service.dart';

class AuthController extends ChangeNotifier {
  final AuthService _authService = AuthService();
  final StorageService _storageService = StorageService();

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  Future<bool> login(String email, String password, Function(String) onError) async {
    _isLoading = true;
    notifyListeners();

    final response = await _authService.login(LoginRequest(email: email, password: password));
    
    _isLoading = false;
    notifyListeners();

    if (response.success && response.token != null) {
      await _storageService.saveToken(response.token!);
      return true;
    } else {
      onError(response.message);
      return false;
    }
  }

  Future<bool> register(RegisterRequest request, Function(String) onError) async {
    _isLoading = true;
    notifyListeners();

    final response = await _authService.register(request);
    
    _isLoading = false;
    notifyListeners();

    if (response.success && response.token != null) {
      await _storageService.saveToken(response.token!);
      return true;
    } else {
      onError(response.message);
      return false;
    }
  }

  Future<void> logout() async {
    await _storageService.removeToken();
    notifyListeners();
  }
}