def is_allowed(user_id, allowed_ids):
    if not allowed_ids or user_id is None:
        return False
    try:
        return int(user_id) in allowed_ids
    except (TypeError, ValueError):
        return False
