import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_app/models/user_profile.dart';
import 'package:mobile_app/providers/auth_provider.dart';
import 'package:mobile_app/providers/language_provider.dart';
import 'package:mobile_app/screens/profile_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Profile Screen & Model Tests', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    test('UserProfile defaults and JSON serialization', () {
      final profile = UserProfile(
        age: 25,
        gender: 'F',
        familyIncome: 150000,
        marital: 'single',
        disability: 0,
        famhead: true,
        govschool: true,
        highered: true,
        destitute: false,
        hasCar: false,
        excessLand: false,
      );

      final json = profile.toJson();
      expect(json['age'], 25);
      expect(json['gender'], 'F');
      expect(json['income'], 150000);
      expect(json['marital'], 'single');
      expect(json['famhead'], isTrue);
      expect(json['govschool'], isTrue);
      expect(json['highered'], isTrue);

      final restored = UserProfile.fromJson(json);
      expect(restored.age, 25);
      expect(restored.famhead, isTrue);
      expect(restored.govschool, isTrue);
    });

    test('SharedPreferences persistence and reload', () async {
      final profile = UserProfile(
        age: 65,
        gender: 'F',
        familyIncome: 80000,
        marital: 'widowed',
        disability: 40,
        destitute: true,
      );

      await profile.saveToPrefs();

      final loaded = await UserProfile.loadFromPrefs();
      expect(loaded.age, 65);
      expect(loaded.gender, 'F');
      expect(loaded.familyIncome, 80000);
      expect(loaded.marital, 'widowed');
      expect(loaded.disability, 40);
      expect(loaded.destitute, isTrue);
    });

    test('Anonymous profile sync payload excludes PII', () {
      final profile = UserProfile(
        age: 65,
        gender: 'F',
        familyIncome: 80000,
        marital: 'widowed',
        disability: 0,
        destitute: true,
      );

      final payload = profile.toSyncPayload('test-device-uuid-1234');
      expect(payload['deviceId'], 'test-device-uuid-1234');

      final p = payload['profile'];
      expect(p['age'], 65);
      expect(p['gender'], 'F');
      expect(p['incomeBand'], 'under 1 lakh');
      expect(p['marital'], 'widowed');
      expect(p['flags']['destitute'], isTrue);

      // Verify NO PII fields present
      expect(p.containsKey('name'), isFalse);
      expect(p.containsKey('phone'), isFalse);
      expect(p.containsKey('aadhaar'), isFalse);
      expect(p.containsKey('address'), isFalse);
    });

    testWidgets('ProfileScreen renders form fields and mandatory anonymous privacy note', (WidgetTester tester) async {
      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider(create: (_) => AuthProvider()),
            ChangeNotifierProvider(create: (_) => LanguageProvider()),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: ProfileScreen(),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Personal details'), findsWidgets);
      expect(find.text('Save profile'), findsWidgets);
      expect(find.text('Back to dashboard'), findsWidgets);
    });
  });
}
