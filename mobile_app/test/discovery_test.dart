import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_app/models/discovery.dart';
import 'package:mobile_app/models/user_profile.dart';
import 'package:mobile_app/screens/dashboard_screen.dart';
import 'package:mobile_app/services/api_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Discovery System Tests', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    test('Discovery model parsing from JSON', () {
      final json = {
        '_id': 'disc-101',
        'name': 'Destitute Widow Pension',
        'nameTamil': 'ஆதரவற்ற விதவை ஓய்வூதியம்',
        'benefit': '₹1,200/month financial assistance',
        'domain': 'cra.tn.gov.in',
        'sourceUrl': 'https://cra.tn.gov.in/eleg_schemes.php',
        'confidence': 'high',
        'eligibilityStatus': 'eligible',
        'lastChecked': '2026-10-06T10:00:00.000Z',
        'seen': false,
        'notRelevant': false,
      };

      final d = Discovery.fromJson(json);
      expect(d.id, 'disc-101');
      expect(d.name, 'Destitute Widow Pension');
      expect(d.benefit, '₹1,200/month financial assistance');
      expect(d.domain, 'cra.tn.gov.in');
      expect(d.confidence, 'high');
      expect(d.eligibilityStatus, 'eligible');
      expect(d.lastChecked, '2026-10-06');
      expect(d.seen, isFalse);
    });

    test('ApiService generates and persists unique device ID', () async {
      final deviceId1 = await ApiService.getOrCreateDeviceId();
      expect(deviceId1, isNotEmpty);
      expect(deviceId1.length, 36); // UUID v4 length

      final deviceId2 = await ApiService.getOrCreateDeviceId();
      expect(deviceId2, equals(deviceId1)); // Persisted in prefs
    });

    testWidgets('DashboardScreen renders Newly Discovered section and disclaimer note', (WidgetTester tester) async {
      final profile = UserProfile(
        age: 65,
        gender: 'F',
        familyIncome: 80000,
        marital: 'widowed',
        destitute: true,
      );
      await profile.saveToPrefs();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DashboardScreen(onEditProfile: () {}),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify Newly discovered header & disclaimer text
      expect(find.text('Newly discovered for you'), findsOneWidget);
      expect(
        find.text(
          'Collected automatically from official pages and may contain errors. Confirm on the official website or at an e-Sevai centre before applying.',
        ),
        findsOneWidget,
      );

      // Verify User Profile Banner details
      expect(find.text('Active Profile'), findsOneWidget);
      expect(find.text('Age: 65'), findsOneWidget);
      expect(find.text('Gender: Female'), findsOneWidget);
      expect(find.text('Income: ₹80000'), findsOneWidget);
      expect(find.text('Marital: widowed'), findsOneWidget);
      expect(find.text('Destitute / BPL'), findsOneWidget);
    });
  });
}
