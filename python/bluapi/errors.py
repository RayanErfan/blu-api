"""Exceptions raised by :mod:`bluapi`."""

from typing import Any


class BluApiError(Exception):
    """Base class for every error this package raises."""


class ApiError(BluApiError):
    """The server answered with a non-2xx status.

    ``status`` is the HTTP status and ``payload`` is the decoded body, which the
    server fills with an ``error`` key and, for gateway failures, the original
    ``detail``.
    """

    def __init__(self, status: int, payload: Any, path: str = "") -> None:
        self.status = status
        self.payload = payload
        self.path = path
        super().__init__(f"{status} {path}: {payload}")


class GatewayError(ApiError):
    """The bank gateway itself rejected the call.

    A subclass of :class:`ApiError`, so catching that still works. ``detail``
    holds the gateway's own message, which is usually Persian.
    """

    def __init__(self, status: int, payload: Any, path: str = "") -> None:
        detail = payload.get("detail") if isinstance(payload, dict) else payload
        self.detail = detail
        super().__init__(status, payload, path)


class ServerUnreachable(BluApiError):
    """The server could not be reached at all.

    Either it is not running, the URL is wrong, or it timed out.
    """

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class TransferError(BluApiError):
    """A transfer was rejected before it reached the gateway."""
