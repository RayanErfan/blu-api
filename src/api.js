'use strict';
// Domain layer. Each method is a thin wrapper over one gateway route.
// Request bodies are the shared app block (optionally carrying the profile
// block) plus route-specific fields.

const C = require('./config');
const P = require('./proto');
const X = require('./crypto');
const D = require('./derive');
const store = require('./session');
const { appBlock, deviceIdBinary } = require('./client');

const NS = 'solutions.saman.bluebank.services.';

class Api {
  constructor(client) {
    this.c = client;
  }

  async _app() {
    const s = this.c.s;
    return appBlock(s.deviceId, true, await this.c.profileId(), s.profileType, s.profileRef);
  }

  async _post(path, req, resp, extra) {
    await this.c.ensure();
    const body = Buffer.concat([await this._app(), ...(extra || [])]);
    return this.c.call(path, NS + req, NS + resp, body);
  }

  // ---- account & profile ----

  profile() {
    return this._post('user/profile/get', 'UserGetProfileRequest', 'UserGetProfileResponse');
  }

  profiles(types) {
    // AccountProfileType: 1 personal, 2 personal-business, 3 legal.
    // Without a filter the gateway returns every profile on the party.
    const extra = types && types.length ? [P.msg(3, types.map((t) => P.num(3, Number(t))))] : [];
    return this._post('account-profile/profile/list', 'AccountProfileListRequest', 'AccountProfileListResponse', extra);
  }

  // Switching is navigation only: the reply is a deep link that carries the
  // profile id. The data calls below are scoped by an account number instead.
  switchProfile(profileId) {
    return this._post('account-profile/profile/switch', 'AccountProfileSwitchRequest', 'AccountProfileSwitchResponse', [
      P.bytes(2, deviceIdBinary(this.c.s.deviceId)),
      P.str(3, profileId),
    ]);
  }

  // Choose the profile later calls act for. `profile` may be an entry from
  // D.profiles(), an account number, a profile id ("main" or a UUID) or one of
  // "personal" / "business" / "legal" (also accepted as 1 / 2 / 3).
  async useProfile(profile) {
    await this.c.ensure();
    const s = this.c.s;
    if (profile === undefined || profile === null) return s;

    const list = D.profiles(P.toJson(await this.profiles()));
    let p = profile;
    if (typeof p === 'string') {
      const names = { personal: 1, business: 2, 'personal-business': 2, legal: 3 };
      const key = p.toLowerCase();
      if (names[key] || /^[123]$/.test(p)) {
        const type = names[key] || Number(p);
        p = list.find((x) => Number(x.type) === type);
      } else if (/^[0-9]{18}$/.test(p)) {
        p = list.find((x) => x.accountNumber === p);
      } else {
        p = list.find((x) => x.id === p);
      }
      if (!p) throw new Error('no matching profile: ' + profile);
    }

    s.profileRef = p.id;
    s.profileType = Number(p.type) || 1;
    s.profileId = p.accountNumber || p.account || s.profileId;
    store.save(this.c.strip());
    return s;
  }

  // Deposits. Passing the party id returns every account on the party,
  // including a business profile that a plain list hides.
  deposits(ownerCustomerId) {
    const extra = ownerCustomerId ? [P.msg(3, [P.str(5, ownerCustomerId)])] : [];
    return this._post('account/deposit/list/all', 'AccountListAllRequest', 'AccountListAllResponse', extra);
  }

  cards() {
    return this._post('deposit-fund/recent-card/list', 'DepositFundListRecentCardsRequest', 'DepositFundListRecentCardsResponse');
  }

  // Cards for one account, or for the active profile when `account` is omitted.
  allCards(account) {
    const extra = account ? [P.msg(3, [P.msg(3, [P.str(1, account)])])] : [];
    return this._post('account/card/list/all', 'CardListAllRequest', 'CardListAllResponse', extra);
  }

  processedCards() {
    return this._post('../v1/account/card/list/processed', 'AccountCardListProcessedRequest', 'AccountCardListProcessedResponse');
  }

  // Dynamic second password (رمز دوم پویا) for one card. The password comes back
  // sealed under the session key and is only valid for a couple of minutes.
  cardOtp(card) {
    return this._post('../v1/account/card/otp/generate', 'CardGenerateOTPRequest', 'CardGenerateOTPResponse', [
      P.msg(2, [P.str(1, card)]),
    ]);
  }

  // Owner name lookup for a destination card or IBAN.
  owner(identifier) {
    return this._post('account/owner/get', 'AccountGetOwnerRequest', 'AccountGetOwnerResponse', [P.str(3, identifier)]);
  }

  // ---- transactions ----

  // `account` limits the history to one deposit (business accounts included).
  transactions(account, { size = 20, page = 1 } = {}) {
    const query = account ? [P.msg(2, [P.msg(1, [P.str(1, account)])])] : [];
    return this._post('account/transaction/list/all', 'AccountTransactionListAllRequest', 'AccountTransactionListAllResponse', [
      P.msg(2, [P.num(1, size), P.num(2, page)]),
      ...(query.length ? [P.msg(3, query)] : []),
    ]);
  }

  // One transaction in full, by the row id from the list. The reply carries the
  // receipt number, the counterparty and the receipt text.
  transactionDetail(id) {
    return this._post('account/transaction/list/all', 'AccountTransactionListAllRequest', 'AccountTransactionListAllResponse', [
      P.msg(3, [P.str(1, id)]),
    ]);
  }

  // Find a transaction by its receipt number (کد پیگیری). The gateway has no
  // lookup by receipt, so this walks the history a page at a time and asks for
  // the detail of each row until one matches. Returns null when nothing does.
  async findTransaction(code, { pages = 50, size = 20 } = {}) {
    for (let page = 1; page <= pages; page++) {
      const res = await this._post('account/transaction/list/all', 'AccountTransactionListAllRequest', 'AccountTransactionListAllResponse', [
        P.msg(2, [P.num(1, size), P.num(2, page)]),
      ]);
      const rows = P.all(res, 3);
      if (!rows.length) return null;
      for (const row of rows) {
        const id = P.first(row, 1);
        if (!id) continue;
        const detail = await this.transactionDetail(id.toString('utf8'));
        const found = P.first(detail, 3);
        const receiptMsg = found && P.first(found, 17);
        const receipt = receiptMsg && P.first(receiptMsg, 1);
        if (receipt && receipt.toString('utf8') === String(code)) return found;
      }
    }
    return null;
  }

  // `type` 1 = debits, 2 = credits.
  merchantCategories(type = 1) {
    return this._post('account/transaction/merchant-categories/list', 'TransactionListMerchantCategoriesRequest', 'TransactionListMerchantCategoriesResponse', [
      P.msg(2, [P.num(3, type)]),
    ]);
  }

  transactionHashtags(token) {
    return this._post('account/transaction/hashtag/list', 'ListHashtagRequest', 'ListHashtagResponse', [
      token ? P.msg(3, [P.str(1, token)]) : Buffer.alloc(0),
    ]);
  }

  // ---- payment links (لینک پرداخت) ----

  // Links and payments created on a business profile. The gateway only serves
  // this to a business context, so call `useProfile('business')` first. Without
  // a `count`/`offset` the gateway returns its default page.
  //
  // `ids`, `statuses` (1 unpaid, 2 paid, 3 settled, 4 expired, 5 canceled) and
  // `types` (1 general, 2 unique) filter the list.
  paymentLinks({ count, offset, ids, statuses, types } = {}) {
    const extra = [];
    if (offset !== undefined && offset !== null) {
      // Page is a oneof: count and offset cannot both be set.
      extra.push(P.msg(2, [P.num(2, Number(offset))]));
    } else {
      extra.push(P.msg(2, [P.num(1, Number(count) || 50)]));
    }

    const query = [];
    (ids || []).forEach((id) => query.push(P.str(1, id)));
    (statuses || []).forEach((s) => query.push(P.num(2, Number(s))));
    (types || []).forEach((t) => query.push(P.num(3, Number(t))));
    if (query.length) extra.push(P.msg(3, query));

    return this._post('../v1/payment-link/list', 'PaymentLinkListRequest', 'PaymentLinkListResponse', extra);
  }

  // Create a unique link for a fixed amount. Amounts are in IRR and must sit
  // inside the creationRestriction the list reports (1,000,000–100,000,000 IRR
  // on a fresh business profile). The title is assigned by the server.
  createPaymentLink({ amount, description } = {}) {
    if (amount === undefined || amount === null) throw new Error('amount is required');
    const extra = [money({ value: amount })];
    if (description) extra.push(P.str(3, description));
    return this._post('payment-link/create', 'PaymentLinkCreateRequest', 'PaymentLinkCreateResponse', extra);
  }

  // Payer-side check before opening the checkout. A business whose gateway is
  // disabled answers with a PaymentLinkInvalid reason instead of transferInfo.
  validatePaymentLink(id, amount) {
    const extra = [P.str(2, id)];
    if (amount !== undefined && amount !== null) extra.push(money({ value: amount }));
    return this._post('payment-link/validate', 'PaymentLinkValidateRequest', 'PaymentLinkValidateResponse', extra);
  }

  // Receipt of a paid link (empty until somebody pays it).
  paymentLinkReceipt(id) {
    return this._post('payment-link/receipt', 'PaymentLinkGetReceiptRequest', 'PaymentLinkGetReceiptResponse', [P.str(2, id)]);
  }

  // ---- transfers ----

  recentTransferAccounts() {
    return this._post('transfer/user-accounts/list/recent', 'TransferListRecentUserAccountsRequest', 'TransferListRecentUserAccountsResponse');
  }

  transferMethods(amount, dest) {
    return this._post('transfer/methods/list/available', 'TransferListAvailableMethodsRequest', 'TransferListAvailableMethodsResponse', [
      money(amount),
      destination(dest),
    ]);
  }

  transferCreate({ amount, source, dest, method }) {
    return this._post('transfer/create', 'TransferCreateRequest', 'TransferCreateResponse', [
      money(amount),
      sourceBlock(source),
      destination(dest),
      P.num(5, method),
    ]);
  }

  transferGet(id) {
    return this._post('transfer/get', 'TransferGetRequest', 'TransferGetResponse', [P.str(2, id)]);
  }

  transferCancel(id) {
    return this._post('transfer/cancel', 'TransferCancelRequest', 'TransferCancelResponse', [P.str(2, id)]);
  }

  scheduledTransfers() {
    return this._post('transfer/scheduled/contract/list/all', 'ContractListAllRequest', 'ContractListAllResponse');
  }

  // ---- cashback, cheques, contacts ----

  cashbackCategories() {
    return this._post('cashback/category/list', 'CashbackCategoryListRequest', 'CashbackCategoryListResponse');
  }

  cashbackVendors() {
    return this._post('cashback/vendor/list', 'CashbackVendorListRequest', 'CashbackVendorListResponse');
  }

  cheques() {
    return this._post('cheque/registry/list', 'ChequeRegistryListRequest', 'ChequeRegistryListResponse');
  }

  recentContacts() {
    return this._post('contact/recent/list', 'ContactRecentListRequest', 'ContactRecentListResponse');
  }

  // ---- payments: charge, internet, bill ----

  chargeRecentPhones() {
    return this._servicePost('mobile-charge/payment/recent/phone/list', 'PaymentListRecentPhonesRequest', 'PaymentListRecentPhonesResponse', 'mobile-charge');
  }

  internetRecentPhones() {
    return this._servicePost('internet-package/payment/recent/phone/list', 'PaymentListRecentPhonesRequest', 'PaymentListRecentPhonesResponse', 'internet-package');
  }

  billFavorites() {
    return this._servicePost('bill/favorite/list', 'BillListFavoritesRequest', 'BillListFavoritesResponse', 'bill');
  }

  // Payment routes carry a `blubank://payment-service/<name>` URI two levels deep.
  _servicePost(path, req, resp, service) {
    return this._post(path, req, resp, [P.msg(3, [P.msg(3, [P.str(1, `blubank://payment-service/${service}`)])])]);
  }

  // ---- general ----

  banners() {
    return this._post('general/banner/list', 'GeneralListBannersRequest', 'GeneralListBannersResponse', [P.msg(3, [P.num(2, 1)])]);
  }

  onboardingSlides() {
    return this._post('general/onboarding-slides/list', 'GeneralListOnboardingSlidesRequest', 'GeneralListOnboardingSlidesResponse');
  }

  banks() {
    return this._post('general/banks/list', 'GeneralListBanksRequest', 'GeneralListBanksResponse');
  }

  juniorChildren() {
    return this._post('junior/children/list', 'JuniorChildrenListRequest', 'JuniorChildrenListResponse');
  }

  async identities() {
    await this.c.ensure();
    const body = Buffer.from(
      JSON.stringify({
        identifier: this.c.s.username || '',
        traits: [
          { trait_key: 'user_username', trait_value: this.c.s.username || '' },
          { trait_key: 'device_platform_os', trait_value: 'WEB' },
          { trait_key: 'device_platform_version', trait_value: '17.5' },
        ],
      }),
      'utf8'
    );
    return this.c.raw('identities/', { body, signed: true, headers: { 'content-type': 'application/json' } });
  }

  // ---- one-click device registration ----

  async registerOneClick() {
    await this.c.ensure();
    const kp = X.newKeyPair();
    const body = Buffer.concat([
      await this._app(),
      P.bytes(2, deviceIdBinary(this.c.s.deviceId)),
      P.bytes(3, X.exportSpki(kp.publicKey)),
    ]);
    return this.c.call(
      'payment/one-click/device/register',
      NS + 'OneClickPaymentRegisterDeviceRequest',
      NS + 'OneClickPaymentRegisterDeviceResponse',
      body
    );
  }
}

// {f1:{f1:value}, f2:{f1:isoCode}}
function money({ value, currency = 'IRR' }) {
  return P.msg(2, [P.msg(1, [P.str(1, String(value))]), P.msg(2, [P.str(1, currency)])]);
}

// Source account: f3{f3{f1{f1:card, f2{f1:bank}}}}
function sourceBlock({ card, bank }) {
  return P.msg(3, [P.msg(3, [P.msg(1, [P.str(1, card), P.msg(2, [P.str(1, bank)])])])]);
}

// Destination: f4{f2{f1:card, f2{f1:bank}}, f14{f1:bank}, f15:formatted}
function destination({ card, bank, formatted }) {
  return P.msg(4, [
    P.msg(2, [P.str(1, card), P.msg(2, [P.str(1, bank)])]),
    P.msg(14, [P.str(1, bank)]),
    P.str(15, formatted || card),
  ]);
}

module.exports = { Api, money, sourceBlock, destination };
