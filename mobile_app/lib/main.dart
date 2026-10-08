import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/language_provider.dart';
import 'screens/account_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/finder_screen.dart';
import 'screens/login_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/welcome_screen.dart';
import 'screens/data_sources_screen.dart';
import 'services/api_service.dart';
import 'services/dio_client.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiService.init();
  DioClient.setupInterceptors();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => LanguageProvider()),
      ],
      child: const MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthProvider>(
      builder: (context, authProvider, child) {
        return MaterialApp(
          title: 'TN Schemes & Pensions Finder',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1E3A8A)),
            useMaterial3: true,
          ),
          darkTheme: ThemeData.dark(useMaterial3: true),
          themeMode: ThemeMode.light,
          home: authProvider.isLoading
              ? const Scaffold(
                  body: Center(
                    child: CircularProgressIndicator(),
                  ),
                )
              : (!authProvider.isAuthenticated && !authProvider.guestChoiceSaved)
                  ? const WelcomeScreen()
                  : const MainScreen(),
        );
      },
    );
  }
}

class MainScreen extends StatefulWidget {
  final int initialIndex;
  final bool showWelcomeBanner;

  const MainScreen({
    super.key,
    this.initialIndex = 0,
    this.showWelcomeBanner = false,
  });

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  late int _selectedIndex;
  bool _dialogShown = false;
  late bool _showWelcomeBanner;

  @override
  void initState() {
    super.initState();
    _selectedIndex = widget.initialIndex;
    _showWelcomeBanner = widget.showWelcomeBanner;
  }

  List<Widget> get _widgetOptions => <Widget>[
        DashboardScreen(onEditProfile: () => _onItemTapped(1)),
        ProfileScreen(
          showWelcomeBanner: _showWelcomeBanner,
          onSaved: () => _onItemTapped(0),
          onBackToDashboard: () => _onItemTapped(0),
        ),
        const FinderScreen(),
        const ChatScreen(),
      ];

  void _onItemTapped(int index) {
    setState(() {
      _selectedIndex = index;
      _showWelcomeBanner = false;
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _checkGuestDataClaimPrompt();
  }

  void _checkGuestDataClaimPrompt() {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    if (authProvider.pendingGuestDataClaim && !_dialogShown) {
      _dialogShown = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _showClaimGuestDataDialog(context, authProvider);
      });
    }
  }

  void _showClaimGuestDataDialog(BuildContext context, AuthProvider authProvider) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.cloud_upload, color: Color(0xFF1E3A8A)),
            SizedBox(width: 8),
            Text('Sync Guest Data?'),
          ],
        ),
        content: const Text(
          'Move your existing data (profile, history, saved schemes) to your new account?',
        ),
        actions: [
          TextButton(
            onPressed: () {
              authProvider.dismissGuestDataClaimPrompt();
              _dialogShown = false;
              Navigator.pop(ctx);
              setState(() {
                _selectedIndex = 1;
              });
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Guest data kept on this device only.')),
              );
            },
            child: const Text('Keep on Device Only'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1E3A8A),
              foregroundColor: Colors.white,
            ),
            onPressed: () async {
              Navigator.pop(ctx);
              final result = await authProvider.claimGuestData();
              _dialogShown = false;
              if (context.mounted) {
                setState(() {
                  _selectedIndex = 1;
                });
                final claimedCount = result?['claimedItemsCount'] ?? 0;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      result != null
                          ? 'Successfully moved $claimedCount items to your account!'
                          : 'Guest data claiming completed.',
                    ),
                    backgroundColor: Colors.green,
                  ),
                );
              }
            },
            child: const Text('Move to Account'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('TN Schemes Finder'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        actions: [
          IconButton(
            icon: const Icon(Icons.storage, size: 26),
            tooltip: 'Data & Sources',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const DataSourcesScreen()),
              );
            },
          ),
          IconButton(
            icon: Icon(
              authProvider.isAuthenticated ? Icons.account_circle : Icons.account_circle_outlined,
              size: 28,
            ),
            tooltip: authProvider.isAuthenticated ? 'Account Settings' : 'Sign In / Account',
            onPressed: () {
              if (authProvider.isAuthenticated) {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AccountScreen()),
                );
              } else {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const LogInScreen()),
                );
              }
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _widgetOptions.elementAt(_selectedIndex),
      bottomNavigationBar: BottomNavigationBar(
        items: const <BottomNavigationBarItem>[
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard),
            label: 'Dashboard',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person),
            label: 'My Profile',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.search),
            label: 'Scheme Finder',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.chat),
            label: 'AI Chat',
          ),
        ],
        currentIndex: _selectedIndex,
        selectedItemColor: const Color(0xFF1E3A8A),
        unselectedItemColor: Colors.grey,
        onTap: _onItemTapped,
      ),
    );
  }
}

