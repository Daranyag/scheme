class RegisterRequest {
  final String name;
  final String email;
  final String password;
  final int age;
  final String state;
  final String category;
  RegisterRequest({
    required this.name,
    required this.email,
    required this.password,
    required this.age,
    required this.state,
    required this.category,
  });
  Map<String, dynamic> toJson() => {
    'name': name,
    'email': email,
    'password': password,
    'age': age,
    'state': state,
    'category': category,
  };
}