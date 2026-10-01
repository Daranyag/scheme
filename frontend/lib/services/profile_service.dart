import 'package:dio/dio.dart';
import '../models/profile/profile_model.dart';
import 'api_service.dart';

class ProfileService {
  final ApiService _apiService = ApiService();

  Future<ProfileModel> getProfile() async {
    try {
      final response = await _apiService.client.get('/auth/me');
      if (response.data['success']) {
        return ProfileModel.fromJson(response.data['data']['user']);
      } else {
        throw Exception(response.data['message']);
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        throw Exception('Session expired. Please login again.');
      }
      throw Exception(e.response?.data['message'] ?? 'Unable to connect to the server. Please try again.');
    }
  }

  Future<ProfileModel> updateProfile(ProfileModel profile) async {
    try {
      final response = await _apiService.client.put('/auth/profile', data: profile.toJson());
      if (response.data['success']) {
        return ProfileModel.fromJson(response.data['data']['user']);
      } else {
        throw Exception(response.data['message']);
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        throw Exception('Session expired. Please login again.');
      }
      throw Exception(e.response?.data['message'] ?? 'Unable to connect to the server. Please try again.');
    }
  }
}
