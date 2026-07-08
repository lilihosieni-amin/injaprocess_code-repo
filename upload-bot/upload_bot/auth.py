def is_allowed(user_id, allowed_user_id):
    if allowed_user_id is None or user_id is None:
        return False
    try:
        return int(user_id) == int(allowed_user_id)
    except (TypeError, ValueError):
        return False
