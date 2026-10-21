import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../main.dart';
import '../providers/auth_provider.dart';
import '../widgets/app_logo.dart';
import 'login_screen.dart';
import 'signup_screen.dart';

class WelcomeScreen extends StatelessWidget {
  final VoidCallback? onSignUpTap;
  final VoidCallback? onLogInTap;

  const WelcomeScreen({
    super.key,
    this.onSignUpTap,
    this.onLogInTap,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              const Center(
                child: AppLogo(
                  size: 80,
                  iconSize: 42,
                  borderRadius: 22,
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Thittam',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF111827),
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'TN Scheme & Pension Finder',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1B7F4B),
                ),
              ),
              const SizedBox(height: 24),
              const Divider(color: Color(0xFFE5E7EB), thickness: 1),
              const SizedBox(height: 20),
              Text(
                'Discover schemes. Check eligibility. Find benefits.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15,
                  color: Colors.grey[600],
                  height: 1.4,
                ),
              ),
              const Spacer(),

              // Log In Button
              SizedBox(
                height: 52,
                child: ElevatedButton(
                  key: const Key('welcome_login_btn'),
                  onPressed: () {
                    if (onLogInTap != null) {
                      onLogInTap!();
                    } else {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (context) => const LogInScreen()),
                      );
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Theme.of(context).colorScheme.primary,
                    foregroundColor: Theme.of(context).colorScheme.onPrimary,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text('Log in', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(height: 12),

              // Sign Up Button
              SizedBox(
                height: 52,
                child: OutlinedButton(
                  key: const Key('welcome_signup_btn'),
                  onPressed: () {
                    if (onSignUpTap != null) {
                      onSignUpTap!();
                    } else {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (context) => const SignUpScreen()),
                      );
                    }
                  },
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: Theme.of(context).colorScheme.primary),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: Text(
                    'Sign up',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Continue without an account (Guest mode)
              TextButton(
                key: const Key('welcome_guest_btn'),
                onPressed: () async {
                  final authProvider = Provider.of<AuthProvider>(context, listen: false);
                  await authProvider.setGuestMode();
                  if (context.mounted) {
                    Navigator.pushAndRemoveUntil(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const MainScreen(initialIndex: 1, showWelcomeBanner: true),
                      ),
                      (route) => false,
                    );
                  }
                },
                child: Text(
                  'Continue without an account',
                  style: TextStyle(
                    color: Colors.grey[700],
                    fontSize: 15,
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}
