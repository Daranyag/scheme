class AppValidators {
  static String? validateName(String? value) {
    if (value == null || value.trim().isEmpty) return 'Name is required';
    return null;
  }
  static String? validateEmail(String? value) {
    if (value == null || value.trim().isEmpty) return 'Email is required';
    final emailRegExp = RegExp(r"^[a-zA-Z0-9.]+@[a-zA-Z0-9]+\.[a-zA-Z]+");
    if (!emailRegExp.hasMatch(value)) return 'Enter a valid email';
    return null;
  }
  static String? validatePassword(String? value) {
    if (value == null || value.isEmpty) return 'Password is required';
    if (value.length < 6) return 'Password must be at least 6 characters';
    return null;
  }
  static String? validateConfirmPassword(String? value, String password) {
    if (value == null || value.isEmpty) return 'Confirm Password is required';
    if (value != password) return 'Passwords do not match';
    return null;
  }
  static String? validateIncome(String? value) {
    if (value == null || value.trim().isEmpty) return 'Income is required';
    final parsed = int.tryParse(value);
    if (parsed == null) return 'Enter a valid number';
    if (parsed < 0) return 'Income cannot be negative';
    return null;
  }
  static String? validateAge(String? value) {
    if (value == null || value.isEmpty) return 'Age is required';
    if (int.tryParse(value) == null) return 'Enter a valid number';
    return null;
  }
}