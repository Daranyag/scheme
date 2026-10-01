import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import '../models/dashboard_summary_model.dart';
import '../models/scheme_model.dart';
import '../utils/constants.dart';
import 'package:shared_preferences/shared_preferences.dart';

class DashboardService {
  late Dio _dio;

  DashboardService() {
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

  Future<DashboardSummaryModel> getSummary() async {
    try {
      final response = await _dio.get('/dashboard/summary');
      if (response.data['success']) {
        return DashboardSummaryModel.fromJson(response.data['data']);
      }
      throw Exception('Failed to load summary');
    } catch (e) {
      throw Exception('Failed to load summary: ${e.toString()}');
    }
  }

  Future<List<SchemeModel>> getRecommendations() async {
    try {
      final response = await _dio.get('/dashboard/recommendations');
      if (response.data['success']) {
        return (response.data['data'] as List).map((e) {
          // You could parse relevanceReasons here if you added it to SchemeModel,
          // for simplicity we use the base model.
          return SchemeModel.fromJson(e);
        }).toList();
      }
      return [];
    } catch (e) {
      throw Exception('Failed to load recommendations: ${e.toString()}');
    }
  }

  Future<List<SchemeModel>> getRecentlyUpdated() async {
    try {
      final response = await _dio.get('/dashboard/recent');
      if (response.data['success']) {
        return (response.data['data'] as List).map((e) => SchemeModel.fromJson(e)).toList();
      }
      return [];
    } catch (e) {
      throw Exception('Failed to load recent schemes: ${e.toString()}');
    }
  }
}
