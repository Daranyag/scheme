import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_app/main.dart';
import 'package:mobile_app/providers/auth_provider.dart';
import 'package:mobile_app/providers/language_provider.dart';

import 'package:flutter/services.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (MethodCall call) async {
      return null;
    });
  });

  testWidgets('App loads MainScreen with navigation tabs when guest choice saved', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({'guest_choice_saved': true});

    final authProvider = AuthProvider();
    await authProvider.init();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>.value(value: authProvider),
          ChangeNotifierProvider(create: (_) => LanguageProvider()),
        ],
        child: const MyApp(),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(MainScreen), findsOneWidget);
    expect(find.text('TN Schemes Finder'), findsOneWidget);
    expect(find.text('Dashboard'), findsOneWidget);
    expect(find.text('My Profile'), findsOneWidget);
    expect(find.text('Scheme Finder'), findsOneWidget);
    expect(find.text('AI Chat'), findsOneWidget);

    await tester.tap(find.text('My Profile'));
    await tester.pumpAndSettle();

    expect(find.text('Personal details'), findsWidgets);
  });
}

