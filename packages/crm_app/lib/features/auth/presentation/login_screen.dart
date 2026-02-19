import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../data/auth_provider.dart';
import '../data/auth_state.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _emailFormKey = GlobalKey<FormState>();
  final _passwordFormKey = GlobalKey<FormState>();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final theme = Theme.of(context);
    final isLoading = authState.status == AuthStatus.loading;

    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Logo
                Icon(Icons.flight_takeoff, size: 48, color: theme.colorScheme.primary),
                const SizedBox(height: 16),
                Text('TravelCRM Pro', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text('Sign in to your account', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                const SizedBox(height: 40),

                // Error message
                if (authState.error != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      authState.error!,
                      style: TextStyle(color: theme.colorScheme.onErrorContainer, fontSize: 13),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Step 1: Email
                if (authState.status == AuthStatus.unauthenticated ||
                    authState.status == AuthStatus.initial ||
                    (authState.status == AuthStatus.loading && authState.email == null))
                  _buildEmailStep(isLoading),

                // Tenant selector (when multiple)
                if (authState.status == AuthStatus.tenantResolved &&
                    authState.tenants != null &&
                    authState.tenants!.length > 1 &&
                    authState.selectedTenant == null)
                  _buildTenantSelector(authState.tenants!),

                // Step 2: Password
                if (authState.status == AuthStatus.tenantResolved &&
                        authState.selectedTenant != null ||
                    (authState.status == AuthStatus.loading && authState.email != null))
                  _buildPasswordStep(authState, isLoading),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEmailStep(bool isLoading) {
    return Form(
      key: _emailFormKey,
      child: Column(
        children: [
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'Email address',
              prefixIcon: Icon(Icons.email_outlined),
              border: OutlineInputBorder(),
            ),
            validator: Validators.email,
            onFieldSubmitted: (_) => _submitEmail(),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: FilledButton(
              onPressed: isLoading ? null : _submitEmail,
              child: isLoading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Continue'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTenantSelector(List<TenantInfo> tenants) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Select your organization:', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 12),
        ...tenants.map((t) => Card(
              child: ListTile(
                leading: CircleAvatar(
                  child: Text(t.companyName[0].toUpperCase()),
                ),
                title: Text(t.companyName),
                subtitle: Text(t.role),
                onTap: () => ref.read(authProvider.notifier).selectTenant(t),
              ),
            )),
        const SizedBox(height: 16),
        TextButton.icon(
          onPressed: () => ref.read(authProvider.notifier).resetToEmail(),
          icon: const Icon(Icons.arrow_back, size: 16),
          label: const Text('Use a different email'),
        ),
      ],
    );
  }

  Widget _buildPasswordStep(AuthState authState, bool isLoading) {
    final tenant = authState.selectedTenant;

    return Form(
      key: _passwordFormKey,
      child: Column(
        children: [
          // Show selected tenant
          if (tenant != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  CircleAvatar(radius: 16, child: Text(tenant.companyName[0])),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tenant.companyName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        Text(authState.email ?? '', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          TextFormField(
            controller: _passwordController,
            obscureText: _obscurePassword,
            autofillHints: const [AutofillHints.password],
            decoration: InputDecoration(
              labelText: 'Password',
              prefixIcon: const Icon(Icons.lock_outlined),
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: Icon(_obscurePassword ? Icons.visibility_off : Icons.visibility),
                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
              ),
            ),
            validator: (v) {
              if (v == null || v.isEmpty) return 'Password is required';
              return null;
            },
            onFieldSubmitted: (_) => _submitPassword(),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () {
                // TODO: Navigate to forgot password
              },
              child: const Text('Forgot password?'),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: FilledButton(
              onPressed: isLoading ? null : _submitPassword,
              child: isLoading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Sign in'),
            ),
          ),
          const SizedBox(height: 12),
          TextButton.icon(
            onPressed: () => ref.read(authProvider.notifier).resetToEmail(),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Use a different email'),
          ),
        ],
      ),
    );
  }

  void _submitEmail() {
    if (_emailFormKey.currentState?.validate() ?? false) {
      ref.read(authProvider.notifier).resolveTenant(_emailController.text.trim());
    }
  }

  void _submitPassword() {
    if (_passwordFormKey.currentState?.validate() ?? false) {
      ref.read(authProvider.notifier).login(_passwordController.text);
    }
  }
}
