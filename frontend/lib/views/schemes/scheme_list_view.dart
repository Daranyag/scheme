import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import '../../controllers/scheme_controller.dart';
import 'package:intl/intl.dart';

class SchemeListView extends StatefulWidget {
  const SchemeListView({super.key});

  @override
  State<SchemeListView> createState() => _SchemeListViewState();
}

class _SchemeListViewState extends State<SchemeListView> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SchemeController>().loadSchemes();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tamil Nadu Government Schemes', style: TextStyle(fontSize: 16)),
      ),
      body: Consumer<SchemeController>(
        builder: (context, controller, child) {
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    labelText: 'Search schemes...',
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.search),
                      onPressed: () => controller.setSearchQuery(_searchController.text),
                    ),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onSubmitted: (value) => controller.setSearchQuery(value),
                ),
              ),
              if (controller.categories.isNotEmpty)
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16.0),
                  child: Row(
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(right: 8.0),
                        child: ChoiceChip(
                          label: const Text('All'),
                          selected: controller.selectedCategory == null,
                          onSelected: (selected) {
                            if (selected) controller.setCategory(null);
                          },
                        ),
                      ),
                      ...controller.categories.map((category) {
                        return Padding(
                          padding: const EdgeInsets.only(right: 8.0),
                          child: ChoiceChip(
                            label: Text(category),
                            selected: controller.selectedCategory == category,
                            onSelected: (selected) {
                              if (selected) controller.setCategory(category);
                            },
                          ),
                        );
                      }).toList(),
                    ],
                  ),
                ),
              const SizedBox(height: 8),
              if (controller.isLoading)
                const Expanded(child: Center(child: CircularProgressIndicator()))
              else if (controller.errorMessage != null)
                Expanded(
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('Unable to connect to server.\nPlease try again.', textAlign: TextAlign.center, style: const TextStyle(color: Colors.red)),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: () => controller.loadSchemes(),
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              else if (controller.schemes.isEmpty)
                const Expanded(child: Center(child: Text('No Tamil Nadu government schemes found.')))
              else
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: () => controller.refreshSchemes(),
                    child: ListView.builder(
                      padding: const EdgeInsets.all(16.0),
                      itemCount: controller.schemes.length,
                      itemBuilder: (context, index) {
                        final scheme = controller.schemes[index];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 16.0),
                          child: InkWell(
                            onTap: () => context.push('/schemes/${scheme.id}'),
                            child: Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(scheme.schemeName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 8),
                                  Text('Category:\n${scheme.category}', style: const TextStyle(fontSize: 14)),
                                  const SizedBox(height: 8),
                                  Text('Department:\n${scheme.department}', style: const TextStyle(fontSize: 14)),
                                  const SizedBox(height: 8),
                                  Text('Source:\nGovernment of Tamil Nadu', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                                  const SizedBox(height: 8),
                                  Text('Last checked:\n${scheme.lastVerifiedAt != null ? DateFormat('dd-MM-yyyy').format(scheme.lastVerifiedAt!) : 'N/A'}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
