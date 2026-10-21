import 'package:flutter/material.dart';

class AppLogo extends StatelessWidget {
  final double size;
  final double iconSize;
  final double borderRadius;

  const AppLogo({
    super.key,
    this.size = 76.0,
    this.iconSize = 38.0,
    this.borderRadius = 20.0,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: const Color(0xFFE2F4E9),
        borderRadius: BorderRadius.circular(borderRadius),
      ),
      child: Center(
        child: Icon(
          Icons.account_balance_outlined,
          size: iconSize,
          color: const Color(0xFF1B7F4B),
        ),
      ),
    );
  }
}
