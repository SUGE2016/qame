from tests.conftest import is_test_username


def test_test_username_pattern():
    assert is_test_username("sea_a_a1b2c3d4")
    assert is_test_username("sp_a_f1760f3b")
    assert is_test_username("pid_b22a53de")
    assert is_test_username("aud_caeb02ff")
    assert not is_test_username("admin")
    assert not is_test_username("alice")
    assert not is_test_username("agent")
    assert not is_test_username("user_name")
