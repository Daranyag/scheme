import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_app/screens/chat_screen.dart';
import 'package:mobile_app/screens/finder_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Finder & Chat Screen Tests', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    testWidgets('FinderScreen renders tab bar and file upload controls', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: FinderScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('AI Scheme & Document Finder'), findsOneWidget);
      expect(find.text('Upload File'), findsOneWidget);
      expect(find.text('Link / Text'), findsOneWidget);
      expect(find.text('Select PDF or Image (JPG/PNG)'), findsOneWidget);
      expect(find.text('Analyze Eligibility'), findsOneWidget);
    });

    testWidgets('ChatScreen renders quick prompts and input bar', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ChatScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('What schemes am I eligible for?'), findsOneWidget);
      expect(find.text('Documents needed for Old Age Pension'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
    });
  });
}
