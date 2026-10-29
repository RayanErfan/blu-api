'use strict';

module.exports = {
  BASE: 'https://openapi.sdb247.com/openapi/v0/',
  ORIGIN: 'https://app.blubank.com',
  APP_VERSION: [3, 11, 0, 30],
  PLATFORM: 3,
  OS: 17,
  LOCALE: 'fa_IR',
  UA_FAMILY: 'Mobile Safari',
  PROFILE: 'main',
  PROFILE_ID: '611828006434380101',
  PROFILE_TYPE: 41,
  BUNDLE: 'blu.saman.solutions',
  ENV_KEY: 'f6s95EHQRkUu77f7sS38Nk',
  FLAGS: 'https://openapi.sdb247.com/openapi/v0/flags/',
  UA: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // request message types
  T: {
    keyExchange: 'solutions.saman.bluebank.services.SessionKeyExchangeRequest',
    keyExchangeR: 'solutions.saman.bluebank.services.SessionKeyExchangeResponse',
    login: 'solutions.saman.bluebank.services.SessionLoginRequest',
    loginR: 'solutions.saman.bluebank.services.SessionLoginResponse',
    otpVerify: 'solutions.saman.bluebank.services.UserOTPVerifyRequest',
    otpVerifyR: 'solutions.saman.bluebank.services.UserOTPVerifyResponse',
  },
};
