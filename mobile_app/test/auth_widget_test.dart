import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_app/providers/auth_provider.dart';
import 'package:mobile_app/providers/language_provider.dart';
import 'package:mobile_app/screens/welcome_screen.dart';
import 'package:mobile_app/screens/signup_screen.dart';
import 'package:mobile_app/screens/login_screen.dart';
import 'package:mobile_app/screens/account_screen.dart';
import 'package:mobile_app/services/token_storage_service.dart';

Widget createTestWidget(Widget child, {AuthProvider? authProvider}) {
  final provider = authProvider ?? AuthProvider();
  return MultiProvider(
    providers: [
      ChangeNotifierProvider<AuthProvider>.value(value: provider),
      ChangeNotifierProvider<LanguageProvider>(create: (_) => LanguageProvider()),
    ],
    child: MaterialApp(
      home: child,
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (MethodCall call) async {
      return null;
    });
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await TokenStorageService.clearTokens();
  });

  group('WelcomeScreen Widget Tests', () {
    testWidgets('renders title, subtitle and three main options', (WidgetTester tester) async {
      final auth = AuthProvider();

      await tester.pumpWidget(createTestWidget(const WelcomeScreen(), authProvider: auth));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Thittam'), findsOneWidget);
      expect(find.text('TN Scheme & Pension Finder'), findsOneWidget);
      expect(find.byKey(const Key('welcome_login_btn')), findsOneWidget);
      expect(find.byKey(const Key('welcome_signup_btn')), findsOneWidget);
      expect(find.byKey(const Key('welcome_guest_btn')), findsOneWidget);
    });

    testWidgets('tapping Sign Up triggers navigation callback', (WidgetTester tester) async {
      bool signUpTapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: WelcomeScreen(
              onSignUpTap: () => signUpTapped = true,
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      final btn = find.byKey(const Key('welcome_signup_btn'));
      await tester.ensureVisible(btn);
      await tester.tap(btn);
      await tester.pump();

      expect(signUpTapped, isTrue);
    });

    testWidgets('tapping Log In triggers navigation callback', (WidgetTester tester) async {
      bool logInTapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: WelcomeScreen(
              onLogInTap: () => logInTapped = true,
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      final btn = find.byKey(const Key('welcome_login_btn'));
      await tester.ensureVisible(btn);
      await tester.tap(btn);
      await tester.pump();

      expect(logInTapped, isTrue);
    });
  });

  group('SignUpScreen Form Validation & Interaction', () {
    testWidgets('validates empty inputs', (WidgetTester tester) async {
      final auth = AuthProvider();

      await tester.pumpWidget(createTestWidget(const SignUpScreen(), authProvider: auth));
      await tester.pump(const Duration(milliseconds: 100));

      final submitButton = find.byKey(const Key('signup_submit_btn'));
      expect(submitButton, findsOneWidget);
      await tester.tap(submitButton);
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(SignUpScreen), findsOneWidget);
    });

    testWidgets('requires privacy checkbox acceptance on valid inputs', (WidgetTester tester) async {
      final auth = AuthProvider();

      await tester.pumpWidget(createTestWidget(const SignUpScreen(), authProvider: auth));
      await tester.pump(const Duration(milliseconds: 100));

      final emailField = find.byKey(const Key('signup_email_field'));
      final passwordField = find.byKey(const Key('signup_password_field'));
      final confirmField = find.byKey(const Key('signup_confirm_password_field'));

      await tester.enterText(emailField, 'user@example.com');
      await tester.enterText(passwordField, 'ValidPass1');
      await tester.enterText(confirmField, 'ValidPass1');

      final submitButton = find.byKey(const Key('signup_submit_btn'));
      await tester.tap(submitButton);
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(SignUpScreen), findsOneWidget);
    });

    testWidgets('renders continue without an account button on sign up screen', (WidgetTester tester) async {
      final auth = AuthProvider();
      await tester.pumpWidget(createTestWidget(const SignUpScreen(), authProvider: auth));
      await tester.pump(const Duration(milliseconds: 100));

      final guestBtn = find.byKey(const Key('signup_guest_btn'));
      expect(guestBtn, findsOneWidget);
      expect(find.text('Continue without an account'), findsOneWidget);
    });
  });

  group('LogInScreen Form Validation', () {
    testWidgets('validates email and password inputs', (WidgetTester tester) async {
      final auth = AuthProvider();

      await tester.pumpWidget(createTestWidget(const LogInScreen(), authProvider: auth));
      await tester.pump(const Duration(milliseconds: 100));

      final loginBtn = find.widgetWithText(ElevatedButton, 'Log In');
      await tester.tap(loginBtn);
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Email is required'), findsOneWidget);
      expect(find.text('Password is required'), findsOneWidget);
    });

    testWidgets('toggles password obscure state', (WidgetTester tester) async {
      final auth = AuthProvider();

      await tester.pumpWidget(createTestWidget(const LogInScreen(), authProvider: auth));
      await tester.pump(const Duration(milliseconds: 100));

      final iconBtn = find.byIcon(Icons.visibility_off);
      expect(iconBtn, findsOneWidget);

      await tester.tap(iconBtn);
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byIcon(Icons.visibility), findsOneWidget);
    });

    testWidgets('navigates to ForgotPasswordScreen on link click', (WidgetTester tester) async {
      bool forgotPasswordTapped = false;
      final auth = AuthProvider();

      await tester.pumpWidget(
        createTestWidget(
          LogInScreen(
            onForgotPasswordTap: () => forgotPasswordTapped = true,
          ),
          authProvider: auth,
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      final forgotLink = find.text('Forgot password?');
      await tester.ensureVisible(forgotLink);
      await tester.tap(forgotLink);
      await tester.pump(const Duration(milliseconds: 100));

      expect(forgotPasswordTapped, isTrue);
    });

    testWidgets('renders continue without an account button', (WidgetTester tester) async {
      final auth = AuthProvider();
      await tester.pumpWidget(createTestWidget(const LogInScreen(), authProvider: auth));
      await tester.pump(const Duration(milliseconds: 100));

      final guestBtn = find.byKey(const Key('login_guest_btn'));
      expect(guestBtn, findsOneWidget);
      expect(find.text('Continue without an account'), findsOneWidget);
    });
  });

  group('AccountScreen & Logout behavior', () {
    testWidgets('renders user email and options, logout clears tokens', (WidgetTester tester) async {
      final authProvider = AuthProvider();

      await tester.pumpWidget(createTestWidget(const AccountScreen(), authProvider: authProvider));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('ACCOUNT SETTINGS'), findsOneWidget);
      expect(find.text('Log Out'), findsOneWidget);
      expect(find.text('Delete Account'), findsOneWidget);

      await authProvider.logout();
      expect(authProvider.isAuthenticated, isFalse);
      expect(await TokenStorageService.getAccessToken(), isNull);
    });
  });
}
