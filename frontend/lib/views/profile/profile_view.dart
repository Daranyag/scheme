import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../controllers/profile_controller.dart';
import '../../controllers/auth_controller.dart';

class ProfileView extends StatefulWidget {
  const ProfileView({super.key});

  @override
  State<ProfileView> createState() => _ProfileViewState();
}

class _ProfileViewState extends State<ProfileView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ProfileController>().loadProfile();
    });
  }

  Widget _buildProfileItem(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 14, color: Colors.grey)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
          const Divider(),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Profile')),
      body: Consumer<ProfileController>(
        builder: (context, controller, child) {
          if (controller.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (controller.errorMessage != null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(controller.errorMessage!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => controller.loadProfile(force: true),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }
          final profile = controller.profile;
          if (profile == null) {
            return const Center(child: Text('No profile data available.'));
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const CircleAvatar(radius: 40, child: Icon(Icons.person, size: 40)),
                const SizedBox(height: 16),
                Text(profile.name, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                Text(profile.email, style: const TextStyle(fontSize: 16, color: Colors.grey)),
                const SizedBox(height: 32),
                
                Align(
                  alignment: Alignment.centerLeft,
                  child: const Text('Personal Information', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(height: 16),
                
                _buildProfileItem('Full Name', profile.name),
                _buildProfileItem('Email', profile.email),
                _buildProfileItem('Age', profile.age.toString()),
                _buildProfileItem('Gender', profile.gender.isEmpty ? 'Not set' : profile.gender),
                _buildProfileItem('State', profile.state.isEmpty ? 'Not set' : profile.state),
                _buildProfileItem('Annual Income', '₹${profile.income}'),
                _buildProfileItem('Category', profile.category.isEmpty ? 'Not set' : profile.category),
                _buildProfileItem('Occupation', profile.occupation.isEmpty ? 'Not set' : profile.occupation),
                _buildProfileItem('Disability Status', profile.disabilityStatus.isEmpty ? 'Not set' : profile.disabilityStatus),
                
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => context.push('/profile/edit'),
                    child: const Text('EDIT PROFILE'),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () async {
                      context.read<ProfileController>().clearProfile();
                      await context.read<AuthController>().logout();
                      if (context.mounted) context.go('/login');
                    },
                    child: const Text('LOGOUT'),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
