import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/models/scheme.dart';
import 'package:mobile_app/models/user_profile.dart';
import 'package:mobile_app/screens/scheme_detail_screen.dart';
import 'package:mobile_app/services/rule_engine.dart';
import 'package:mobile_app/widgets/verification_badge.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final profile = UserProfile(
    age: 65,
    gender: 'F',
    familyIncome: 80000,
    marital: 'widow',
    destitute: true,
  );

  final List<Map<String, dynamic>> rawSchemes = [
    {
      "name": "Indira Gandhi National Old Age Pension Scheme (IGNOAPS)",
      "nameTamil": "இந்திரா காந்தி தேசிய முதியோர் ஓய்வூதியத் திட்டம்",
      "category": "Pension",
      "benefit": "Monthly pension of ₹1,000 deposited directly into the beneficiary bank account.",
      "status": "active",
      "verify": false,
      "rules": {"age": {"\$gte": 65}, "income": {"\$lt": 100000}, "destitute": true},
      "unmappedCriteria": ["Must not be receiving any other government pension."],
      "requiredDocuments": ["Aadhaar Card", "Ration Card", "Age Proof", "Income Certificate", "Bank Passbook"],
      "howToApply": [
        "Visit nearest e-Sevai centre or Revenue Inspector / Village Administrative Officer (VAO).",
        "Fill out IGNOAPS application form with age and income details.",
        "Attach required copies of Aadhaar, Income Certificate, and Bank details.",
        "Application is verified by Revenue Dept and sanctioned by Tahsildar."
      ],
      "officialLinks": [
        {"title": "TN e-Sevai Portal", "url": "https://www.tnesevai.tn.gov.in", "isWorking": true}
      ]
    },
    {
      "name": "Chief Minister's Comprehensive Health Insurance Scheme (CMCHIS)",
      "nameTamil": "முதலமைச்சரின் விரிவான மருத்துவக் காப்பீட்டுத் திட்டம்",
      "category": "Health",
      "benefit": "Cashless health insurance coverage up to ₹5,000,000 per family per year for empanelled procedures.",
      "status": "active",
      "verify": false,
      "rules": {"income": {"\$lt": 120000}},
      "unmappedCriteria": ["Family must be listed in Tamil Nadu Smart Ration Card database."],
      "requiredDocuments": ["Smart Ration Card", "Aadhaar Card of all family members", "Income Certificate"],
      "howToApply": [
        "Visit district collectorate or empanelled government hospital kiosk.",
        "Produce Smart Ration Card for verification.",
        "Enroll biometrics and receive CMCHIS e-card."
      ],
      "officialLinks": [
        {"title": "Official CMCHIS Portal", "url": "https://www.cmchistn.com", "isWorking": true}
      ]
    },
    {
      "name": "Naan Mudhalvan Skill Development Scheme",
      "nameTamil": "நான் முதல்வன் திறன் மேம்பாட்டுத் திட்டம்",
      "category": "Education",
      "benefit": "Free skill training, industry certifications, and placement guidance for TN youth and jobseekers.",
      "status": "active",
      "verify": true,
      "rules": {},
      "unmappedCriteria": ["Enrolled students or jobseekers residing in Tamil Nadu."],
      "requiredDocuments": ["Educational Certificates", "Aadhaar Card", "Residence Proof"],
      "howToApply": [
        "Register online on naanmudhalvan.tn.gov.in.",
        "Select preferred skill training track or college module.",
        "Complete course requirements and assessment."
      ],
      "officialLinks": [
        {"title": "Naan Mudhalvan Portal", "url": "https://naanmudhalvan.tn.gov.in", "isWorking": true}
      ]
    }
  ];

  final schemes = rawSchemes.map((json) => Scheme.fromJson(json)).toList();

  final outputDir = Directory(
      r'C:\Users\mohan prasath kg\.gemini\antigravity-ide\brain\4790f9a7-cf8b-4b6f-9137-901776485cbd');

  Future<void> captureWidget(
      WidgetTester tester, Widget widget, String filename, Size size) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    final GlobalKey repaintKey = GlobalKey();

    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorSchemeSeed: Colors.indigo,
        ),
        home: RepaintBoundary(
          key: repaintKey,
          child: widget,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    final RenderRepaintBoundary boundary =
        repaintKey.currentContext!.findRenderObject() as RenderRepaintBoundary;

    await tester.runAsync(() async {
      final ui.Image image = await boundary.toImage(pixelRatio: 2.0);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      final buffer = byteData!.buffer.asUint8List();

      final file = File('${outputDir.path}/$filename');
      await file.writeAsBytes(buffer);
      print('SAVED SCREENSHOT: ${file.path}');
    });
  }

  Widget _buildSchemeCardMock(Scheme scheme, RuleEvaluationResult eval, Color statusColor) {
    final bool isEligible = eval.status == EligibilityStatus.eligible;
    final String tagText = isEligible ? 'Eligible' : 'Possibly eligible — verify';

    return Card(
      elevation: 2,
      margin: const EdgeInsets.only(bottom: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Flexible(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.indigo.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      scheme.category.toUpperCase(),
                      style: const TextStyle(
                        color: Colors.indigo,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
                VerificationBadge(scheme: scheme, isCompact: true),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              scheme.name,
              maxLines: 3,
              softWrap: true,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, height: 1.25),
            ),
            if (scheme.nameTamil.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                scheme.nameTamil,
                maxLines: 2,
                softWrap: true,
                style: const TextStyle(fontSize: 14, color: Colors.black54, fontWeight: FontWeight.w500),
              ),
            ],
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(isEligible ? Icons.check_circle : Icons.help_outline, size: 14, color: statusColor),
                  const SizedBox(width: 4),
                  Flexible(child: Text(tagText, style: TextStyle(color: statusColor, fontWeight: FontWeight.bold, fontSize: 12))),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Text(scheme.benefit, style: const TextStyle(fontSize: 14, height: 1.4, color: Colors.black87)),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: null,
              icon: const Icon(Icons.arrow_forward, size: 16),
              label: const Text('View details & how to apply'),
            ),
          ],
        ),
      ),
    );
  }

  Widget buildDashboardMock(BuildContext context) {
    final oapEval = RuleEngine.evaluate(schemes[0], profile);
    final cmchisEval = RuleEngine.evaluate(schemes[1], profile);
    final nmEval = RuleEngine.evaluate(schemes[2], profile);

    return Scaffold(
      appBar: AppBar(
        title: const Text('TN Schemes & Pensions Finder'),
        backgroundColor: Colors.indigo.shade100,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // User Profile Summary Card
            Card(
              color: Colors.indigo.shade50,
              elevation: 0,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              child: const Padding(
                padding: EdgeInsets.all(14.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Active Profile', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    SizedBox(height: 6),
                    Text('Age: 65  •  Gender: Female  •  Income: ₹80,000'),
                    SizedBox(height: 2),
                    Text('Marital: Widow  •  Destitute / BPL: Yes'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Fully Eligible Section
            Row(
              children: const [
                Icon(Icons.check_circle, color: Colors.green),
                SizedBox(width: 8),
                Expanded(child: Text('Eligible Schemes (2)', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
              ],
            ),
            const SizedBox(height: 10),
            _buildSchemeCardMock(schemes[0], oapEval, Colors.green),
            _buildSchemeCardMock(schemes[1], cmchisEval, Colors.green),

            const SizedBox(height: 20),

            // Possibly Eligible Section
            Row(
              children: const [
                Icon(Icons.help_outline, color: Colors.orange),
                SizedBox(width: 8),
                Expanded(child: Text('Possibly Eligible — Verify (1)', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
              ],
            ),
            const SizedBox(height: 10),
            _buildSchemeCardMock(schemes[2], nmEval, Colors.orange),
          ],
        ),
      ),
    );
  }

  testWidgets('Generate Screenshots for Dashboard & Details Screens', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    await profile.saveToPrefs();

    // 1. Dashboard Screen
    await captureWidget(
      tester,
      Builder(builder: (context) => buildDashboardMock(context)),
      'dashboard_screenshot.png',
      const Size(412, 1000),
    );

    // 2. Old Age Pension Details Screen
    final oapScheme = schemes[0];
    final oapEval = RuleEngine.evaluate(oapScheme, profile);
    await captureWidget(
      tester,
      SchemeDetailScreen(scheme: oapScheme, evaluation: oapEval),
      'oap_detail_screenshot.png',
      const Size(412, 1100),
    );

    // 3. CMCHIS Details Screen
    final cmchisScheme = schemes[1];
    final cmchisEval = RuleEngine.evaluate(cmchisScheme, profile);
    await captureWidget(
      tester,
      SchemeDetailScreen(scheme: cmchisScheme, evaluation: cmchisEval),
      'cmchis_detail_screenshot.png',
      const Size(412, 1100),
    );

    // 4. Naan Mudhalvan Details Screen
    final nmScheme = schemes[2];
    final nmEval = RuleEngine.evaluate(nmScheme, profile);
    await captureWidget(
      tester,
      SchemeDetailScreen(scheme: nmScheme, evaluation: nmEval),
      'naan_mudhalvan_detail_screenshot.png',
      const Size(412, 1100),
    );
  });
}
