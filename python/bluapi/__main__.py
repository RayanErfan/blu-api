"""Command line access to the API.

    bluapi status
    bluapi balance
    bluapi call owner 6104335551234567

Set ``BLU_API_URL`` and ``BLU_API_KEY`` to point at a server that is not on the
default local address.
"""

import argparse
import json
import sys
from typing import Any, List, Optional

from . import __version__
from .client import Client
from .errors import BluApiError

# command -> (client method, nargs)
COMMANDS = {
    "status": ("status", 0),
    "profile": ("profile", 0),
    "profiles": ("profiles", 0),
    "balance": ("balance", 0),
    "balances": ("balances", 0),
    "cards": ("cards", 0),
    "all-cards": ("all_cards", 0),
    "processed-cards": ("processed_cards", 0),
    "card-otp": ("card_otp", 1),
    "transaction-find": ("find_transaction", 1),
    "owner": ("owner", 1),
    "transactions": ("transactions", 0),
    "categories": ("merchant_categories", 0),
    "hashtags": ("transaction_hashtags", 0),
    "recent-transfers": ("recent_transfers", 0),
    "scheduled-transfers": ("scheduled_transfers", 0),
    "transfer-get": ("transfer_get", 1),
    "transfer-cancel": ("transfer_cancel", 1),
    "recent-charges": ("recent_charges", 0),
    "recent-internet": ("recent_internet_packages", 0),
    "favorite-bills": ("favorite_bills", 0),
    "banks": ("banks", 0),
    "banners": ("banners", 0),
    "onboarding": ("onboarding", 0),
    "junior": ("junior", 0),
    "identities": ("identities", 0),
    "cashback-categories": ("cashback_categories", 0),
    "cashback-vendors": ("cashback_vendors", 0),
    "cheques": ("cheques", 0),
    "contacts": ("contacts", 0),
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="bluapi", description="Blu Bank API client")
    parser.add_argument("--version", action="version", version=__version__)
    parser.add_argument("--url", help="server base URL (default $BLU_API_URL or localhost)")
    parser.add_argument("--key", help="API key (default $BLU_API_KEY)")
    sub = parser.add_subparsers(dest="command", required=True)

    for name, (_, nargs) in COMMANDS.items():
        cmd = sub.add_parser(name)
        if nargs:
            cmd.add_argument("args", nargs=nargs)

    login = sub.add_parser("login", help="start a session")
    login.add_argument("username")
    login.add_argument("password")

    otp = sub.add_parser("otp", help="finish a fresh-device login")
    otp.add_argument("code")

    sub.add_parser("logout", help="forget the session")

    transfer = sub.add_parser("transfer", help="send money (moves real money)")
    transfer.add_argument("amount", type=int)
    transfer.add_argument("to")
    transfer.add_argument("--bank")
    transfer.add_argument("--method", type=int, default=24)

    call = sub.add_parser("call", help="raw gateway route")
    call.add_argument("path")
    call.add_argument("request_type")
    call.add_argument("response_type")

    return parser


def run(args: argparse.Namespace, client: Client) -> Any:
    if args.command in COMMANDS:
        method = getattr(client, COMMANDS[args.command][0])
        return method(*getattr(args, "args", []) or [])
    if args.command == "login":
        return client.login(args.username, args.password)
    if args.command == "otp":
        return client.otp(args.code)
    if args.command == "logout":
        return client.logout()
    if args.command == "transfer":
        return client.transfer(args.amount, args.to, bank=args.bank, method=args.method)
    if args.command == "call":
        return client.raw(args.path, args.request_type, args.response_type)
    raise SystemExit(f"unknown command {args.command}")


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    with Client(base_url=args.url, api_key=args.key) as client:
        try:
            result = run(args, client)
        except BluApiError as exc:
            print(json.dumps(exc.payload, ensure_ascii=False, indent=2), file=sys.stderr)
            return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
