import time

import auth


class TestEmailValidation:
    def test_normalize_email_strips_and_lowercases(self):
        assert auth.normalize_email("  Ana@Example.COM  ") == "ana@example.com"

    def test_validates_basic_email_shape(self):
        assert auth.is_valid_email("ana@example.com") is True
        assert auth.is_valid_email("ana example.com") is False
        assert auth.is_valid_email("ana@example") is False
        assert auth.is_valid_email("") is False


class TestPasswordHashing:
    def test_hash_password_uses_salt_and_verifies_original_password(self):
        first = auth.hash_password("secret-pass")
        second = auth.hash_password("secret-pass")

        assert first != second
        assert auth.verify_password("secret-pass", first) is True
        assert auth.verify_password("wrong-pass", first) is False

    def test_verify_password_rejects_malformed_hashes(self):
        assert auth.verify_password("secret-pass", None) is False
        assert auth.verify_password("secret-pass", "") is False
        assert auth.verify_password("secret-pass", "sha256$abc") is False
        assert auth.verify_password("secret-pass", "pbkdf2_sha256$abc$salt$digest") is False


class TestAdminLogin:
    def test_admin_login_uses_configured_credentials(self, monkeypatch):
        monkeypatch.setenv("JAM_SESSION_ADMIN_EMAIL", "Owner@Example.com")
        monkeypatch.setenv("JAM_SESSION_ADMIN_PASSWORD", "super-secret")

        user = auth.verify_admin_login("owner@example.com", "super-secret")

        assert user == auth.AuthUser(email="owner@example.com", is_admin=True)

    def test_admin_login_rejects_wrong_password(self, monkeypatch):
        monkeypatch.setenv("JAM_SESSION_ADMIN_EMAIL", "owner@example.com")
        monkeypatch.setenv("JAM_SESSION_ADMIN_PASSWORD", "super-secret")

        assert auth.verify_admin_login("owner@example.com", "wrong") is None


class TestSessionTokens:
    def test_create_and_parse_session_token_round_trips_user(self, monkeypatch):
        monkeypatch.setenv("JAM_SESSION_SECRET", "test-secret")
        user = auth.AuthUser(email="ana@example.com", is_admin=False)

        parsed = auth.parse_session_token(auth.create_session_token(user))

        assert parsed == user

    def test_parse_session_token_rejects_tampered_signature(self, monkeypatch):
        monkeypatch.setenv("JAM_SESSION_SECRET", "test-secret")
        token = auth.create_session_token(auth.AuthUser(email="ana@example.com", is_admin=False))
        tampered = f"{token.rsplit('.', 1)[0]}.bad-signature"

        assert auth.parse_session_token(tampered) is None

    def test_parse_session_token_rejects_token_signed_with_old_secret(self, monkeypatch):
        monkeypatch.setenv("JAM_SESSION_SECRET", "old-secret")
        token = auth.create_session_token(auth.AuthUser(email="ana@example.com", is_admin=False))
        monkeypatch.setenv("JAM_SESSION_SECRET", "new-secret")

        assert auth.parse_session_token(token) is None

    def test_parse_session_token_rejects_expired_token(self, monkeypatch):
        monkeypatch.setenv("JAM_SESSION_SECRET", "test-secret")
        monkeypatch.setenv("JAM_SESSION_COOKIE_MAX_AGE_SECONDS", "60")
        token = auth.create_session_token(auth.AuthUser(email="ana@example.com", is_admin=False))
        now = time.time()
        monkeypatch.setattr(auth.time, "time", lambda: now + 61)

        assert auth.parse_session_token(token) is None

    def test_parse_session_token_rejects_malformed_token(self):
        assert auth.parse_session_token(None) is None
        assert auth.parse_session_token("not-a-token") is None
        assert auth.parse_session_token("abc.def.ghi") is None


class TestCookieSettings:
    def test_cookie_secure_reads_truthy_env_values(self, monkeypatch):
        monkeypatch.setenv("JAM_SESSION_COOKIE_SECURE", "true")
        assert auth.cookie_secure() is True

        monkeypatch.setenv("JAM_SESSION_COOKIE_SECURE", "0")
        assert auth.cookie_secure() is False

    def test_session_max_age_has_minimum_and_default(self, monkeypatch):
        monkeypatch.delenv("JAM_SESSION_COOKIE_MAX_AGE_SECONDS", raising=False)
        assert auth.session_max_age_seconds() == auth.DEFAULT_SESSION_MAX_AGE_SECONDS

        monkeypatch.setenv("JAM_SESSION_COOKIE_MAX_AGE_SECONDS", "10")
        assert auth.session_max_age_seconds() == 60

        monkeypatch.setenv("JAM_SESSION_COOKIE_MAX_AGE_SECONDS", "abc")
        assert auth.session_max_age_seconds() == auth.DEFAULT_SESSION_MAX_AGE_SECONDS
