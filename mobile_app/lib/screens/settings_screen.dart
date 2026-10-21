import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/language_provider.dart';
import '../providers/scheme_fetch_provider.dart';
import 'privacy_note_dialog.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _autoFetchSchemes = true;
  bool _highContrast = false;
  bool _largeText = false;
  bool _offlineCacheEnabled = true;
  bool _notificationsEnabled = true;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _autoFetchSchemes = prefs.getBool('setting_auto_fetch') ?? true;
      _highContrast = prefs.getBool('setting_high_contrast') ?? false;
      _largeText = prefs.getBool('setting_large_text') ?? false;
      _offlineCacheEnabled = prefs.getBool('setting_offline_cache') ?? true;
      _notificationsEnabled = prefs.getBool('setting_notifications') ?? true;
    });
  }

  Future<void> _saveBool(String key, bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, value);
  }

  void _clearCache() async {
    final prefs = await SharedPreferences.getInstance();
    // Clear temporary network caches while retaining user profile
    await prefs.remove('cached_schemes_key');
    await prefs.remove('schemes_cache');
    await prefs.remove('last_auto_fetch_epoch');

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Offline cache cleared successfully'),
        backgroundColor: Colors.green,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final lang = Provider.of<LanguageProvider>(context);
    final isTa = lang.currentLanguage == 'ta';
    final schemeFetch = Provider.of<SchemeFetchProvider>(context, listen: false);

    return Scaffold(
      appBar: AppBar(
        title: Text(isTa ? 'அமைப்புகள்' : 'App Settings'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16.0),
          children: [
            // 1. Language & Display
            Text(
              isTa ? 'மொழி & காட்சி' : 'LANGUAGE & DISPLAY',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey),
            ),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.language, color: Color(0xFF1B7F4B)),
                    title: Text(isTa ? 'செயலியின் மொழி' : 'App Language'),
                    subtitle: Text(isTa ? 'தமிழ் (Tamil)' : 'English'),
                    trailing: SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'en', label: Text('EN', style: TextStyle(fontWeight: FontWeight.bold))),
                        ButtonSegment(value: 'ta', label: Text('தமிழ்', style: TextStyle(fontWeight: FontWeight.bold))),
                      ],
                      selected: {lang.currentLanguage},
                      onSelectionChanged: (newSelection) {
                        lang.setLanguage(newSelection.first);
                      },
                    ),
                  ),
                  const Divider(height: 1),
                  SwitchListTile(
                    secondary: const Icon(Icons.contrast, color: Color(0xFF1B7F4B)),
                    title: Text(isTa ? 'அதிக மாறுபட்ட காட்சி' : 'High Contrast Mode'),
                    subtitle: Text(isTa ? 'படிப்பதை எளிதாக்க எழுத்துக்களை தெளிவாக காட்டு' : 'Boosts contrast for improved readability'),
                    value: _highContrast,
                    onChanged: (val) {
                      setState(() => _highContrast = val);
                      _saveBool('setting_high_contrast', val);
                    },
                  ),
                  const Divider(height: 1),
                  SwitchListTile(
                    secondary: const Icon(Icons.format_size, color: Color(0xFF1B7F4B)),
                    title: Text(isTa ? 'பெரிய எழுத்துக்கள்' : 'Large Text Mode'),
                    subtitle: Text(isTa ? 'பயனாளர் விவரம் மற்றும் திட்டங்களை பெரிய அளவில் காட்டு' : 'Enlarge headlines and benefit amounts'),
                    value: _largeText,
                    onChanged: (val) {
                      setState(() => _largeText = val);
                      _saveBool('setting_large_text', val);
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // 2. Data & Sync
            Text(
              isTa ? 'தரவு & புதுப்பித்தல்' : 'DATA & SYNCHRONIZATION',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey),
            ),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: [
                  SwitchListTile(
                    secondary: const Icon(Icons.sync, color: Color(0xFF1B7F4B)),
                    title: Text(isTa ? 'பின்னணியில் திட்டங்களை புதுப்பி' : 'Auto-Sync Schemes'),
                    subtitle: Text(isTa ? 'tn.gov.in அரசு தளத்திலிருந்து பின்னணியில் புதுப்பிக்கும்' : 'Automatically checks official TN portals for updates'),
                    value: _autoFetchSchemes,
                    onChanged: (val) {
                      setState(() => _autoFetchSchemes = val);
                      _saveBool('setting_auto_fetch', val);
                    },
                  ),
                  const Divider(height: 1),
                  SwitchListTile(
                    secondary: const Icon(Icons.offline_bolt_outlined, color: Color(0xFF1B7F4B)),
                    title: Text(isTa ? 'ஆஃப்லைன் பயன்பாடு' : 'Offline Storage'),
                    subtitle: Text(isTa ? 'இணையம் இல்லாதபோதும் திட்டங்களை காண சேமி' : 'Keep cached schemes on device for offline access'),
                    value: _offlineCacheEnabled,
                    onChanged: (val) {
                      setState(() => _offlineCacheEnabled = val);
                      _saveBool('setting_offline_cache', val);
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.refresh, color: Color(0xFF1B7F4B)),
                    title: Text(isTa ? 'இப்போதே புதுப்பி' : 'Sync Government Schemes Now'),
                    subtitle: Text(isTa ? 'அரசு தளத்திலிருந்து புதிய திட்டங்களை உடனே கொண்டுவா' : 'Fetch latest welfare updates from tn.gov.in'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      schemeFetch.startBackgroundFetch(limit: 15);
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(isTa ? 'திட்டங்கள் புதுப்பிக்கப்படுகின்றன...' : 'Fetching schemes in background...'),
                          backgroundColor: const Color(0xFF1B7F4B),
                        ),
                      );
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.cleaning_services_outlined, color: Colors.orange),
                    title: Text(isTa ? 'தற்காலிக நினைவகத்தை அழி' : 'Clear Scheme Cache'),
                    subtitle: Text(isTa ? 'சேமிக்கப்பட்ட தற்காலிக தரவை நீக்கும்' : 'Free up local cache space'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: _clearCache,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // 3. Notifications & Privacy
            Text(
              isTa ? 'அறிவிப்புகள் & தனியுரிமை' : 'NOTIFICATIONS & PRIVACY',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey),
            ),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: [
                  SwitchListTile(
                    secondary: const Icon(Icons.notifications_active_outlined, color: Color(0xFF1B7F4B)),
                    title: Text(isTa ? 'திட்ட அறிவிப்புகள்' : 'Scheme Alerts'),
                    subtitle: Text(isTa ? 'புதிய அரசு திட்டங்கள் அறிமுகமாகும் போது தெரிவி' : 'Notify when eligible new welfare initiatives are published'),
                    value: _notificationsEnabled,
                    onChanged: (val) {
                      setState(() => _notificationsEnabled = val);
                      _saveBool('setting_notifications', val);
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.privacy_tip_outlined, color: Color(0xFF1B7F4B)),
                    title: Text(isTa ? 'தனியுரிமை கொள்கை' : 'Privacy Note'),
                    subtitle: Text(isTa ? 'உங்கள் தரவு எவ்வாறு பாதுகாக்கப்படுகிறது என்பதை காண்க' : 'See how your citizen profile information is protected'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => PrivacyNoteDialog.show(context),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // 4. About App
            Text(
              isTa ? 'செயலி பற்றி' : 'ABOUT APPLICATION',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey),
            ),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0xFFE2F4E9),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Icon(Icons.account_balance, color: Color(0xFF1B7F4B), size: 24),
                        ),
                        const SizedBox(width: 12),
                        const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Thittam (திட்டம்)',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                            ),
                            Text(
                              'Version 1.0.0 (Production Release)',
                              style: TextStyle(color: Colors.grey, fontSize: 12),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      isTa
                          ? 'தமிழ்நாடு அரசு நலத்திட்டங்கள் மற்றும் ஓய்வூதியங்களை குடிமக்கள் எளிதாக கண்டறிய உதவும் அதிகாரப்பூர்வ தகவல் செயலி.'
                          : 'A dedicated citizen welfare discovery app for Tamil Nadu Government schemes, pensions, and educational concessions.',
                      style: TextStyle(fontSize: 13, color: Colors.grey.shade700, height: 1.4),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
