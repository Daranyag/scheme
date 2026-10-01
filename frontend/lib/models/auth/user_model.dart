class UserModel {
  final String id;
  final String name;
  final String email;
  final int age;
  final String state;
  final String category;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    required this.age,
    required this.state,
    required this.category,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      age: json['age'] ?? 0,
      state: json['state'] ?? '',
      category: json['category'] ?? '',
    );
  }
}