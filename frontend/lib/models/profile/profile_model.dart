class ProfileModel {
  final String id;
  final String name;
  final String email;
  final int age;
  final String gender;
  final String state;
  final int income;
  final String category;
  final String occupation;
  final String disabilityStatus;

  ProfileModel({
    required this.id,
    required this.name,
    required this.email,
    required this.age,
    required this.gender,
    required this.state,
    required this.income,
    required this.category,
    required this.occupation,
    required this.disabilityStatus,
  });

  factory ProfileModel.fromJson(Map<String, dynamic> json) {
    return ProfileModel(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      age: json['age'] ?? 0,
      gender: json['gender'] ?? '',
      state: json['state'] ?? '',
      income: json['income'] ?? 0,
      category: json['category'] ?? '',
      occupation: json['occupation'] ?? '',
      disabilityStatus: json['disabilityStatus'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'age': age,
      'gender': gender,
      'state': state,
      'income': income,
      'category': category,
      'occupation': occupation,
      'disabilityStatus': disabilityStatus,
    };
  }
}
