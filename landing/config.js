/*
 * TravelCRM Pro landing page: the ONE place the owner fills in real values.
 * Everything marked OWNER must be replaced before the page goes live; empty values switch the matching
 * feature off (no WhatsApp button, no film button, no verification widget, no city line).
 * Nothing here is a secret: this file is public. Never put an API key or secret in it.
 */
window.TRAVELCRM_CONFIG = {
  // OWNER: the public API address, no trailing slash. Empty = same origin as this page ("/api/v1/...").
  // For a local test against fix-stack slot 1 use the slot's API URL, e.g. "http://localhost:8787".
  apiBase: '',

  // OWNER: the public web address of this site (used in the sitemap and og:url; the HTML and sitemap.xml
  // currently say https://travelcrm.pro, a placeholder domain).
  siteUrl: 'https://travelcrm.pro',

  // OWNER: inbox that receives mail from the site's footer (shown in the footer).
  contactEmail: 'hello@travelcrm.pro',

  // OWNER: a real WhatsApp number in international format, digits only, e.g. "919812345678". Empty = no button.
  whatsappNumber: '',

  // OWNER: link to the film or demo video (YouTube/Vimeo/own file). Empty = no "Watch the film" button.
  demoVideoUrl: '',

  // OWNER: where agencies download the app once there is a public link. Empty = not shown anywhere.
  appDownloadUrl: '',

  // OWNER: Cloudflare Turnstile SITE key (public). Empty = the form works without the verification widget.
  // The matching secret goes in the backend as TURNSTILE_SECRET (when it is set, the widget becomes mandatory).
  turnstileSiteKey: '',

  // OWNER: a real city (and country) for the footer, e.g. "Pune, India". Empty = no address line.
  city: '',

  // OWNER: the registered legal entity name (footer and legal pages), e.g. "Example Travel Tech Private Limited".
  legalEntity: '',

  // OWNER: the sender address for system mail (legal pages quote it as the privacy contact).
  senderEmail: '',
};
