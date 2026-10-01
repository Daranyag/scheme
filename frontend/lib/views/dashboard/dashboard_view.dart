import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import '../../controllers/dashboard_controller.dart';
import '../../controllers/profile_controller.dart';
import '../../controllers/scheme_controller.dart';
import '../../widgets/scheme_summary_card.dart';
import 'package:intl/intl.dart';

class DashboardView extends StatefulWidget {
  const DashboardView({super.key});

  @override
  State<DashboardView> createState() => _DashboardViewState();
}

class _DashboardViewState extends State<DashboardView> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final profile = context.read<ProfileController>().profile;
      final dashboardCtrl = context.read<DashboardController>();
      dashboardCtrl.calculateProfileCompletion(profile);
      dashboardCtrl.loadDashboard();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _onSearch(String query) {
    if (query.isNotEmpty) {
      context.read<SchemeController>().setSearchQuery(query);
      context.push('/schemes');
    }
  }

  void _onCategorySelected(String category) {
    context.read<SchemeController>().setCategory(category);
    context.push('/schemes');
  }

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<ProfileController>().profile;
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person),
            onPressed: () => context.push('/profile'),
          )
        ],
      ),
      body: Consumer<DashboardController>(
        builder: (context, controller, child) {
          if (controller.isLoading && controller.summary == null) {
            return const Center(child: CircularProgressIndicator());
          }

          return RefreshIndicator(
            onRefresh: () => controller.refreshDashboard(),
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Welcome Header
                  Container(
                    padding: const EdgeInsets.all(24.0),
                    color: Theme.of(context).primaryColor.withOpacity(0.1),
                    width: double.infinity,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Welcome, ${profile?.name ?? 'User'}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        const Text('Tamil Nadu Government Welfare Services', style: TextStyle(fontSize: 16)),
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(color: Colors.blue.shade100, borderRadius: BorderRadius.circular(16)),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.location_on, size: 16, color: Colors.blue),
                              SizedBox(width: 4),
                              Text('Tamil Nadu', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.blue)),
                            ],
                          ),
                        )
                      ],
                    ),
                  ),

                  // Search Bar
                  Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: TextField(
                      controller: _searchController,
                      decoration: InputDecoration(
                        hintText: 'Search Tamil Nadu schemes',
                        prefixIcon: const Icon(Icons.search),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        filled: true,
                        fillColor: Colors.grey.shade100,
                      ),
                      onSubmitted: _onSearch,
                    ),
                  ),

                  // Profile Completion Card
                  if (controller.profileCompletion < 100)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16.0),
                      child: Card(
                        color: Colors.orange.shade50,
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Your Profile', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Expanded(
                                    child: LinearProgressIndicator(
                                      value: controller.profileCompletion / 100,
                                      backgroundColor: Colors.orange.shade200,
                                      color: Colors.orange,
                                    ),
                                  ),
                                  const SizedBox(width: 16),
                                  Text('${controller.profileCompletion}%', style: const TextStyle(fontWeight: FontWeight.bold)),
                                ],
                              ),
                              const SizedBox(height: 12),
                              const Text('Complete your profile to improve scheme recommendations.', style: TextStyle(fontSize: 14)),
                              const SizedBox(height: 12),
                              ElevatedButton(
                                onPressed: () => context.push('/profile/edit'),
                                child: const Text('Complete Profile'),
                              )
                            ],
                          ),
                        ),
                      ),
                    ),

                  // Quick Categories
                  if (controller.categories.isNotEmpty) ...[
                    const Padding(
                      padding: EdgeInsets.all(16.0),
                      child: Text('Quick Categories', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    ),
                    SizedBox(
                      height: 40,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 16.0),
                        itemCount: controller.categories.length,
                        itemBuilder: (context, index) {
                          final category = controller.categories[index];
                          return Padding(
                            padding: const EdgeInsets.only(right: 8.0),
                            child: ActionChip(
                              label: Text(category),
                              onPressed: () => _onCategorySelected(category),
                            ),
                          );
                        },
                      ),
                    ),
                  ],

                  // Recommendations
                  const Padding(
                    padding: EdgeInsets.only(left: 16.0, right: 16.0, top: 24.0, bottom: 8.0),
                    child: Text('Schemes Relevant to You', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  ),
                  if (controller.recommendations.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16.0),
                      child: Text('No matching schemes found yet. Complete your profile or explore all schemes.', style: TextStyle(color: Colors.grey)),
                    )
                  else
                    ...controller.recommendations.map((scheme) => SchemeSummaryCard(
                          scheme: scheme,
                          // Taking the first reason if it exists from our simulated backend logic
                          // For a real scenario, this would come mapped appropriately
                          relevanceReason: 'Potentially relevant based on your profile',
                          onTap: () => context.push('/schemes/${scheme.id}'),
                        )),

                  if (controller.recommendations.isNotEmpty)
                    const Padding(
                      padding: EdgeInsets.all(16.0),
                      child: Text('These suggestions are based on the information available in your profile and published scheme criteria. Please verify final eligibility on the official Tamil Nadu Government source.', style: TextStyle(fontSize: 12, color: Colors.grey)),
                    ),

                  // Recently Updated
                  if (controller.recentSchemes.isNotEmpty) ...[
                    const Padding(
                      padding: EdgeInsets.only(left: 16.0, right: 16.0, top: 16.0, bottom: 8.0),
                      child: Text('Recently Updated', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    ),
                    ...controller.recentSchemes.map((scheme) => SchemeSummaryCard(
                          scheme: scheme,
                          onTap: () => context.push('/schemes/${scheme.id}'),
                        )),
                  ],

                  // Dashboard Statistics
                  if (controller.summary != null) ...[
                    const Padding(
                      padding: EdgeInsets.only(left: 16.0, right: 16.0, top: 24.0, bottom: 8.0),
                      child: Text('Tamil Nadu Scheme Statistics', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16.0),
                      child: Row(
                        children: [
                          Expanded(child: _buildStatCard('${controller.summary!.totalSchemes}+', 'Schemes')),
                          const SizedBox(width: 8),
                          Expanded(child: _buildStatCard('${controller.summary!.categoriesCount}', 'Categories')),
                          const SizedBox(width: 8),
                          Expanded(child: _buildStatCard('${controller.summary!.sourcesCount}', 'Sources')),
                        ],
                      ),
                    ),
                  ],

                  // Data Sources Link
                  Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Card(
                      color: Colors.blue.shade50,
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Government Sources', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            const SizedBox(height: 8),
                            const Text('Information is collected from official Tamil Nadu Government departments and portals.', style: TextStyle(fontSize: 14)),
                            const SizedBox(height: 12),
                            OutlinedButton(
                              onPressed: () => context.push('/sources'),
                              child: const Text('View Sources'),
                            )
                          ],
                        ),
                      ),
                    ),
                  ),

                  // Explore All Schemes
                  Padding(
                    padding: const EdgeInsets.only(left: 16.0, right: 16.0, bottom: 32.0),
                    child: SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                        onPressed: () {
                          context.read<SchemeController>().setCategory(null);
                          context.read<SchemeController>().setSearchQuery('');
                          context.push('/schemes');
                        },
                        child: const Text('Explore All Tamil Nadu Schemes', style: TextStyle(fontSize: 16)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildStatCard(String value, String label) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16.0),
        child: Column(
          children: [
            Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.blue)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}
