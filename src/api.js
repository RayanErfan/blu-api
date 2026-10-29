'use strict';
// Domain layer. Each method is a thin wrapper over one gateway route.
// Request bodies are the shared app block (optionally carrying the profile
// block) plus route-specific fields.

const C = require('./config');
const P = require('./proto');
const X = require('./crypto');
const { appBlock, deviceIdBinary } = require('./client');

const NS = 'solutions.saman.bluebank.services.';

class Api {
  constructor(client) {
    this.c = client;
  }

  async _app() {
    return appBlock(this.c.s.deviceId, true, await this.c.profileId());
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

  profiles() {
    return this._post('account-profile/profile/list', 'AccountProfileListRequest', 'AccountProfileListResponse');
  }

  deposits() {
    return this._post('account/deposit/list/all', 'AccountListAllRequest', 'AccountListAllResponse');
  }

  cards() {
    return this._post('deposit-fund/recent-card/list', 'DepositFundListRecentCardsRequest', 'DepositFundListRecentCardsResponse');
  }

  allCards() {
    return this._post('account/card/list/all', 'CardListAllRequest', 'CardListAllResponse');
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

  transactions() {
    return this._post('account/transaction/list/all', 'AccountTransactionListAllRequest', 'AccountTransactionListAllResponse');
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
