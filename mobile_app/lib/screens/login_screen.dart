import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../main.dart';
import '../models/user_profile.dart';
import '../providers/auth_provider.dart';
import '../providers/language_provider.dart';
import '../widgets/app_logo.dart';
import '../widgets/server_address_dialog.dart';
import 'signup_screen.dart';
import 'forgot_password_screen.dart';

class LogInScreen extends StatefulWidget {
  final VoidCallback? onLoginSuccess;
  final VoidCallback? onForgotPasswordTap;

  const LogInScreen({super.key, this.onLoginSuccess, this.onForgotPasswordTap});

  @override
  State<LogInScreen> createState() => _LogInScreenState();
}

class _LogInScreenState extends State<LogInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submitLogin() async {
    setState(() {
      _errorMessage = null;
    });

    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final error = await authProvider.login(
      _emailController.text.trim(),
      _passwordController.text,
    );

    if (!mounted) return;

    setState(() {
      _isLoading = false;
    });

    if (error == null) {
      if (widget.onLoginSuccess != null) {
        widget.onLoginSuccess!();
      } else {
        final profile = await UserProfile.loadFromPrefs();
        final isEmpty = profile.age == null && (profile.gender == null || profile.gender!.isEmpty);
        if (mounted) {
          Navigator.pushAndRemoveUntil(
            context,
            MaterialPageRoute(
              builder: (_) => MainScreen(initialIndex: isEmpty ? 1 : 0),
            ),
            (route) => false,
          );
        }
      }
    } else {
      setState(() {
        _errorMessage = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = Provider.of<LanguageProvider>(context);
    final isTa = lang.currentLanguage == 'ta';

    return Scaffold(
      appBar: AppBar(
        title: Text(isTa ? 'உள்நுழைக' : 'Log In'),
        actions: [
          IconButton(
            tooltip: 'Server Settings',
            icon: const Icon(Icons.settings_ethernet),
            onPressed: () => showServerAddressDialog(context),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: AutofillGroup(
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(
                      child: AppLogo(
                        size: 72,
                        iconSize: 36,
                        borderRadius: 18,
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      isTa ? 'மீண்டும் வருக!' : 'Welcome Back',
                      style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: const Color(0xFF1E3A8A),
                          ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isTa
                          ? 'உங்கள் கணக்கில் உள்நுழைந்து சேமிக்கப்பட்ட விவரங்களைப் பார்க்கவும்'
                          : 'Sign in to access your saved schemes & profile',
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 14),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),

                    if (_errorMessage != null)
                      Container(
                        padding: const EdgeInsets.all(12),
                        margin: const EdgeInsets.only(bottom: 20),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.red.shade300),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.error_outline, color: Colors.red),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    _errorMessage!,
                                    style: const TextStyle(color: Colors.red, fontSize: 13),
                                  ),
                                ),
                              ],
                            ),
                            if (_errorMessage!.contains('network') || _errorMessage!.contains('internet')) ...[
                              const SizedBox(height: 8),
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton.icon(
                                  onPressed: () => showServerAddressDialog(context),
                                  icon: const Icon(Icons.settings, size: 16),
                                  label: const Text('Change Server Address', style: TextStyle(fontSize: 12)),
                                  style: TextButton.styleFrom(
                                    visualDensity: VisualDensity.compact,
                                    foregroundColor: Colors.red.shade900,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),

                    // Email field
                    Semantics(
                      label: isTa ? 'மின்னஞ்சல் முகவரி' : 'Email Address',
                      hint: isTa ? 'உங்கள் மின்னஞ்சலை உள்ளிடவும்' : 'Enter your email address',
                      child: TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        textInputAction: TextInputAction.next,
                        decoration: InputDecoration(
                          labelText: isTa ? 'மின்னஞ்சல்' : 'Email',
                          prefixIcon: const Icon(Icons.email_outlined),
                          border: const OutlineInputBorder(),
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return isTa ? 'மின்னஞ்சல் தேவை' : 'Email is required';
                          }
                          if (!RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(value.trim())) {
                            return isTa ? 'செல்லுபடியாகும் மின்னஞ்சலை உள்ளிடவும்' : 'Enter a valid email address';
                          }
                          return null;
                        },
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Password field
                    Semantics(
                      label: isTa ? 'கடவுச்சொல்' : 'Password',
                      hint: isTa ? 'உங்கள் கடவுச்சொல்லை உள்ளிடவும்' : 'Enter your password',
                      child: TextFormField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        autofillHints: const [AutofillHints.password],
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _submitLogin(),
                        decoration: InputDecoration(
                          labelText: isTa ? 'கடவுச்சொல்' : 'Password',
                          prefixIcon: const Icon(Icons.lock_outlined),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword ? Icons.visibility_off : Icons.visibility,
                            ),
                            onPressed: () {
                              setState(() {
                                _obscurePassword = !_obscurePassword;
                              });
                            },
                            tooltip: _obscurePassword
                                ? (isTa ? 'கடவுச்சொல்லைக் காட்டு' : 'Show password')
                                : (isTa ? 'கடவுச்சொல்லை மறை' : 'Hide password'),
                          ),
                          border: const OutlineInputBorder(),
                        ),
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return isTa ? 'கடவுச்சொல் தேவை' : 'Password is required';
                          }
                          return null;
                        },
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Forgot Password link
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () {
                          if (widget.onForgotPasswordTap != null) {
                            widget.onForgotPasswordTap!();
                          } else {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ForgotPasswordScreen(
                                  initialEmail: _emailController.text.trim(),
                                ),
                              ),
                            );
                          }
                        },
                        child: Text(
                          isTa ? 'கடவுச்சொல் மறந்துவிட்டதா?' : 'Forgot password?',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Submit Button
                    SizedBox(
                      height: 50,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Theme.of(context).colorScheme.primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        onPressed: _isLoading ? null : _submitLogin,
                        child: _isLoading
                            ? const SizedBox(
                                height: 24,
                                width: 24,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2.5,
                                ),
                              )
                            : Text(
                                isTa ? 'உள்நுழைக' : 'Log In',
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Link to Sign Up
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          isTa ? 'கணக்கு இல்லையா? ' : "Don't have an account? ",
                          style: TextStyle(color: Colors.grey.shade700),
                        ),
                        GestureDetector(
                          onTap: () {
                            Navigator.pushReplacement(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const SignUpScreen(),
                              ),
                            );
                          },
                          child: Text(
                            isTa ? 'பதிவு செய்க' : 'Sign up',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Continue without an account (Guest mode)
                    Center(
                      child: TextButton(
                        key: const Key('login_guest_btn'),
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
                          isTa ? 'கணக்கு இல்லாமல் தொடரவும்' : 'Continue without an account',
                          style: TextStyle(
                            color: Colors.grey[700],
                            fontSize: 15,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
