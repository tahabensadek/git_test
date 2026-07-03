/* ================= BOOT ================= */
(function () {
  'use strict';
  // sha256 self-check — if this ever fails, fairness claims would be wrong
  if (typeof sha256hex !== 'function' ||
      sha256hex('abc') !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') {
    console.error('SHA-256 self-test failed');
  }
  Casino.showPage('home');
})();
