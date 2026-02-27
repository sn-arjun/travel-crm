enum AuthStatus { initial, sendingOtp, otpSent, verifying, authenticated, error }

class DriverAuthState {
  final AuthStatus status;
  final String? phone;
  final String? errorMessage;

  const DriverAuthState({
    this.status = AuthStatus.initial,
    this.phone,
    this.errorMessage,
  });

  DriverAuthState copyWith({
    AuthStatus? status,
    String? phone,
    String? errorMessage,
  }) {
    return DriverAuthState(
      status: status ?? this.status,
      phone: phone ?? this.phone,
      errorMessage: errorMessage,
    );
  }
}
