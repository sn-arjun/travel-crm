/* Legal pages: fill owner values from /config.js (same rules as the site: empty values keep the placeholder). */
(function () {
  'use strict';
  var CONFIG = window.TRAVELCRM_CONFIG || {};
  document.querySelectorAll('[data-config]').forEach(function (el) {
    var v = CONFIG[el.getAttribute('data-config')];
    if (v) { el.textContent = v; el.classList.remove('todo'); }
  });
  document.querySelectorAll('[data-config-mailto]').forEach(function (el) {
    var v = CONFIG[el.getAttribute('data-config-mailto')];
    if (v) el.setAttribute('href', 'mailto:' + v);
  });
})();
