import 'package:flutter/material.dart';
import '../models/eligibility/eligibility_result_model.dart';
import '../services/eligibility_service.dart';

class EligibilityController extends ChangeNotifier {
  final EligibilityService _eligibilityService = EligibilityService();
  
  bool _isLoading = false;
  EligibilityResultModel? _result;
  String? _errorMessage;

  bool get isLoading => _isLoading;
  EligibilityResultModel? get result => _result;
  String? get errorMessage => _errorMessage;

  Future<void> checkEligibility(String schemeId) async {
    _isLoading = true;
    _errorMessage = null;
    _result = null;
    notifyListeners();

    try {
      _result = await _eligibilityService.checkEligibility(schemeId);
    } catch (e) {
      _errorMessage = e.toString().replaceAll('Exception: ', '');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void clearResult() {
    _result = null;
    _errorMessage = null;
    notifyListeners();
  }
}
