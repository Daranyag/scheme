import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'api_service.dart';
import 'token_storage_service.dart';

class DioClient {
  static final Dio dio = Dio(
    BaseOptions(
      baseUrl: ApiService.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 120),
      sendTimeout: const Duration(seconds: 15),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ),
  );

  static VoidCallback? onUnauthorizedLogout;

  static void updateBaseUrl() {
    dio.options.baseUrl = ApiService.baseUrl;
  }

  static void setupInterceptors() {
    dio.interceptors.clear();
    dio.interceptors.add(
      QueuedInterceptorsWrapper(
        onRequest: (options, handler) async {
          options.baseUrl = ApiService.baseUrl;

          final accessToken = await TokenStorageService.getAccessToken();
          if (accessToken != null && accessToken.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $accessToken';
          }

          final deviceId = await ApiService.getOrCreateDeviceId();
          options.headers['x-device-id'] = deviceId;

          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          final isAuthEndpoint = error.requestOptions.path.contains('/api/auth/login') ||
              error.requestOptions.path.contains('/api/auth/refresh') ||
              error.requestOptions.path.contains('/api/auth/signup');

          if (error.response?.statusCode == 401 && !isAuthEndpoint) {
            final alreadyRetried = error.requestOptions.extra['retried'] == true;
            if (!alreadyRetried) {
              error.requestOptions.extra['retried'] = true;
              final refreshToken = await TokenStorageService.getRefreshToken();

              if (refreshToken != null && refreshToken.isNotEmpty) {
                try {
                  final tokenDio = Dio(BaseOptions(baseUrl: ApiService.baseUrl));
                  final refreshRes = await tokenDio.post(
                    '/api/auth/refresh',
                    data: {'refreshToken': refreshToken},
                  );

                  if (refreshRes.statusCode == 200 && refreshRes.data != null) {
                    final newAccessToken = refreshRes.data['accessToken'];
                    final newRefreshToken = refreshRes.data['refreshToken'];

                    if (newAccessToken != null && newRefreshToken != null) {
                      await TokenStorageService.saveTokens(
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                      );

                      error.requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';
                      final retryRes = await dio.fetch(error.requestOptions);
                      return handler.resolve(retryRes);
                    }
                  }
                } catch (refreshError) {
                  debugPrint('Token refresh failed: $refreshError');
                }
              }

              // Refresh failed or token missing -> clean logout
              await TokenStorageService.clearTokens();
              if (onUnauthorizedLogout != null) {
                onUnauthorizedLogout!();
              }
            }
          }

          return handler.next(error);
        },
      ),
    );
  }
}

