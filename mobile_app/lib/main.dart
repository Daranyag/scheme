import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/language_provider.dart';
import 'providers/scheme_fetch_provider.dart';
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
        ChangeNotifierProvider(create: (_) => SchemeFetchProvider()),
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
          title: 'Thittam - TN Schemes & Pensions Finder',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            useMaterial3: true,
            colorScheme: const ColorScheme(
              brightness: Brightness.light,
              primary: Color(0xFF1B7F4B),
              onPrimary: Color(0xFFFFFFFF),
              primaryContainer: Color(0xFFE6F4EA),
              onPrimaryContainer: Color(0xFF0F4D2D),
              secondary: Color(0xFF1B7F4B),
              onSecondary: Color(0xFFFFFFFF),
              secondaryContainer: Color(0xFFEAF5EE),
              onSecondaryContainer: Color(0xFF0F4D2D),
              surface: Color(0xFFFFFFFF),
              onSurface: Color(0xFF1B2433),
              surfaceContainerHighest: Color(0xFFEAF5EE),
              onSurfaceVariant: Color(0xFF5B6B82),
              outline: Color(0xFF1B7F4B),
              outlineVariant: Color(0xFFCFE5D6),
              error: Color(0xFFD32F2F),
              onError: Color(0xFFFFFFFF),
            ),
            scaffoldBackgroundColor: const Color(0xFFF6FBF7),
            cardTheme: const CardThemeData(
              color: Colors.white,
              elevation: 1,
              shape: RoundedRectangleBorder(
                side: BorderSide(color: Color(0xFFCFE5D6)),
                borderRadius: BorderRadius.all(Radius.circular(12)),
              ),
            ),
            appBarTheme: const AppBarTheme(
              backgroundColor: Color(0xFF1B7F4B),
              foregroundColor: Color(0xFFFFFFFF),
              iconTheme: IconThemeData(color: Colors.white),
              actionsIconTheme: IconThemeData(color: Colors.white),
              elevation: 0,
            ),
            elevatedButtonTheme: ElevatedButtonThemeData(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1B7F4B),
                foregroundColor: const Color(0xFFFFFFFF),
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
            outlinedButtonTheme: OutlinedButtonThemeData(
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF1B7F4B),
                side: const BorderSide(color: Color(0xFF1B7F4B)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
            inputDecorationTheme: const InputDecorationTheme(
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderSide: BorderSide(color: Color(0xFFCFE5D6)),
                borderRadius: BorderRadius.all(Radius.circular(8)),
              ),
              enabledBorder: OutlineInputBorder(
                borderSide: BorderSide(color: Color(0xFFCFE5D6)),
                borderRadius: BorderRadius.all(Radius.circular(8)),
              ),
              focusedBorder: OutlineInputBorder(
                borderSide: BorderSide(color: Color(0xFF1B7F4B), width: 1.5),
                borderRadius: BorderRadius.all(Radius.circular(8)),
              ),
            ),
            checkboxTheme: CheckboxThemeData(
              fillColor: WidgetStateProperty.resolveWith((states) {
                if (states.contains(WidgetState.selected)) {
                  return const Color(0xFF1B7F4B);
                }
                return null;
              }),
            ),
            switchTheme: SwitchThemeData(
              thumbColor: WidgetStateProperty.resolveWith((states) {
                if (states.contains(WidgetState.selected)) {
                  return const Color(0xFF1B7F4B);
                }
                return null;
              }),
              trackColor: WidgetStateProperty.resolveWith((states) {
                if (states.contains(WidgetState.selected)) {
                  return const Color(0xFFE6F4EA);
                }
                return null;
              }),
            ),
            progressIndicatorTheme: const ProgressIndicatorThemeData(
              color: Color(0xFF1B7F4B),
            ),
            bottomNavigationBarTheme: const BottomNavigationBarThemeData(
              backgroundColor: Colors.white,
              selectedItemColor: Color(0xFF1B7F4B),
              unselectedItemColor: Color(0xFF5B6B82),
              selectedIconTheme: IconThemeData(color: Color(0xFF1B7F4B)),
            ),
          ),
          darkTheme: ThemeData(
            useMaterial3: true,
            colorScheme: const ColorScheme(
              brightness: Brightness.dark,
              primary: Color(0xFF5FCB8E),
              onPrimary: Color(0xFF0E1A13),
              primaryContainer: Color(0xFF16261C),
              onPrimaryContainer: Color(0xFFE6F2EA),
              secondary: Color(0xFF5FCB8E),
              onSecondary: Color(0xFF0E1A13),
              surface: Color(0xFF16261C),
              onSurface: Color(0xFFE6F2EA),
              surfaceContainerHighest: Color(0xFF16261C),
              onSurfaceVariant: Color(0xFFB0C4B8),
              outline: Color(0xFF5FCB8E),
              outlineVariant: Color(0xFF263C2E),
              error: Color(0xFFCF6679),
              onError: Color(0xFF000000),
            ),
            scaffoldBackgroundColor: const Color(0xFF0E1A13),
            appBarTheme: const AppBarTheme(
              backgroundColor: Color(0xFF16261C),
              foregroundColor: Color(0xFFE6F2EA),
              iconTheme: IconThemeData(color: Color(0xFFE6F2EA)),
            ),
          ),
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
  late bool _showWelcomeBanner;

  @override
  void initState() {
    super.initState();
    _selectedIndex = widget.initialIndex;
    _showWelcomeBanner = widget.showWelcomeBanner;

    // Automatically fetch schemes in background when user opens app if stale
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        Provider.of<SchemeFetchProvider>(context, listen: false).autoFetchIfStale();
      }
    });
  }

  List<Widget> get _widgetOptions => <Widget>[
        DashboardScreen(onEditProfile: () => _onItemTapped(1)),
        ProfileScreen(
          showWelcomeBanner: _showWelcomeBanner,
          onSaved: () => _onItemTapped(0),
          onBackToDashboard: () => _onItemTapped(0),
        ),
        FinderScreen(
          onNavigateToDashboard: () => _onItemTapped(0),
        ),
        const ChatScreen(),
      ];

  void _onItemTapped(int index) {
    setState(() {
      _selectedIndex = index;
      _showWelcomeBanner = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('TN Schemes Finder'),
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Theme.of(context).colorScheme.onPrimary,
        actions: [
          Consumer<SchemeFetchProvider>(
            builder: (context, fetchProvider, _) {
              if (fetchProvider.isFetching) {
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8.0),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Theme.of(context).colorScheme.onPrimary),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Fetching...',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Theme.of(context).colorScheme.onPrimary),
                      ),
                    ],
                  ),
                );
              }
              return const SizedBox.shrink();
            },
          ),
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
        onTap: _onItemTapped,
      ),
    );
  }
}

