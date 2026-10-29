"""A client for the Blu Bank HTTP API.

The protocol itself is protobuf over HTTP/2 and needs an Iranian egress, so it
is served by the companion ``blu-api`` project. This package talks to that
server, which listens on ``http://127.0.0.1:8088`` by default.

    import bluapi

    with bluapi.Client() as blu:
        print(blu.balance())

Every method returns the decoded JSON the server produced. Gateway responses
are protobuf on the wire and arrive here as nested dicts keyed by field number,
which is faithful but not pretty; the helper methods on this class cover the
routes that have a stable shape.
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

from .errors import ApiError, GatewayError, ServerUnreachable, TransferError

__all__ = ["Client"]

DEFAULT_BASE_URL = "http://127.0.0.1:8088"
DEFAULT_TIMEOUT = 120.0

# Transfer methods accepted by the gateway.
CARD_TO_CARD = 24
INSTANT = 25
PAYA = 26
SATNA = 27


class Client:
    """A connection to a running ``blu-api`` server.

    :param base_url: where the server listens; defaults to ``$BLU_API_URL`` or
        ``http://127.0.0.1:8088``.
    :param api_key: sent as ``x-api-key`` when the server was started with
        ``BLU_API_KEY``; defaults to ``$BLU_API_KEY``.
    :param timeout: per-request timeout in seconds.

    The client is a context manager so the underlying opener is closed.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.base_url = (base_url or os.environ.get("BLU_API_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.api_key = api_key if api_key is not None else os.environ.get("BLU_API_KEY", "")
        self.timeout = timeout

    @classmethod
    def from_env(cls) -> "Client":
        """Build a client from ``BLU_API_URL`` and ``BLU_API_KEY``."""
        return cls()

    def __enter__(self) -> "Client":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        """Release the client. It holds no sockets between calls."""

    def __repr__(self) -> str:
        return f"Client(base_url={self.base_url!r})"

    # ---- transport ----

    def _request(self, path: str, method: str = "GET", body: Any = None) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(url, data=data, method=method)
        if data is not None:
            request.add_header("content-type", "application/json")
        if self.api_key:
            request.add_header("x-api-key", self.api_key)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            try:
                payload = json.load(exc)
            except ValueError:
                payload = exc.read().decode("utf-8", "replace")
            if isinstance(payload, dict) and payload.get("error") == "gateway":
                raise GatewayError(exc.code, payload, path) from None
            raise ApiError(exc.code, payload, path) from None
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ServerUnreachable(f"{self.base_url}: {exc}") from None

    def _get(self, path: str) -> Any:
        return self._request(path)

    def _post(self, path: str, body: Any = None) -> Any:
        return self._request(path, "POST", body if body is not None else {})

    # ---- meta ----

    def health(self) -> Dict[str, Any]:
        """Liveness of the server. Needs no session."""
        return self._get("health")

    def status(self) -> Dict[str, Any]:
        """Login state, device id and remaining token life.

        The token renews itself on the next call, so ``tokenFresh: false`` is
        not an error.
        """
        return self._get("status")

    # ---- auth ----

    def login(self, username: str, password: str) -> Dict[str, Any]:
        """Start a session.

        On a device the bank already trusts this returns ``otpRequired: false``
        and you are done. On a fresh device it returns ``otpRequired: true`` and
        you finish with :meth:`otp`.
        """
        return self._post("login", {"username": username, "password": password})

    def otp(self, code: str) -> Dict[str, Any]:
        """Submit the code sent to the registered phone.

        Only needed after a ``login`` that reported ``otpRequired``. The device
        becomes trusted, so later logins skip the code.
        """
        return self._post("otp", {"code": code})

    def logout(self) -> Dict[str, Any]:
        """Forget the stored session. The next login needs an OTP again."""
        return self._post("logout")

    # ---- account ----

    def profile(self) -> Dict[str, Any]:
        """Identity record: username, party id, phone, avatar, birth date."""
        return self._get("profile")

    def profiles(self) -> Dict[str, Any]:
        """The personal and legal profiles the account can act as."""
        return self._get("profiles")

    def balance(self) -> Dict[str, Any]:
        """Available balance summed over every deposit, in IRR."""
        return self._get("balance")

    def balances(self) -> Dict[str, Any]:
        """Every deposit with its IBAN and available and current amounts."""
        return self._get("balances")

    def cards(self) -> Dict[str, Any]:
        """Cards previously used as transfer destinations."""
        return self._get("cards")

    def all_cards(self) -> Dict[str, Any]:
        """The account's own cards."""
        return self._get("cards/all")

    def processed_cards(self) -> Dict[str, Any]:
        """Card orders that have been processed."""
        return self._get("cards/processed")

    def card_otp(self, card: str) -> Dict[str, Any]:
        """Generate the dynamic second password (رمز دوم پویا) for a card.

        :param card: the card PAN.

        Returns ``code``, the six digits to type into a payment form, plus the
        validity window: ``validFrom``, ``expiresIn`` (seconds, about 120) and
        ``expiresAt`` (epoch milliseconds). The code is single-use and expires
        quickly, so fetch it right before paying.
        """
        return self._get("cards/" + urllib.parse.quote(card, safe="") + "/otp")

    def owner(self, identifier: str) -> Dict[str, Any]:
        """Resolve the owner name and bank behind a card number or IBAN."""
        return self._get("owner/" + urllib.parse.quote(identifier, safe=""))

    # ---- transactions ----

    def transactions(self) -> Dict[str, Any]:
        """Full history, newest first."""
        return self._get("transactions")

    def merchant_categories(self) -> Dict[str, Any]:
        """Merchant category tree used to classify spending."""
        return self._get("transactions/categories")

    def transaction_hashtags(self) -> Dict[str, Any]:
        """Hashtags applied to transactions."""
        return self._get("transactions/hashtags")

    # ---- transfers ----

    def recent_transfers(self) -> Dict[str, Any]:
        """Previously used destination accounts."""
        return self._get("transfers/recent")

    def scheduled_transfers(self) -> Dict[str, Any]:
        """Scheduled transfer contracts."""
        return self._get("transfers/scheduled")

    def transfer(
        self,
        amount: int,
        to: str,
        bank: Optional[str] = None,
        method: int = CARD_TO_CARD,
        source: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Send money.

        :param amount: in IRR.
        :param to: destination card number or IBAN.
        :param bank: destination bank code; inferred from the owner lookup when
            omitted.
        :param method: one of :data:`CARD_TO_CARD`, :data:`INSTANT`,
            :data:`PAYA`, :data:`SATNA`.
        :param source: ``{"card": ..., "bank": ...}`` to override the source
            card.

        The server resolves the owner, picks the source card and asks the
        gateway which methods are available before submitting. Source and
        destination must differ, so the account's own Blu card cannot be the
        destination.

        This moves real money.
        """
        if not amount or not to:
            raise TransferError("amount and to are required")
        body: Dict[str, Any] = {"amount": amount, "to": to, "method": method}
        if bank:
            body["bank"] = bank
        if source:
            body["source"] = source
        return self._post("transfers", body)

    def transfer_get(self, transfer_id: str) -> Dict[str, Any]:
        """Fetch one transfer.

        The gateway only resolves ids minted by the two-step ``transfer/init``
        and ``submit`` flow, so an id from :meth:`transfer` usually answers 404
        or 500.
        """
        return self._get("transfers/" + urllib.parse.quote(transfer_id, safe=""))

    def transfer_cancel(self, transfer_id: str) -> Dict[str, Any]:
        """Cancel an unsettled transfer."""
        return self._post("transfers/" + urllib.parse.quote(transfer_id, safe="") + "/cancel")

    # ---- payments ----

    def recent_charges(self) -> Dict[str, Any]:
        """Recently topped-up mobile numbers."""
        return self._get("charge/recent-phones")

    def recent_internet_packages(self) -> Dict[str, Any]:
        """Recently purchased internet packages."""
        return self._get("internet/recent-phones")

    def favorite_bills(self) -> Dict[str, Any]:
        """Bills saved as favourites."""
        return self._get("bill/favorites")

    # ---- general ----

    def banks(self) -> Dict[str, Any]:
        """Every bank with its code and logo."""
        return self._get("banks")

    def banners(self) -> Dict[str, Any]:
        """Dashboard banners."""
        return self._get("banners")

    def onboarding(self) -> Dict[str, Any]:
        """Onboarding slides."""
        return self._get("onboarding")

    def junior(self) -> Dict[str, Any]:
        """Child accounts."""
        return self._get("junior")

    def identities(self) -> Dict[str, Any]:
        """Identity traits sent to the identity service."""
        return self._get("identities")

    def cashback_categories(self) -> Dict[str, Any]:
        """Cashback categories and their rates."""
        return self._get("cashback/categories")

    def cashback_vendors(self) -> Dict[str, Any]:
        """Vendors participating in cashback."""
        return self._get("cashback/vendors")

    def cheques(self) -> Dict[str, Any]:
        """Registered cheques."""
        return self._get("cheques")

    def contacts(self) -> Dict[str, Any]:
        """Contacts available as transfer destinations."""
        return self._get("contacts")

    # ---- escape hatch ----

    def raw(self, path: str, request_type: str, response_type: str) -> Any:
        """Call a gateway route that has no dedicated method.

        ``request_type`` and ``response_type`` are the protobuf message names
        the gateway expects in the content type. The body is the shared app
        block only, so this covers routes that need nothing else.

            blu.raw(
                "account/deposit/list/all",
                "solutions.saman.bluebank.services.AccountListAllRequest",
                "solutions.saman.bluebank.services.AccountListAllResponse",
            )
        """
        query = urllib.parse.urlencode({"req": request_type, "resp": response_type})
        return self._get(f"raw/{path.lstrip('/')}?{query}")
