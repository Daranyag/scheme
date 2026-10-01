import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import '../models/scheme_model.dart';
import '../utils/constants.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SchemeService {
  late Dio _dio;

  SchemeService() {
    _dio = Dio(BaseOptions(
      baseUrl: dotenv.env['API_BASE_URL'] ?? 'http://localhost:5000/api',
    ));
    
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final prefs = await SharedPreferences.getInstance();
        final token = prefs.getString(AppConstants.tokenKey);
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
    ));
  }

  Future<List<SchemeModel>> getSchemes({String? category, String? search}) async {
    try {
      final queryParams = <String, dynamic>{};
      if (category != null && category.isNotEmpty) queryParams['category'] = category;
      if (search != null && search.isNotEmpty) queryParams['search'] = search;

      final response = await _dio.get('/schemes', queryParameters: queryParams);
      if (response.data['success']) {
        return (response.data['data'] as List)
            .map((e) => SchemeModel.fromJson(e))
            .toList();
      }
      return [];
    } catch (e) {
      throw Exception('Failed to load schemes: ${e.toString()}');
    }
  }

  Future<SchemeModel> getSchemeById(String id) async {
    try {
      final response = await _dio.get('/schemes/$id');
      if (response.data['success']) {
        return SchemeModel.fromJson(response.data['data']);
      }
      throw Exception('Scheme not found');
    } catch (e) {
      throw Exception('Failed to load scheme: ${e.toString()}');
    }
  }

  Future<List<String>> getCategories() async {
    try {
      final response = await _dio.get('/schemes/categories');
      if (response.data['success']) {
        return List<String>.from(response.data['data']);
      }
      return [];
    } catch (e) {
      throw Exception('Failed to load categories: ${e.toString()}');
    }
  }

  Future<void> refreshSchemes() async {
    try {
      await _dio.post('/schemes/refresh');
    } catch (e) {
      throw Exception('Failed to refresh schemes: ${e.toString()}');
    }
  }
}
