/* TravelCRM Pro landing page. Plain JS, no build step. Reads window.TRAVELCRM_CONFIG from config.js. */
(function () {
  'use strict';

  var CONFIG = window.TRAVELCRM_CONFIG || {};
  var isLanding = !!document.getElementById('enquiry-form') || !!document.getElementById('navbar');

  function icons() {
    // The icon library is optional: if it did not load, icon boxes keep their size and the page still works.
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }

  // ========== Config values (footer, legal pages) ==========
  document.querySelectorAll('[data-config]').forEach(function (el) {
    var v = CONFIG[el.getAttribute('data-config')];
    if (v) { el.textContent = v; el.classList.remove('todo'); }
  });
  document.querySelectorAll('[data-config-show]').forEach(function (el) {
    var key = el.getAttribute('data-config-show');
    if (!CONFIG[key]) return;
    if (key === 'demoVideoUrl' && el.tagName === 'A') {
      el.setAttribute('href', CONFIG[key]);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
    }
    el.hidden = false;
  });
  document.querySelectorAll('[data-config-mailto]').forEach(function (el) {
    var v = CONFIG[el.getAttribute('data-config-mailto')];
    if (v) el.setAttribute('href', 'mailto:' + v);
  });
  var wa = document.getElementById('whatsapp-btn');
  if (wa && /^\d{8,15}$/.test(String(CONFIG.whatsappNumber || ''))) {
    wa.setAttribute('href', 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent('Hi, I would like a demo of TravelCRM Pro'));
    wa.hidden = false;
  }

  if (!isLanding) { icons(); return; }

  var apiBase = String(CONFIG.apiBase || '').replace(/\/+$/, '');

  // ========== Scroll Reveal ==========
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    reveals.forEach(function (el) { observer.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  // ========== Navbar scroll effect ==========
  var navbar = document.getElementById('navbar');
  window.addEventListener('scroll', function () {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });

  // ========== Mobile menu ==========
  var menuToggle = document.getElementById('menu-toggle');
  var mobileMenu = document.getElementById('mobile-menu');
  menuToggle.addEventListener('click', function () {
    var open = mobileMenu.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  mobileMenu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      mobileMenu.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });

  // ========== FAQ accordion ==========
  document.querySelectorAll('.faq-item__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.parentElement;
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(function (i) {
        i.classList.remove('open');
        var q = i.querySelector('.faq-item__q');
        if (q) q.setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ========== Enquiry form ==========
  var form = document.getElementById('enquiry-form');
  var errorBox = document.getElementById('enquiry-error');
  var successBox = document.getElementById('enquiry-success');
  var submitBtn = form.querySelector('button[type="submit"]');
  var turnstileToken = '';

  function setKind(kind) {
    var radio = form.querySelector('input[name="kind"][value="' + kind + '"]');
    if (radio) radio.checked = true;
  }

  // Every call to action carries data-enquire="demo|signup|contact": pick that kind, scroll to the form, focus the first field.
  document.querySelectorAll('[data-enquire]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      setKind(a.getAttribute('data-enquire'));
      var target = document.getElementById('enquire');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var first = document.getElementById('f-name');
      window.setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (err) { first.focus(); } }, 450);
      if (history.replaceState) history.replaceState(null, '', '#enquire');
    });
  });

  // Smooth scroll for the other in-page links
  document.querySelectorAll('a[href^="#"]:not([data-enquire])').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var id = anchor.getAttribute('href');
      var target = id.length > 1 ? document.querySelector(id) : null;
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Turnstile: only when the owner set a site key. The script is Cloudflare's own and cannot be self-hosted.
  if (CONFIG.turnstileSiteKey) {
    var slot = document.getElementById('turnstile-slot');
    slot.hidden = false;
    window.onTravelcrmTurnstile = function () {
      window.turnstile.render(slot, {
        sitekey: CONFIG.turnstileSiteKey,
        callback: function (t) { turnstileToken = t; },
        'expired-callback': function () { turnstileToken = ''; },
        'error-callback': function () { turnstileToken = ''; },
      });
    };
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTravelcrmTurnstile';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  function showError(msg, fieldName) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    if (fieldName) {
      var el = form.querySelector('[name="' + fieldName + '"]');
      if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
    }
  }

  function clearErrors() {
    errorBox.hidden = true;
    errorBox.textContent = '';
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    var data = new FormData(form);
    var name = String(data.get('name') || '').trim();
    var email = String(data.get('email') || '').trim();
    if (!name) return showError('Please enter your name.', 'name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please enter a valid email address.', 'email');
    if (CONFIG.turnstileSiteKey && !turnstileToken) return showError('Please complete the verification first.');

    var body = {
      kind: String(data.get('kind') || 'contact'),
      name: name,
      email: email,
      phone: String(data.get('phone') || '').trim(),
      company: String(data.get('company') || '').trim(),
      country: String(data.get('country') || '').trim(),
      agentsCount: String(data.get('agentsCount') || '').trim(),
      message: String(data.get('message') || '').trim(),
      sourceUrl: location.origin + location.pathname,
      website: String(data.get('website') || ''),
      turnstileToken: turnstileToken,
    };

    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    fetch(apiBase + '/api/v1/public/enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (res.status === 202) {
          form.hidden = true;
          successBox.hidden = false;
          successBox.focus();
          return;
        }
        return res.json().catch(function () { return {}; }).then(function (j) {
          if (res.status === 429) return showError('Too many requests from this device or email. We already have your details and will be in touch.');
          if (res.status === 413) return showError('That message is too long. Please shorten it.');
          var field = j && j.fields ? Object.keys(j.fields)[0] : undefined;
          showError((j && j.error) || 'Something went wrong. Please try again in a moment.', field);
        });
      })
      .catch(function () {
        showError('We could not reach the server. Please check your connection and try again, or email us at ' + (CONFIG.contactEmail || 'the address in the footer') + '.');
      })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
        if (window.turnstile && CONFIG.turnstileSiteKey && !form.hidden) { turnstileToken = ''; try { window.turnstile.reset(); } catch (err) { /* ignore */ } }
      });
  });

  // ========== Pricing from the live price list ==========
  var cards = document.getElementById('pricing-cards');
  var packsList = document.getElementById('pricing-packs');

  function money(amount, currency) {
    try {
      return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency: currency, maximumFractionDigits: 0 }).format(amount);
    } catch (err) {
      return currency + ' ' + amount;
    }
  }
  function num(n) { return new Intl.NumberFormat('en-IN').format(n); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function feature(text) {
    var row = el('div', 'pricing__feature');
    var i = document.createElement('i');
    i.setAttribute('data-lucide', 'check');
    row.appendChild(i);
    row.appendChild(el('span', '', text));
    return row;
  }

  function renderPlans(view) {
    var plans = (view.plans || []).filter(function (p) { return typeof p.yearlyPrice === 'number'; });
    if (!plans.length) return false;
    var popular = plans.length >= 3 ? plans[1].key : null;
    var frag = document.createDocumentFragment();
    plans.forEach(function (p) {
      var card = el('div', 'pricing__card' + (p.key === popular ? ' pricing__card--popular' : ''));
      if (p.key === popular) {
        var badge = el('div', 'pricing__badge');
        var ci = document.createElement('i');
        ci.setAttribute('data-lucide', 'crown');
        badge.appendChild(ci);
        badge.appendChild(document.createTextNode(' Most chosen'));
        card.appendChild(badge);
      }
      card.appendChild(el('div', 'pricing__name', p.name));
      var price = el('div', 'pricing__price');
      price.appendChild(el('span', 'pricing__amount', money(p.yearlyPrice, p.currency)));
      price.appendChild(el('span', 'pricing__period', '/agency/year'));
      card.appendChild(price);
      if (p.priceKind === 'founder' && p.listYearlyPrice && p.founderEndsAt) {
        var until = new Date(p.founderEndsAt);
        var months = p.founderLockMonths || 24;
        card.appendChild(el('div', 'pricing__note', 'Launch price, locked for ' + months + ' months for agencies that sign before ' + until.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) + '. ' + money(p.listYearlyPrice, p.currency) + ' after that.'));
      }
      if (p.description) card.appendChild(el('div', 'pricing__desc', p.description));
      var cta = el('a', 'pricing__cta ' + (p.key === popular ? 'pricing__cta--primary' : 'pricing__cta--ghost'), 'Request a free trial');
      cta.setAttribute('href', '#enquire');
      cta.setAttribute('data-enquire', 'signup');
      card.appendChild(cta);
      var list = el('div', 'pricing__features');
      list.appendChild(feature('Up to ' + p.includedUsers + ' users included'));
      if (p.extraUserYearlyPrice) list.appendChild(feature(money(p.extraUserYearlyPrice, p.currency) + ' per extra user per year'));
      var a = p.allowances || {};
      if (a.ai_credits > 0) list.appendChild(feature(num(a.ai_credits) + ' AI credits a month'));
      if (a.whatsapp > 0) list.appendChild(feature(num(a.whatsapp) + ' WhatsApp messages a month'));
      if (a.whatsapp_marketing > 0) list.appendChild(feature(num(a.whatsapp_marketing) + ' WhatsApp marketing messages a month'));
      if (a.sms > 0) list.appendChild(feature(num(a.sms) + ' texts (SMS) a month'));
      if (a.otp > 0) list.appendChild(feature(num(a.otp) + ' login codes a month'));
      if (a.email > 0) list.appendChild(feature(num(a.email) + ' system emails a month'));
      if (a.call_minutes > 0) list.appendChild(feature(num(a.call_minutes) + ' call minutes a month'));
      card.appendChild(list);
      frag.appendChild(card);
    });
    cards.textContent = '';
    cards.appendChild(frag);
    cards.setAttribute('data-source', 'live');

    var addons = (view.addons || []).filter(function (x) { return typeof x.price === 'number'; });
    if (packsList && addons.length) {
      packsList.textContent = '';
      addons.forEach(function (x) { packsList.appendChild(el('li', '', x.name + ': ' + money(x.price, x.currency))); });
      packsList.hidden = false;
    }
    return true;
  }

  if (cards && 'fetch' in window) {
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctl ? window.setTimeout(function () { ctl.abort(); }, 6000) : null;
    fetch(apiBase + '/api/v1/public/plans?market=IN', { headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined })
      .then(function (res) { if (!res.ok) throw new Error('plans ' + res.status); return res.json(); })
      .then(function (body) {
        if (renderPlans((body && body.data) || {})) {
          // new cards need their data-enquire handlers and icons
          cards.querySelectorAll('[data-enquire]').forEach(function (a) {
            a.addEventListener('click', function (e) {
              e.preventDefault();
              setKind('signup');
              document.getElementById('enquire').scrollIntoView({ behavior: 'smooth', block: 'start' });
              window.setTimeout(function () { document.getElementById('f-name').focus({ preventScroll: true }); }, 450);
            });
          });
          icons();
        }
      })
      .catch(function () { /* keep the static fallback */ })
      .then(function () { if (timer) window.clearTimeout(timer); });
  }

  // Cookie notice (R208): the site sets no tracking cookies. Shown until dismissed; the choice lives in localStorage.
  (function () {
    var KEY = 'cookie-notice-dismissed';
    var box = document.getElementById('cookie-notice');
    var btn = document.getElementById('cookie-notice-dismiss');
    if (!box || !btn) return;
    var dismissed = false;
    try { dismissed = window.localStorage.getItem(KEY) === '1'; } catch (e) { /* storage blocked: show the notice each visit */ }
    if (dismissed) return;
    box.hidden = false;
    btn.addEventListener('click', function () {
      box.hidden = true;
      try { window.localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
    });
  })();

  icons();
})();
