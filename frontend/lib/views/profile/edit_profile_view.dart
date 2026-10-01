import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../controllers/profile_controller.dart';
import '../../models/profile/profile_model.dart';
import '../../utils/constants.dart';
import '../../utils/validators.dart';
import '../../utils/app_snackbar.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/app_button.dart';

class EditProfileView extends StatefulWidget {
  const EditProfileView({super.key});

  @override
  State<EditProfileView> createState() => _EditProfileViewState();
}

class _EditProfileViewState extends State<EditProfileView> {
  final _formKey = GlobalKey<FormState>();
  
  late TextEditingController _nameController;
  late TextEditingController _ageController;
  late TextEditingController _incomeController;
  late TextEditingController _occupationController;
  
  String? _selectedGender;
  String? _selectedCategory;
  String? _selectedDisabilityStatus;

  @override
  void initState() {
    super.initState();
    final profile = context.read<ProfileController>().profile!;
    
    _nameController = TextEditingController(text: profile.name);
    _ageController = TextEditingController(text: profile.age.toString());
    _incomeController = TextEditingController(text: profile.income.toString());
    _occupationController = TextEditingController(text: profile.occupation);
    
    _selectedGender = profile.gender.isEmpty ? null : profile.gender;
    _selectedCategory = profile.category.isEmpty ? null : profile.category;
    _selectedDisabilityStatus = profile.disabilityStatus.isEmpty ? null : profile.disabilityStatus;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _ageController.dispose();
    _incomeController.dispose();
    _occupationController.dispose();
    super.dispose();
  }

  void _saveProfile() async {
    if (_formKey.currentState!.validate()) {
      if (_selectedGender == null || _selectedCategory == null || _selectedDisabilityStatus == null) {
        AppSnackBar.showError(context, 'Please fill all dropdown fields');
        return;
      }

      final profile = context.read<ProfileController>().profile!;
      
      final updatedProfile = ProfileModel(
        id: profile.id,
        email: profile.email,
        name: _nameController.text.trim(),
        age: int.parse(_ageController.text.trim()),
        gender: _selectedGender!,
        state: AppConstants.targetState,
        income: int.parse(_incomeController.text.trim()),
        category: _selectedCategory!,
        occupation: _occupationController.text.trim(),
        disabilityStatus: _selectedDisabilityStatus!,
      );

      final success = await context.read<ProfileController>().updateProfile(
        updatedProfile,
        (error) => AppSnackBar.showError(context, error),
      );

      if (success && mounted) {
        AppSnackBar.showSuccess(context, 'Profile updated successfully');
        context.go('/home');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isSaving = context.watch<ProfileController>().isSaving;

    return Scaffold(
      appBar: AppBar(title: const Text('Edit Profile')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Form(
            key: _formKey,
            child: Column(
              children: [
                AppTextField(
                  label: 'Full Name',
                  controller: _nameController,
                  validator: AppValidators.validateName,
                ),
                AppTextField(
                  label: 'Age',
                  controller: _ageController,
                  keyboardType: TextInputType.number,
                  validator: AppValidators.validateAge,
                ),
                Padding(
                  padding: const EdgeInsets.only(bottom: 16.0),
                  child: DropdownButtonFormField<String>(
                    decoration: InputDecoration(
                      labelText: 'Gender',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    initialValue: _selectedGender,
                    items: AppConstants.genders.map((g) => DropdownMenuItem(value: g, child: Text(g))).toList(),
                    onChanged: (val) => setState(() => _selectedGender = val),
                    validator: (v) => v == null ? 'Gender is required' : null,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(bottom: 16.0),
                  child: TextFormField(
                    initialValue: AppConstants.targetState,
                    readOnly: true,
                    decoration: InputDecoration(
                      labelText: 'State',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      suffixIcon: const Icon(Icons.lock),
                    ),
                  ),
                ),
                AppTextField(
                  label: 'Annual Income',
                  controller: _incomeController,
                  keyboardType: TextInputType.number,
                  validator: AppValidators.validateIncome,
                ),
                Padding(
                  padding: const EdgeInsets.only(bottom: 16.0),
                  child: DropdownButtonFormField<String>(
                    decoration: InputDecoration(
                      labelText: 'Category',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    initialValue: _selectedCategory,
                    items: AppConstants.categories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                    onChanged: (val) => setState(() => _selectedCategory = val),
                    validator: (v) => v == null ? 'Category is required' : null,
                  ),
                ),
                AppTextField(
                  label: 'Occupation',
                  controller: _occupationController,
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Occupation is required' : null,
                ),
                Padding(
                  padding: const EdgeInsets.only(bottom: 24.0),
                  child: DropdownButtonFormField<String>(
                    decoration: InputDecoration(
                      labelText: 'Disability Status',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    initialValue: _selectedDisabilityStatus,
                    items: const [
                      DropdownMenuItem(value: 'Yes', child: Text('Yes')),
                      DropdownMenuItem(value: 'No', child: Text('No')),
                    ],
                    onChanged: (val) => setState(() => _selectedDisabilityStatus = val),
                    validator: (v) => v == null ? 'Disability Status is required' : null,
                  ),
                ),
                AppButton(
                  text: 'SAVE CHANGES',
                  onPressed: _saveProfile,
                  isLoading: isSaving,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
