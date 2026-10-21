import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../services/dio_client.dart';
import '../services/token_storage_service.dart';
import '../models/user_profile.dart';

class AuthProvider extends ChangeNotifier {
  bool _isLoading = false;
  bool _isAuthenticated = false;
  bool _isGuestMode = false;
  bool _guestChoiceSaved = false;

  String? _userEmail;
  String? _userDisplayName;
  String? _errorMessage;
  bool _pendingGuestDataClaim = false;

  bool get isLoading => _isLoading;
  bool get isAuthenticated => _isAuthenticated;
  bool get isGuestMode => _isGuestMode;
  bool get guestChoiceSaved => _guestChoiceSaved;

  String? get userEmail => _userEmail;
  String? get userDisplayName => _userDisplayName;
  String? get errorMessage => _errorMessage;
  bool get pendingGuestDataClaim => _pendingGuestDataClaim;

  Map<String, dynamic>? get user => _isAuthenticated
      ? {
          'email': _userEmail ?? '',
          'displayName': _userDisplayName ?? '',
        }
      : null;

  static const String _prefGuestKey = 'guest_choice_saved';

  AuthProvider() {
    DioClient.setupInterceptors();
    DioClient.onUnauthorizedLogout = () {
      _logoutCleanlyState();
    };
    init();
  }

  Future<void> init() async {
    _isLoading = true;
    notifyListeners();

    try {
      final prefs = await SharedPreferences.getInstance();
      _guestChoiceSaved = prefs.getBool(_prefGuestKey) ?? false;

      final accessToken = await TokenStorageService.getAccessToken();
      if (accessToken != null && accessToken.isNotEmpty) {
        try {
          final res = await DioClient.dio.get(
            '/api/auth/me',
            options: Options(sendTimeout: const Duration(seconds: 1), receiveTimeout: const Duration(seconds: 1)),
          );
          if (res.statusCode == 200 && res.data != null) {
            _userEmail = res.data['email'];
            _userDisplayName = res.data['displayName'];
            _isAuthenticated = true;
            _isGuestMode = false;

            // Fetch and restore full profile
            final fullProfile = await ApiService.fetchFullProfile();
            if (fullProfile != null && fullProfile.isNotEmpty) {
              await prefs.setString('user_profile_data', jsonEncode(fullProfile));
            }
          } else {
            await TokenStorageService.clearTokens();
          }
        } catch (e) {
          debugPrint('Auth check on init failed: $e');
        }
      }

      if (!_isAuthenticated && _guestChoiceSaved) {
        _isGuestMode = true;
      }
    } catch (e) {
      debugPrint('AuthProvider init error: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> setGuestMode() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefGuestKey, true);
    _guestChoiceSaved = true;
    _isGuestMode = true;
    _isAuthenticated = false;
    notifyListeners();
  }

  Future<String?> signUp(
    String email,
    String password, [
    String? displayName,
  ]) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await DioClient.dio.post('/api/auth/signup', data: {
        'email': email.trim(),
        'password': password,
        'displayName': displayName?.trim() ?? '',
      });

      if (response.statusCode == 201 || response.statusCode == 200) {
        final data = response.data;
        await TokenStorageService.saveTokens(
          accessToken: data['accessToken'],
          refreshToken: data['refreshToken'],
        );

        _userEmail = data['user']?['email'] ?? email;
        _userDisplayName = data['user']?['displayName'] ?? displayName;
        _isAuthenticated = true;
        _isGuestMode = false;
        _pendingGuestDataClaim = false;

        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool(_prefGuestKey, true);

        // Seamlessly claim and migrate guest data in background without prompting
        try {
          final deviceId = await ApiService.getOrCreateDeviceId();
          await DioClient.dio.post('/api/auth/claim-guest-data', data: {'deviceId': deviceId});
        } catch (_) {}

        // Push local profile to server immediately after signup
        final localProfileStr = prefs.getString('user_profile_data');
        if (localProfileStr != null && localProfileStr.isNotEmpty) {
          try {
            final localProfile = UserProfile.fromJson(jsonDecode(localProfileStr));
            await ApiService.saveFullProfile(localProfile);
          } catch (e) {
            debugPrint('Failed to sync profile on signup: $e');
          }
        }

        return null; // Success
      }
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
        _errorMessage = 'No internet connection. Please check your network and try again.';
      } else {
        _errorMessage = e.response?.data?['error'] ?? 'Sign up failed. Please check your details.';
      }
    } catch (e) {
      _errorMessage = 'An unexpected server error occurred during signup.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
    return _errorMessage ?? 'Sign up failed.';
  }

  Future<String?> login(
    String email,
    String password,
  ) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await DioClient.dio.post('/api/auth/login', data: {
        'email': email.trim(),
        'password': password,
      });

      if (response.statusCode == 200) {
        final data = response.data;
        await TokenStorageService.saveTokens(
          accessToken: data['accessToken'],
          refreshToken: data['refreshToken'],
        );

        _userEmail = data['user']?['email'] ?? email;
        _userDisplayName = data['user']?['displayName'] ?? '';
        _isAuthenticated = true;
        _isGuestMode = false;
        _pendingGuestDataClaim = false;

        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool(_prefGuestKey, true);

        // Seamlessly claim and migrate guest data in background without prompting
        try {
          final deviceId = await ApiService.getOrCreateDeviceId();
          await DioClient.dio.post('/api/auth/claim-guest-data', data: {'deviceId': deviceId});
        } catch (_) {}

        // Fetch and restore full profile on manual login
        final fullProfile = await ApiService.fetchFullProfile();
        if (fullProfile != null && fullProfile.isNotEmpty) {
          await prefs.setString('user_profile_data', jsonEncode(fullProfile));
        } else {
          // If server profile is empty, push local profile to server to ensure it's saved
          final localProfileStr = prefs.getString('user_profile_data');
          if (localProfileStr != null && localProfileStr.isNotEmpty) {
            try {
              final localProfile = UserProfile.fromJson(jsonDecode(localProfileStr));
              await ApiService.saveFullProfile(localProfile);
            } catch (e) {
              debugPrint('Failed to sync profile on login: $e');
            }
          }
        }

        return null; // Success
      }
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
        _errorMessage = 'No internet connection. Please check your network and try again.';
      } else if (e.response?.statusCode == 429) {
        _errorMessage = 'Too many attempts, try again in 15 minutes';
      } else {
        _errorMessage = e.response?.data?['error'] ?? 'Incorrect email or password.';
      }
    } catch (e) {
      _errorMessage = 'An unexpected server error occurred.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
    return _errorMessage ?? 'Login failed.';
  }

  Future<String?> forgotPassword(String email) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await DioClient.dio.post('/api/auth/forgot-password', data: {'email': email.trim()});
      return res.data?['message'] ?? 'If this email has an account, a reset link has been sent.';
    } catch (e) {
      return 'If this email has an account, a reset link has been sent.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<String?> resetPassword(String token, String newPassword) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await DioClient.dio.post('/api/auth/reset-password', data: {
        'token': token.trim(),
        'newPassword': newPassword,
      });

      if (res.statusCode == 200) {
        return null; // Success
      }
    } on DioException catch (e) {
      _errorMessage = e.response?.data?['error'] ?? 'Failed to reset password.';
    } catch (e) {
      _errorMessage = 'Failed to reset password.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
    return _errorMessage ?? 'Failed to reset password.';
  }

  Future<Map<String, dynamic>?> claimGuestData() async {
    _pendingGuestDataClaim = false;
    notifyListeners();
    try {
      final deviceId = await ApiService.getOrCreateDeviceId();
      final res = await DioClient.dio.post('/api/auth/claim-guest-data', data: {'deviceId': deviceId});
      if (res.statusCode == 200) {
        return res.data;
      }
    } catch (e) {
      debugPrint('Claim guest data failed: $e');
    }
    return null;
  }

  void dismissGuestDataClaimPrompt() {
    _pendingGuestDataClaim = false;
    notifyListeners();
  }

  Future<String?> updateAccount({String? displayName}) async {
    try {
      final res = await DioClient.dio.patch('/api/auth/me', data: {'displayName': (displayName ?? '').trim()});
      if (res.statusCode == 200) {
        _userDisplayName = (displayName ?? '').trim();
        notifyListeners();
        return null; // Success
      }
    } on DioException catch (e) {
      return e.response?.data?['error'] ?? 'Failed to update account.';
    } catch (e) {
      return 'Failed to update account.';
    }
    return 'Failed to update account.';
  }

  Future<String?> changePassword(String currentPassword, String newPassword) async {
    _errorMessage = null;
    try {
      final res = await DioClient.dio.post('/api/auth/change-password', data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      });

      if (res.statusCode == 200) {
        return null; // Success
      }
    } on DioException catch (e) {
      return e.response?.data?['error'] ?? 'Incorrect current password.';
    } catch (e) {
      return 'Failed to change password.';
    }
    return 'Failed to change password.';
  }

  Future<void> logout({bool clearLocalData = false}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final localProfileStr = prefs.getString('user_profile_data');
      if (localProfileStr != null && localProfileStr.isNotEmpty) {
        final localProfile = UserProfile.fromJson(jsonDecode(localProfileStr));
        await ApiService.saveFullProfile(localProfile);
      }
    } catch (e) {
      debugPrint('Sync before logout error: $e');
    }

    try {
      final refreshToken = await TokenStorageService.getRefreshToken();
      if (refreshToken != null) {
        await DioClient.dio.post(
          '/api/auth/logout',
          data: {'refreshToken': refreshToken},
          options: Options(sendTimeout: const Duration(seconds: 1), receiveTimeout: const Duration(seconds: 1)),
        );
      }
    } catch (e) {
      debugPrint('Logout request error: $e');
    }
    if (clearLocalData) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('user_profile_data');
    }
    await _logoutCleanlyState();
  }

  Future<void> logoutAllDevices({bool clearLocalData = false}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final localProfileStr = prefs.getString('user_profile_data');
      if (localProfileStr != null && localProfileStr.isNotEmpty) {
        final localProfile = UserProfile.fromJson(jsonDecode(localProfileStr));
        await ApiService.saveFullProfile(localProfile);
      }
    } catch (e) {
      debugPrint('Sync before logout error: $e');
    }

    try {
      await DioClient.dio.post(
        '/api/auth/logout-all',
        options: Options(sendTimeout: const Duration(seconds: 1), receiveTimeout: const Duration(seconds: 1)),
      );
    } catch (e) {
      debugPrint('Logout-all request error: $e');
    }
    if (clearLocalData) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('user_profile_data');
    }
    await _logoutCleanlyState();
  }

  Future<String?> deleteAccount(String password) async {
    _errorMessage = null;
    try {
      final res = await DioClient.dio.delete('/api/auth/me', data: {'password': password});
      if (res.statusCode == 200) {
        await _logoutCleanlyState();
        return null; // Success
      }
    } on DioException catch (e) {
      return e.response?.data?['error'] ?? 'Incorrect password.';
    } catch (e) {
      return 'Failed to delete account.';
    }
    return 'Failed to delete account.';
  }

  Future<void> _logoutCleanlyState() async {
    await TokenStorageService.clearTokens();
    _isAuthenticated = false;
    _isGuestMode = true;
    _userEmail = null;
    _userDisplayName = null;
    _errorMessage = null;
    _pendingGuestDataClaim = false;
    notifyListeners();
  }
}
