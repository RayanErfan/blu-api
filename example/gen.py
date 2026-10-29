#!/usr/bin/env python3
"""Generate one example script per endpoint."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "methods")
os.makedirs(OUT, exist_ok=True)

CARD_OTP = '''if len(sys.argv) > 1:
    card = sys.argv[1]
else:
    # cards/all carries the full pan; cards only the masked one.
    all_cards = blu.get("cards/all")
    card = (((all_cards.get("3") or {}).get("2") or {}).get("1") or "").strip()
    if not card:
        sys.exit("no card, pass one: python3 card_otp.py 6037...")

result = blu.get("cards/" + card + "/otp")
blu.show(f"Dynamic password for {card}", result)
print("\\nvalid for", result.get("expiresIn"), "seconds")'''

TRANSACTION_FIND = '''code = sys.argv[1] if len(sys.argv) > 1 else "249042"

result = blu.get("transactions/find/" + code)
if result.get("error"):
    sys.exit(result["error"])
blu.show("Transaction " + code, result)'''

# (slug, title, path, body, note)
METHODS = [
    ("status", "Session status", "status", None,
     "Login state, device id and remaining token life. The token renews itself on\n"
     "the next call, so `tokenFresh: false` is not an error."),
    ("profile", "Own profile", "profile", None,
     "Identity record: username, party id, phone, avatar, birth date."),
    ("profiles", "Account profiles", "profiles", None,
     "The personal/legal profiles the account can act as."),
    ("balance", "Total balance", "balance", None,
     "Available balance summed over every deposit, in IRR."),
    ("balances", "Per-account balances", "balances", None,
     "Every deposit with its IBAN, available and current amounts."),
    ("cards", "Recent transfer cards", "cards", None,
     "Cards previously used as transfer destinations."),
    ("cards_all", "Own cards", "cards/all", None,
     "The account's own cards, with bank and PAN."),
    ("cards_processed", "Processed card orders", "cards/processed", None,
     "Card orders that have been processed. Empty on this account."),
    ("transactions", "Transaction history", "transactions", None,
     "Full history, newest first. Each row carries a base64 transaction id."),
    ("transactions_categories", "Merchant categories", "transactions/categories", None,
     "Merchant category tree used to classify spending."),
    ("transactions_hashtags", "Transaction hashtags", "transactions/hashtags", None,
     "Hashtags applied to transactions. Empty on this account."),
    ("transfers_recent", "Recent transfer destinations", "transfers/recent", None,
     "Previously used destination accounts with bank metadata."),
    ("transfers_scheduled", "Scheduled transfers", "transfers/scheduled", None,
     "Scheduled transfer contracts. Only the cursor comes back when none exist."),
    ("charge_recent_phones", "Recent top-up numbers", "charge/recent-phones", None,
     "Recently topped-up mobile numbers, with operator."),
    ("internet_recent_phones", "Recent internet packages", "internet/recent-phones", None,
     "Recently purchased internet packages."),
    ("bill_favorites", "Saved bills", "bill/favorites", None,
     "Bills saved as favourites. Empty on this account."),
    ("banks", "Bank directory", "banks", None,
     "Every bank with its code and logo, used to build transfer destinations."),
    ("banners", "Dashboard banners", "banners", None,
     "Promotional banners with their navigation targets."),
    ("onboarding", "Onboarding slides", "onboarding", None,
     "Onboarding slides. Empty on this account."),
    ("junior", "Junior accounts", "junior", None,
     "Child accounts. Empty on this account."),
    ("identities", "Identity traits", "identities", None,
     "The one JSON route: traits sent to the identity service."),
    ("cashback_categories", "Cashback categories", "cashback/categories", None,
     "Cashback categories and their rates."),
    ("cashback_vendors", "Cashback vendors", "cashback/vendors", None,
     "Vendors participating in cashback."),
    ("cheques", "Cheque registry", "cheques", None,
     "Registered cheques. Only the cursor comes back when none exist."),
    ("contacts", "Recent contacts", "contacts", None,
     "Contacts available as transfer destinations."),
    ("transaction_find", "Find a transaction", "transactions/find/{code}", TRANSACTION_FIND,
     "One transaction by its receipt number (کد پیگیری). The gateway has no lookup\n"
     "by receipt, so the server walks the history page by page until one matches —\n"
     "pass `?pages=` on the HTTP route to search further back."),
    ("card_otp", "Dynamic second password", "cards/{card}/otp", CARD_OTP,
     "The رمز دوم پویا a card payment asks for: six digits, single use, valid for\n"
     "about two minutes. The card is the full PAN and defaults to the first card in\n"
     "your card list.\n"
     "\n"
     "The reply carries the window as well:\n"
     "\n"
     '    {"code": "123456", "otpRequest": "73443",\n'
     '     "validFrom": 1793282709, "expiresIn": 120, "expiresAt": 1793282829000}\n'
     "\n"
     "Fetch it immediately before paying — the clock starts on the server, not here."),
]

TEMPLATE = '''#!/usr/bin/env python3
"""{title}

GET /{path}

{note}

Recorded response: output/{slug}.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

{body}
'''

DEFAULT = 'result = blu.get("{path}")\nblu.show("{title}", result)'

for slug, title, path, body, note in METHODS:
    code = body or DEFAULT.format(path=path, title=title)
    with open(os.path.join(OUT, slug + ".py"), "w", encoding="utf-8") as f:
        f.write(TEMPLATE.format(slug=slug, title=title, path=path, note=note, body=code))

print(f"wrote {len(METHODS)} scripts")
