import 'package:dio/dio.dart';
import '../models/auth/login_request.dart';
import '../models/auth/register_request.dart';
import '../models/auth/auth_response.dart';
import 'api_service.dart';

class AuthService {
  final ApiService _apiService = ApiService();

  Future<AuthResponse> login(LoginRequest request) async {
    try {
      final response = await _apiService.client.post('/auth/login', data: request.toJson());
      return AuthResponse.fromJson(response.data);
    } on DioException catch (e) {
      if (e.response != null) {
        return AuthResponse.fromJson(e.response!.data);
      }
      return AuthResponse(success: false, message: 'Unable to connect to the server.\nPlease check your internet connection.');
    } catch (e) {
      return AuthResponse(success: false, message: 'An unexpected error occurred.');
    }
  }

  Future<AuthResponse> register(RegisterRequest request) async {
    try {
      final response = await _apiService.client.post('/auth/register', data: request.toJson());
      return AuthResponse.fromJson(response.data);
    } on DioException catch (e) {
      if (e.response != null) {
        return AuthResponse.fromJson(e.response!.data);
      }
      return AuthResponse(success: false, message: 'Unable to connect to the server.\nPlease check your internet connection.');
    } catch (e) {
      return AuthResponse(success: false, message: 'An unexpected error occurred.');
    }
  }
}