import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/language_provider.dart';
import 'reset_password_screen.dart';

class ForgotPasswordScreen extends StatefulWidget {
  final String? initialEmail;

  const ForgotPasswordScreen({super.key, this.initialEmail});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailController;
  bool _isLoading = false;
  bool _submitted = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(text: widget.initialEmail ?? '');
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submitRequest() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _message = null;
    });

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final responseMsg = await authProvider.forgotPassword(_emailController.text.trim());

    if (!mounted) return;

    setState(() {
      _isLoading = false;
      _submitted = true;
      _message = responseMsg;
    });
  }

  @override
  Widget build(BuildContext context) {
    final lang = Provider.of<LanguageProvider>(context);
    final isTa = lang.currentLanguage == 'ta';

    return Scaffold(
      appBar: AppBar(
        title: Text(isTa ? 'கடவுச்சொல் மீட்பு' : 'Forgot Password'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 16),
              Icon(
                Icons.lock_reset,
                size: 64,
                color: Theme.of(context).primaryColor,
              ),
              const SizedBox(height: 16),
              Text(
                isTa ? 'கடவுச்சொல்லை மீட்டமைக்கவும்' : 'Reset Your Password',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                isTa
                    ? 'உங்கள் கணக்கின் மின்னஞ்சல் முகவரியை உள்ளிடவும். கடவுச்சொல்லை மீட்டமைப்பதற்கான இணைப்பை அனுப்புவோம்.'
                    : 'Enter your account email address. If an account exists, we will send a password reset link.',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 14),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),

              if (_submitted) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green.shade300),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle_outline, color: Colors.green),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _message ??
                              (isTa
                                  ? 'இந்த மின்னஞ்சலுக்கு கணக்கு இருந்தால், கடவுச்சொல் மீட்டமைப்பு இணைப்பு அனுப்பப்பட்டுள்ளது.'
                                  : 'If this email has an account, a reset link has been sent.'),
                          style: const TextStyle(color: Colors.green, fontSize: 14),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const ResetPasswordScreen(),
                      ),
                    );
                  },
                  icon: const Icon(Icons.key),
                  label: Text(isTa ? 'மீட்டமைப்பு டோக்கன் உள்ளதா? இங்கே உள்ளிடவும்' : 'Have a reset token? Enter it here'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ] else ...[
                Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      Semantics(
                        label: isTa ? 'மின்னஞ்சல் முகவரி' : 'Email Address',
                        child: TextFormField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          autofillHints: const [AutofillHints.email],
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
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1E3A8A),
                            foregroundColor: Colors.white,
                          ),
                          onPressed: _isLoading ? null : _submitRequest,
                          child: _isLoading
                              ? const SizedBox(
                                  height: 24,
                                  width: 24,
                                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                                )
                              : Text(
                                  isTa ? 'மீட்டமைப்பு இணைப்பு அனுப்புக' : 'Send Reset Link',
                                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
