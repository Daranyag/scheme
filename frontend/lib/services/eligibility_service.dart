import 'package:dio/dio.dart';
import '../models/eligibility/eligibility_result_model.dart';
import 'api_service.dart';

class EligibilityService {
  final ApiService _apiService = ApiService();

  Future<EligibilityResultModel> checkEligibility(String schemeId) async {
    try {
      final response = await _apiService.client.post('/eligibility/check', data: {'schemeId': schemeId});
      if (response.data['success']) {
        return EligibilityResultModel.fromJson(response.data['data']);
      } else {
        throw Exception(response.data['message']);
      }
    } on DioException catch (e) {
      throw Exception(e.response?.data['message'] ?? 'Failed to check eligibility');
    }
  }
}
