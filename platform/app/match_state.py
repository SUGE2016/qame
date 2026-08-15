OPEN_STATUSES = frozenset({"waiting", "ready", "playing"})
TERMINAL_STATUSES = frozenset({"finished", "cancelled"})
TRANSITIONS = {
    "waiting": frozenset({"playing", "cancelled"}),
    "ready": frozenset({"waiting", "playing", "cancelled"}),
    "playing": frozenset({"finished", "cancelled"}),
    "finished": frozenset(),
    "cancelled": frozenset(),
}


def can_transition(src: str, dest: str) -> bool:
    return dest in TRANSITIONS.get(src, frozenset())
