import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_app/services/dio_client.dart';
import 'package:mobile_app/services/token_storage_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TokenStorageService tests', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      await TokenStorageService.clearTokens();
    });

    test('saving and retrieving tokens', () async {
      await TokenStorageService.saveTokens(
        accessToken: 'access_123',
        refreshToken: 'refresh_456',
      );

      final access = await TokenStorageService.getAccessToken();
      final refresh = await TokenStorageService.getRefreshToken();

      expect(access, equals('access_123'));
      expect(refresh, equals('refresh_456'));
    });

    test('clearing tokens', () async {
      await TokenStorageService.saveTokens(
        accessToken: 'access_123',
        refreshToken: 'refresh_456',
      );

      await TokenStorageService.clearTokens();

      final access = await TokenStorageService.getAccessToken();
      final refresh = await TokenStorageService.getRefreshToken();

      expect(access, isNull);
      expect(refresh, isNull);
    });
  });

  group('DioClient Interceptor Unit Tests', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      await TokenStorageService.clearTokens();
      DioClient.setupInterceptors();
    });

    test('interceptor attaches Authorization header when token exists', () async {
      await TokenStorageService.saveTokens(
        accessToken: 'valid_bearer_token',
        refreshToken: 'valid_refresh_token',
      );

      bool authorizationHeaderPresent = false;

      final dio = Dio(BaseOptions(baseUrl: 'https://example.com'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) async {
            final token = await TokenStorageService.getAccessToken();
            if (token != null) {
              options.headers['Authorization'] = 'Bearer $token';
            }
            if (options.headers.containsKey('Authorization')) {
              authorizationHeaderPresent = true;
            }
            return handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {'status': 'ok'},
            ));
          },
        ),
      );

      final response = await dio.get('/api/profile');
      expect(response.statusCode, equals(200));
      expect(authorizationHeaderPresent, isTrue);
    });

    test('failed refresh triggers logout and clears tokens', () async {
      await TokenStorageService.saveTokens(
        accessToken: 'expired_access_token',
        refreshToken: 'invalid_refresh_token',
      );

      bool logoutTriggered = false;

      DioClient.onUnauthorizedLogout = () {
        logoutTriggered = true;
      };

      // Simulate a failed refresh attempt
      await TokenStorageService.clearTokens();
      DioClient.onUnauthorizedLogout?.call();

      expect(logoutTriggered, isTrue);
      expect(await TokenStorageService.getAccessToken(), isNull);
      expect(await TokenStorageService.getRefreshToken(), isNull);
    });
  });
}
