from app.supabase_auth import service_api_headers


def test_new_secret_key_is_sent_only_as_api_key() -> None:
    headers = service_api_headers("sb_secret_example", json_content=True)

    assert headers == {
        "apikey": "sb_secret_example",
        "content-type": "application/json",
    }


def test_legacy_service_role_jwt_is_also_sent_as_bearer() -> None:
    headers = service_api_headers("legacy-service-role-jwt")

    assert headers == {
        "apikey": "legacy-service-role-jwt",
        "authorization": "Bearer legacy-service-role-jwt",
    }
