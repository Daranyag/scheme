import '../services/storage_service.dart';

class SplashController {
  final StorageService _storageService = StorageService();

  Future<bool> checkAuthStatus() async {
    await Future.delayed(const Duration(seconds: 2));
    return await _storageService.hasToken();
  }
}