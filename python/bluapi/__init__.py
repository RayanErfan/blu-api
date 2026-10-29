"""Python client for the Blu Bank HTTP API.

    import bluapi

    with bluapi.Client() as blu:
        print(blu.balance())

The client talks to the companion ``blu-api`` server, which speaks the bank's
own gateway protocol. See https://github.com/RayanErfan/blu-api.
"""

from importlib.metadata import PackageNotFoundError, version

from .client import CARD_TO_CARD, INSTANT, PAYA, SATNA, Client
from .errors import ApiError, BluApiError, GatewayError, ServerUnreachable, TransferError

try:
    __version__ = version("bluapi")
except PackageNotFoundError:  # running from a source checkout
    __version__ = "0.0.0"

__all__ = [
    "Client",
    "ApiError",
    "BluApiError",
    "GatewayError",
    "ServerUnreachable",
    "TransferError",
    "CARD_TO_CARD",
    "INSTANT",
    "PAYA",
    "SATNA",
    "__version__",
]
