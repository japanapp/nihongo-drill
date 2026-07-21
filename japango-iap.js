/*
 * japango-iap.js
 * ---------------------------------------------------------------------------
 * Bridges the RevenueCat Capacitor plugin to the window.JapanGoIAP contract
 * that index.html already expects:
 *
 *   window.JapanGoIAP.getEntitlement() -> Promise<{ hasFullAccess:boolean, priceString?:string }>
 *   window.JapanGoIAP.purchase()       -> Promise<boolean>   (true = purchased)
 *   window.JapanGoIAP.restore()        -> Promise<boolean>   (true = something restored)
 *
 * Loaded only inside the native (Capacitor) app. On the plain web/PWA this
 * file is still harmless: if the RevenueCat plugin isn't present it simply
 * does not define window.JapanGoIAP, so index.html falls back to free tier.
 *
 * Verified against @revenuecat/purchases-capacitor@13.2.3.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // ---- Configuration (matches App Store Connect + RevenueCat dashboard) ----
  var REVENUECAT_IOS_API_KEY = 'appl_oBNSzFZEJLENUYHTdUoFwEtvUIX';
  var ENTITLEMENT_ID = 'full_access';
  var PRODUCT_ID = 'com.habi.japango.fullaccess';

  // Resolve the RevenueCat plugin. In a Capacitor build it is exposed as a
  // Capacitor plugin; the npm import also attaches it. We look in the standard
  // places and bail out quietly if it isn't there (web/dev).
  function getPurchases() {
    try {
      if (window.Capacitor &&
          window.Capacitor.Plugins &&
          window.Capacitor.Plugins.Purchases) {
        return window.Capacitor.Plugins.Purchases;
      }
    } catch (e) {}
    // Fallback: some bundlers attach it globally.
    if (window.Purchases) return window.Purchases;
    return null;
  }

  var Purchases = getPurchases();
  if (!Purchases) {
    // Not a native build — leave window.JapanGoIAP undefined so the app
    // uses its free-tier fallback. No error, by design.
    return;
  }

  // Configure the SDK once, as early as possible.
  var configured = false;
  function ensureConfigured() {
    if (configured) return Promise.resolve();
    configured = true;
    return Promise.resolve(
      Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY })
    ).catch(function (e) {
      // If configure fails, allow a later retry.
      configured = false;
      throw e;
    });
  }

  // Does this CustomerInfo grant our entitlement?
  function hasEntitlement(customerInfo) {
    try {
      return !!(customerInfo &&
                customerInfo.entitlements &&
                customerInfo.entitlements.active &&
                customerInfo.entitlements.active[ENTITLEMENT_ID]);
    } catch (e) {
      return false;
    }
  }

  // Find the package to purchase (and read its localized price) from the
  // current offering. Prefers the current offering's first package; falls
  // back to scanning all offerings for one whose product matches PRODUCT_ID.
  function findPackage(offerings) {
    try {
      var pkgs = [];
      if (offerings && offerings.current && offerings.current.availablePackages) {
        pkgs = pkgs.concat(offerings.current.availablePackages);
      }
      if (offerings && offerings.all) {
        Object.keys(offerings.all).forEach(function (k) {
          var off = offerings.all[k];
          if (off && off.availablePackages) pkgs = pkgs.concat(off.availablePackages);
        });
      }
      // Prefer an exact product match, else the first available package.
      for (var i = 0; i < pkgs.length; i++) {
        var p = pkgs[i];
        if (p && p.product && p.product.identifier === PRODUCT_ID) return p;
      }
      return pkgs.length ? pkgs[0] : null;
    } catch (e) {
      return null;
    }
  }

  // ---- The public contract expected by index.html -------------------------
  window.JapanGoIAP = {

    // Returns { hasFullAccess, priceString? }. Never rejects — on any failure
    // it reports no access and no price, so the app stays on free tier safely.
    getEntitlement: function () {
      return ensureConfigured()
        .then(function () {
          return Promise.all([
            Purchases.getCustomerInfo().catch(function () { return null; }),
            Purchases.getOfferings().catch(function () { return null; })
          ]);
        })
        .then(function (results) {
          var infoResult = results[0];
          var offerings = results[1];
          var customerInfo = infoResult && infoResult.customerInfo
            ? infoResult.customerInfo : infoResult;
          var out = { hasFullAccess: hasEntitlement(customerInfo) };
          var pkg = findPackage(offerings);
          if (pkg && pkg.product && pkg.product.priceString) {
            out.priceString = pkg.product.priceString;
          }
          return out;
        })
        .catch(function () {
          return { hasFullAccess: false };
        });
    },

    // Runs the native purchase. Resolves true if the entitlement is active
    // afterwards. Throws on genuine failure so index.html shows its error
    // modal — EXCEPT user-cancellation, which resolves false (no error shown).
    purchase: function () {
      return ensureConfigured()
        .then(function () { return Purchases.getOfferings(); })
        .then(function (offerings) {
          var pkg = findPackage(offerings);
          if (!pkg) throw new Error('No purchasable package found');
          return Purchases.purchasePackage({ aPackage: pkg });
        })
        .then(function (result) {
          var customerInfo = result && result.customerInfo;
          return hasEntitlement(customerInfo);
        })
        .catch(function (e) {
          // RevenueCat reports user cancellation via userCancelled flag or a
          // PURCHASE_CANCELLED error code. Treat as a benign "false".
          if (e && (e.userCancelled === true ||
                    e.code === 'PURCHASE_CANCELLED' ||
                    e.code === '1' /* PURCHASES_ERROR_CODE.PURCHASE_CANCELLED */)) {
            return false;
          }
          throw e; // genuine failure -> index.html shows its error modal
        });
    },

    // Restores prior purchases. Resolves true if the entitlement is active
    // afterwards, false if nothing was restored. Throws on store errors.
    restore: function () {
      return ensureConfigured()
        .then(function () { return Purchases.restorePurchases(); })
        .then(function (result) {
          var customerInfo = result && result.customerInfo
            ? result.customerInfo : result;
          return hasEntitlement(customerInfo);
        });
    }
  };
})();
