import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/language_provider.dart';
import 'privacy_note_dialog.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  bool _isEditingNickname = false;
  final _nicknameController = TextEditingController();
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    final user = Provider.of<AuthProvider>(context, listen: false).user;
    if (user != null) {
      _nicknameController.text = user['displayName'] ?? '';
    }
  }

  @override
  void dispose() {
    _nicknameController.dispose();
    super.dispose();
  }

  void _showMessage(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: isError ? Colors.red : Colors.green,
      ),
    );
  }

  Future<void> _updateNickname() async {
    final newNickname = _nicknameController.text.trim();
    setState(() {
      _isLoading = true;
    });

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final error = await authProvider.updateAccount(displayName: newNickname);

    if (!mounted) return;

    setState(() {
      _isLoading = false;
      _isEditingNickname = false;
    });

    if (error == null) {
      _showMessage('Nickname updated successfully');
    } else {
      _showMessage(error, isError: true);
    }
  }

  void _showChangePasswordDialog() {
    final currentPasswordCtrl = TextEditingController();
    final newPasswordCtrl = TextEditingController();
    final confirmPasswordCtrl = TextEditingController();
    final formKey = GlobalKey<FormState>();
    bool isChanging = false;
    String? dialogError;

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Change Password'),
              content: SingleChildScrollView(
                child: Form(
                  key: formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (dialogError != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(
                            dialogError!,
                            style: const TextStyle(color: Colors.red, fontSize: 13),
                          ),
                        ),
                      TextFormField(
                        controller: currentPasswordCtrl,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Current Password',
                          border: OutlineInputBorder(),
                        ),
                        validator: (val) =>
                            (val == null || val.isEmpty) ? 'Required' : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: newPasswordCtrl,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'New Password',
                          border: OutlineInputBorder(),
                        ),
                        validator: (val) {
                          if (val == null || val.isEmpty) return 'Required';
                          if (val.length < 8) return 'At least 8 characters';
                          return null;
                        },
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: confirmPasswordCtrl,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Confirm New Password',
                          border: OutlineInputBorder(),
                        ),
                        validator: (val) {
                          if (val != newPasswordCtrl.text) return 'Passwords do not match';
                          return null;
                        },
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: isChanging ? null : () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: isChanging
                      ? null
                      : () async {
                          if (!formKey.currentState!.validate()) return;
                          setDialogState(() {
                            isChanging = true;
                            dialogError = null;
                          });

                          final authProvider = Provider.of<AuthProvider>(context, listen: false);
                          final err = await authProvider.changePassword(
                            currentPasswordCtrl.text,
                            newPasswordCtrl.text,
                          );

                          if (!ctx.mounted) return;

                          if (err == null) {
                            Navigator.pop(ctx);
                            _showMessage('Password changed successfully');
                          } else {
                            setDialogState(() {
                              isChanging = false;
                              dialogError = err;
                            });
                          }
                        },
                  child: isChanging
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Save'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _showLogoutDialog({bool allDevices = false}) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(allDevices ? 'Log out of all devices?' : 'Log Out'),
        content: Text(
          allDevices
              ? 'This will end all active sessions across all devices. Do you want to keep or clear local guest data on this device?'
              : 'Do you want to keep your saved local data on this device for offline access or guest mode?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          OutlinedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              final auth = Provider.of<AuthProvider>(context, listen: false);
              if (allDevices) {
                await auth.logoutAllDevices(clearLocalData: true);
              } else {
                await auth.logout(clearLocalData: true);
              }
              if (mounted) Navigator.pop(context);
            },
            child: const Text('Log Out & Clear Data'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1E3A8A)),
            onPressed: () async {
              Navigator.pop(ctx);
              final auth = Provider.of<AuthProvider>(context, listen: false);
              if (allDevices) {
                await auth.logoutAllDevices(clearLocalData: false);
              } else {
                await auth.logout(clearLocalData: false);
              }
              if (mounted) Navigator.pop(context);
            },
            child: const Text('Log Out & Keep Data'),
          ),
        ],
      ),
    );
  }

  void _showDeleteAccountDialog() {
    final passwordCtrl = TextEditingController();
    final formKey = GlobalKey<FormState>();
    bool isDeleting = false;
    String? dialogError;

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Row(
                children: [
                  Icon(Icons.warning, color: Colors.red),
                  SizedBox(width: 8),
                  Text('Delete Account'),
                ],
              ),
              content: SingleChildScrollView(
                child: Form(
                  key: formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'WARNING: This action is permanent and cannot be undone. All your profile data, search history, and saved items will be deleted from our servers.',
                        style: TextStyle(color: Colors.red, fontWeight: FontWeight.w500, fontSize: 13),
                      ),
                      const SizedBox(height: 16),
                      const Text('Enter your password to confirm deletion:'),
                      const SizedBox(height: 12),
                      if (dialogError != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text(
                            dialogError!,
                            style: const TextStyle(color: Colors.red, fontSize: 13),
                          ),
                        ),
                      TextFormField(
                        controller: passwordCtrl,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Password',
                          border: OutlineInputBorder(),
                        ),
                        validator: (val) => (val == null || val.isEmpty) ? 'Password is required' : null,
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: isDeleting ? null : () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
                  onPressed: isDeleting
                      ? null
                      : () async {
                          if (!formKey.currentState!.validate()) return;
                          setDialogState(() {
                            isDeleting = true;
                            dialogError = null;
                          });

                          final authProvider = Provider.of<AuthProvider>(context, listen: false);
                          final err = await authProvider.deleteAccount(passwordCtrl.text);

                          if (!ctx.mounted) return;

                          if (err == null) {
                            Navigator.pop(ctx);
                            if (mounted) Navigator.pop(context);
                          } else {
                            setDialogState(() {
                              isDeleting = false;
                              dialogError = err;
                            });
                          }
                        },
                  child: isDeleting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Delete Permanently'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final lang = Provider.of<LanguageProvider>(context);
    final isTa = lang.currentLanguage == 'ta';
    final authProvider = Provider.of<AuthProvider>(context);
    final user = authProvider.user;

    final email = user?['email'] ?? 'Unknown Email';
    final displayName = user?['displayName'] ?? '';

    return Scaffold(
      appBar: AppBar(
        title: Text(isTa ? 'எனது கணக்கு' : 'Account Details'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // User header card
              Card(
                elevation: 2,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 30,
                        backgroundColor: const Color(0xFF1E3A8A),
                        child: Text(
                          (displayName.isNotEmpty ? displayName[0] : email[0]).toUpperCase(),
                          style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              displayName.isNotEmpty ? displayName : (isTa ? 'பயனாளர்' : 'User'),
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              email,
                              style: TextStyle(color: Colors.grey.shade700, fontSize: 14),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Nickname Section
              const Text(
                'ACCOUNT SETTINGS',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey),
              ),
              const SizedBox(height: 8),
              Card(
                child: Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.person_outline),
                      title: const Text('Nickname (Optional)'),
                      subtitle: _isEditingNickname
                          ? Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: TextField(
                                      controller: _nicknameController,
                                      decoration: const InputDecoration(
                                        isDense: true,
                                        border: OutlineInputBorder(),
                                        hintText: 'Enter nickname',
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  ElevatedButton(
                                    onPressed: _isLoading ? null : _updateNickname,
                                    child: _isLoading
                                        ? const SizedBox(
                                            width: 16,
                                            height: 16,
                                            child: CircularProgressIndicator(strokeWidth: 2),
                                          )
                                        : const Text('Save'),
                                  ),
                                ],
                              ),
                            )
                          : Text(displayName.isEmpty ? 'Not set' : displayName),
                      trailing: IconButton(
                        icon: Icon(_isEditingNickname ? Icons.close : Icons.edit),
                        onPressed: () {
                          setState(() {
                            _isEditingNickname = !_isEditingNickname;
                            if (!_isEditingNickname) {
                              _nicknameController.text = user?['displayName'] ?? '';
                            }
                          });
                        },
                      ),
                    ),
                    const Divider(height: 1),
                    ListTile(
                      leading: const Icon(Icons.lock_outline),
                      title: Text(isTa ? 'கடவுச்சொல்லை மாற்று' : 'Change Password'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: _showChangePasswordDialog,
                    ),
                    const Divider(height: 1),
                    ListTile(
                      leading: const Icon(Icons.privacy_tip_outlined),
                      title: Text(isTa ? 'தனியுரிமை குறிப்பு' : 'Privacy Note'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => PrivacyNoteDialog.show(context),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Sessions & Logout Section
              const Text(
                'SESSION & SECURITY',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey),
              ),
              const SizedBox(height: 8),
              Card(
                child: Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.logout, color: Colors.orange),
                      title: Text(isTa ? 'வெளியேறு' : 'Log Out'),
                      subtitle: const Text('Log out of this device'),
                      onTap: () => _showLogoutDialog(allDevices: false),
                    ),
                    const Divider(height: 1),
                    ListTile(
                      leading: const Icon(Icons.devices, color: Colors.orange),
                      title: Text(isTa ? 'அனைத்து சாதனங்களிலிருந்தும் வெளியேறு' : 'Log Out of All Devices'),
                      subtitle: const Text('Revoke all sessions on all devices'),
                      onTap: () => _showLogoutDialog(allDevices: true),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Danger Zone
              const Text(
                'DANGER ZONE',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.red),
              ),
              const SizedBox(height: 8),
              Card(
                color: Colors.red.shade50,
                child: ListTile(
                  leading: const Icon(Icons.delete_forever, color: Colors.red),
                  title: Text(
                    isTa ? 'கணக்கை நீக்கு' : 'Delete Account',
                    style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
                  ),
                  subtitle: const Text('Permanently remove all your account data'),
                  onTap: _showDeleteAccountDialog,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
