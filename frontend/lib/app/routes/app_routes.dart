import 'package:go_router/go_router.dart';
import '../../views/splash/splash_view.dart';
import '../../views/auth/login_view.dart';
import '../../views/auth/register_view.dart';
import '../../views/profile/profile_view.dart';
import '../../views/profile/edit_profile_view.dart';
import '../../views/schemes/scheme_list_view.dart';
import '../../views/schemes/scheme_detail_view.dart';
import '../../views/eligibility/eligibility_view.dart';
import '../../views/dashboard/dashboard_view.dart';
import '../../views/dashboard/source_list_view.dart';

class AppRouter {
  static final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const SplashView(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginView(),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterView(),
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => const DashboardView(),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfileView(),
      ),
      GoRoute(
        path: '/profile/edit',
        builder: (context, state) => const EditProfileView(),
      ),
      GoRoute(
        path: '/schemes',
        builder: (context, state) => const SchemeListView(),
      ),
      GoRoute(
        path: '/eligibility/:id',
        builder: (context, state) => EligibilityView(schemeId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/schemes/:id',
        builder: (context, state) => SchemeDetailView(id: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/sources',
        builder: (context, state) => const SourceListView(),
      ),
    ],
  );
}