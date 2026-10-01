import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../controllers/auth_controller.dart';
import '../../controllers/profile_controller.dart';

class HomeView extends StatelessWidget {
  const HomeView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              context.read<ProfileController>().clearProfile();
              await context.read<AuthController>().logout();
              if (context.mounted) context.go('/login');
            },
          )
        ],
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Smart Pension & Welfare Scheme Finder', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold), textAlign: TextAlign.center,),
            const SizedBox(height: 16),
            Text('Welcome, ${context.watch<ProfileController>().profile?.name ?? 'User'}', style: const TextStyle(fontSize: 16)),
            const SizedBox(height: 8),
            const Text('State: Tamil Nadu', style: TextStyle(fontSize: 16)),
            const SizedBox(height: 32),
            SizedBox(
              width: 200,
              child: ElevatedButton(
                onPressed: () => context.push('/schemes'),
                child: const Text('View Schemes'),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: 200,
              child: OutlinedButton(
                onPressed: () => context.push('/profile'),
                child: const Text('My Profile'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}