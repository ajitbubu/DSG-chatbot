/*!
 * ID-PRIVACY® Chatbot Widget
 * Embeddable, self-contained chat widget for the Data Safeguard / ID-PRIVACY® Contact Us page.
 *
 * Embed:
 *   <script src="https://your-domain.com/idprivacy-chatbot.js" defer></script>
 *
 * Optional configuration (place BEFORE the script tag):
 *   <script>
 *     window.IDPrivacyChatbotConfig = {
 *       webhookUrl: "https://example.com/api/contact-lead",
 *       companyName: "Data Safeguard",
 *       productName: "ID-PRIVACY®",
 *       defaultAssignee: "Privacy Automation Team",
 *       people: ["Sales / Product Specialist", "Privacy Consultant",
 *                "Technical Architect"],
 *       // Optional future-calendar placeholders:
 *       // calendly: { url: "https://calendly.com/your-team/intro" },
 *       // googleCalendar: { enabled: false },
 *       // outlookCalendar: { enabled: false }
 *     };
 *   </script>
 *
 * Public API: window.IDPrivacyChatbot
 *   .open()    open the panel
 *   .close()   close the panel
 *   .toggle()  toggle the panel
 *   .reset()   clear session and restart
 *   .destroy() remove from DOM
 *
 * No external runtime dependencies. No global pollution beyond `window.IDPrivacyChatbot`.
 */
(function () {
  'use strict';

  // Guard against double-load (e.g. paste into Webflow header AND footer).
  if (window.IDPrivacyChatbot && window.IDPrivacyChatbot.__loaded) return;

  // ---------- Configuration ----------
  var DEFAULTS = {
    webhookUrl: 'https://example.com/api/contact-lead',
    companyName: 'Data Safeguard',
    productName: 'ID-PRIVACY®',
    defaultAssignee: 'Privacy Automation Team',
    people: [
      'Sales / Product Specialist',
      'Privacy Consultant',
      'Technical Architect'
    ],
    storageKey: 'idp_chatbot_session_v1',
    typingDelayMs: 600,
    // Lead email policy: require a work email (reject Gmail/Yahoo/etc.).
    allowFreeEmail: false,        // set true to accept personal/free email providers
    extraFreeEmailDomains: null,  // e.g. ['contractor.io'] to block additional domains
    // Theme: override any subset of the dark-brand CSS variables, e.g.
    //   theme: { accent: '#16a34a', bg: '#0b1f14', surface: '#10271b' }
    // Keys: accent, accentHover, onAccent, bg, surface, surface2, text, muted, border
    theme: null,
    // ----- Intro video (self-hosted MP4, shown at the very top of the chat panel) -----
    // introVideoUrl points at your MP4 — host it on your CDN in production. Set
    // introVideo:false to hide the video. introVideoPoster (optional) is an image
    // shown before the first frame paints.
    introVideo: true,
    introVideoUrl: 'DataSafeguard-webflow_540.mp4',
    introVideoPoster: '',
    // The video shows as a centered card (introVideoWidth × introVideoHeight, px) at
    // the top of the panel, filled via object-fit:cover. If the card ratio differs
    // from the source's 9:16, the video is cropped to fill; introVideoPosition frames
    // which part stays visible ('center 50%' = centered face). All overridable via
    // the matching --idp-video-* CSS variables.
    introVideoWidth: 180,
    introVideoHeight: 250,
    introVideoPosition: 'center 50%',
    // Start with sound ON by default. Browsers only allow unmuted autoplay when
    // there's user activation (opening the chat is a click, so it normally works);
    // if the browser blocks it, the widget falls back to muted automatically.
    // Set introVideoMuted:true to always start muted.
    introVideoMuted: false,
    // Calendar integration placeholders — wired up here so future work
    // only needs to flip a flag / supply a URL.
    calendly: null,        // { url: "https://calendly.com/..." }
    googleCalendar: null,  // { enabled: false }
    outlookCalendar: null  // { enabled: false }
  };

  var userConfig = (window.IDPrivacyChatbotConfig && typeof window.IDPrivacyChatbotConfig === 'object')
    ? window.IDPrivacyChatbotConfig : {};
  var CFG = Object.assign({}, DEFAULTS, userConfig);

  // ---------- Product catalogue ----------
  // Maps an internal intent key to the customer-facing module name shown in
  // recommendations and sent in the lead payload.
  var PRODUCTS = {
    consent:    'Universal Consent Management',
    cookie:     'Cookie Consent and Cookie Scanning',
    scriptBlock:'AI-Powered Script Blocking',
    dsar:       'Data Subject Access Rights / DSAR',
    pia:        'Privacy Impact Assessment / PIA',
    discovery:  'Data Discovery',
    redaction:  'Data Redaction / Masking',
    audit:      'Compliance Audit',
    breach:     'Data Breach Management',
    aiGov:      'AI Governance / Responsible AI Compliance',
    schedule:   null,   // 'Schedule a call' is a flow, not a product
    unsure:     null
  };

  // Free-text keyword → intent. Order matters only for tie-breaking; we count hits.
  var KEYWORDS = [
    { intent: 'consent',    words: ['consent', 'opt-in', 'opt in', 'opt-out', 'opt out', 'preference', 'gpc', 'global privacy control'] },
    { intent: 'cookie',     words: ['cookie', 'banner', 'scan', 'tracking', 'google consent mode', 'tag manager'] },
    { intent: 'scriptBlock',words: ['script block', 'script blocking', 'tag block', 'pre-consent'] },
    { intent: 'dsar',       words: ['dsar', 'access request', 'deletion request', 'consumer rights', 'data subject', 'right to know', 'right to delete'] },
    { intent: 'discovery',  words: ['pii', 'phi', 'discovery', 'data discovery', 'classify', 'classification', 'inventory'] },
    { intent: 'redaction',  words: ['mask', 'masking', 'redact', 'redaction', 'tokenize', 'tokenization', 'anonymize'] },
    { intent: 'pia',        words: ['pia', 'dpia', 'assessment', 'risk assessment', 'privacy impact'] },
    { intent: 'aiGov',      words: ['ai governance', 'model risk', 'eu ai act', 'responsible ai', 'ai compliance', 'llm governance'] },
    { intent: 'audit',      words: ['audit', 'compliance audit', 'gap analysis', 'iso 27701'] },
    { intent: 'breach',     words: ['breach', 'incident', 'leak', 'exposure', 'breach management'] },
    { intent: 'schedule',   words: ['demo', 'call', 'meeting', 'pricing', 'sales', 'schedule', 'talk to', 'speak with'] }
  ];

  // ---------- Conversation flow definition ----------
  // Each step describes what the bot says and which quick-replies it offers.
  // Steps are pure data so the engine stays small and predictable.
  var INITIAL_GREETING = "Hi, I'm the " + CFG.productName + " assistant. I can help you find the right privacy solution or schedule a call with our team. What are you looking for today?";

  var INITIAL_OPTIONS = [
    { label: 'I need consent management',                value: 'consent'    },
    { label: 'I need cookie scanning / cookie banner',   value: 'cookie'     },
    { label: 'I need DSAR automation',                   value: 'dsar'       },
    { label: 'I need data discovery or redaction',       value: 'discovery'  }, // disambiguated later
    { label: 'I need privacy impact assessment',         value: 'pia'        },
    { label: 'I need AI governance',                     value: 'aiGov'      },
    { label: 'I want to schedule a call',                value: 'schedule'   },
    { label: "I'm not sure",                             value: 'unsure'     }
  ];

  var QUALIFICATION_QUESTIONS = [
    {
      key: 'companySize',
      prompt: 'Roughly how many employees does your company have?',
      options: ['1–50', '51–500', '501–5,000', '5,000+']
    },
    {
      key: 'industry',
      prompt: 'Which industry best describes you?',
      options: ['Financial Services', 'Healthcare', 'Retail / E-commerce', 'Technology / SaaS', 'Government / Public Sector', 'Other']
    },
    {
      key: 'region',
      prompt: 'Which regulations are most relevant to you?',
      options: ['GDPR (EU/UK)', 'CPRA / CCPA (California)', 'DPDP (India)', 'HIPAA (US Healthcare)', 'Other / Multiple']
    },
    {
      key: 'painPoint',
      prompt: 'What is your biggest pain point right now?',
      // Free-text — answered by typing.
      freeText: true,
      placeholder: 'e.g. manual DSAR fulfillment is slow…'
    },
    {
      key: 'timeline',
      prompt: 'What is your timeline?',
      options: ['Urgent (this month)', 'This quarter', 'Exploratory']
    }
  ];

  // ---------- Utilities ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isValidEmail(s) {
    if (!s) return false;
    // Pragmatic email regex — RFC-perfect regexes are pathological; this catches
    // typos without rejecting legitimate addresses.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  }

  // Free / personal / disposable providers. Leads must use a work email so the
  // sales team can qualify them. Extend via config.extraFreeEmailDomains.
  var FREE_EMAIL_DOMAINS = {
    'gmail.com':1,'googlemail.com':1,'yahoo.com':1,'yahoo.co.uk':1,'yahoo.co.in':1,
    'ymail.com':1,'rocketmail.com':1,'hotmail.com':1,'hotmail.co.uk':1,'hotmail.fr':1,
    'outlook.com':1,'live.com':1,'msn.com':1,'aol.com':1,'icloud.com':1,'me.com':1,
    'mac.com':1,'protonmail.com':1,'proton.me':1,'pm.me':1,'gmx.com':1,'gmx.de':1,
    'gmx.net':1,'mail.com':1,'zoho.com':1,'yandex.com':1,'yandex.ru':1,'mail.ru':1,
    'tutanota.com':1,'hey.com':1,'fastmail.com':1,'hushmail.com':1,'qq.com':1,
    '163.com':1,'126.com':1,'sina.com':1,'naver.com':1,'rediffmail.com':1,
    'comcast.net':1,'verizon.net':1,'att.net':1,'sbcglobal.net':1,'cox.net':1,
    'bellsouth.net':1,'btinternet.com':1,'orange.fr':1,'free.fr':1,'web.de':1,
    't-online.de':1,'libero.it':1,
    // disposable / throwaway
    'mailinator.com':1,'guerrillamail.com':1,'10minutemail.com':1,'trashmail.com':1,
    'temp-mail.org':1,'yopmail.com':1,'getnada.com':1,'throwawaymail.com':1,
    'sharklasers.com':1,'dispostable.com':1
  };

  // Disposable / throwaway email domains come from the optional
  // disposable-domains.js file (window.IDPDisposableEmailDomains), loaded before
  // this script. Absent → only the built-in free-provider list above applies.
  // Built into a Set once, on first use (load-order independent).
  var _disposableSet = null;
  function getDisposableDomains() {
    if (_disposableSet) return _disposableSet;
    var data = window.IDPDisposableEmailDomains;
    if (data instanceof Set) _disposableSet = data;
    else if (typeof data === 'string') _disposableSet = new Set(data.split(' ').filter(Boolean));
    else if (Array.isArray(data)) _disposableSet = new Set(data);
    else return new Set(); // not loaded yet — return empty without caching, retry next call
    return _disposableSet;
  }

  function emailDomain(s) {
    var v = String(s).trim().toLowerCase();
    var at = v.lastIndexOf('@');
    return at === -1 ? '' : v.slice(at + 1);
  }

  function isBusinessEmail(s) {
    if (CFG.allowFreeEmail) return true;
    var domain = emailDomain(s);
    if (!domain) return false;
    if (FREE_EMAIL_DOMAINS[domain]) return false;
    if (getDisposableDomains().has(domain)) return false;
    if (CFG.extraFreeEmailDomains && CFG.extraFreeEmailDomains.indexOf(domain) !== -1) return false;
    return true;
  }

  function nowIso() { return new Date().toISOString(); }

  function safeStorageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeStorageSet(key, val) {
    try { window.localStorage.setItem(key, val); } catch (e) { /* private mode etc. */ }
  }
  function safeStorageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) {}
  }

  function detectIntent(text) {
    if (!text) return null;
    var lower = String(text).toLowerCase();
    var best = null, bestScore = 0;
    for (var i = 0; i < KEYWORDS.length; i++) {
      var entry = KEYWORDS[i], score = 0;
      for (var j = 0; j < entry.words.length; j++) {
        if (lower.indexOf(entry.words[j]) !== -1) score++;
      }
      if (score > bestScore) { best = entry.intent; bestScore = score; }
    }
    return best;
  }

  // ---------- CSS (injected once) ----------
  // All selectors are prefixed with `idp-chatbot-` to avoid colliding with
  // Webflow site styles. The CSS is scoped via the prefix; we don't touch any
  // global element selectors.
  // Theme is driven by CSS custom properties on .idp-chatbot-root. Defaults match
  // datasafeguard.us (dark navy + periwinkle accent). Override any token via
  // IDPrivacyChatbotConfig.theme — see applyTheme().
  var STYLE = ''
    + '.idp-chatbot-root,.idp-chatbot-root *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}'
    + '.idp-chatbot-root{--idp-accent:#6fa8ff;--idp-accent-hover:#5b97f5;--idp-on-accent:#060b1a;--idp-bg:#060b1a;--idp-surface:#0e1424;--idp-surface-2:#151d31;--idp-text:#f0f2f8;--idp-muted:#7b83a0;--idp-border:#1e2740;--idp-video-width:180px;--idp-video-height:250px;position:fixed;right:20px;bottom:20px;z-index:2147483000;color:var(--idp-text);}'
    + '.idp-chatbot-bubble{width:60px;height:60px;border-radius:50%;background:var(--idp-accent);color:var(--idp-on-accent);border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;transition:transform .15s ease, box-shadow .15s ease;}'
    + '.idp-chatbot-bubble:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.55);}'
    + '.idp-chatbot-bubble:focus-visible{outline:3px solid var(--idp-accent);outline-offset:3px;}'
    + '.idp-chatbot-bubble svg{width:28px;height:28px;}'
    + '.idp-chatbot-panel{position:absolute;right:0;bottom:76px;width:380px;max-width:calc(100vw - 32px);height:620px;max-height:calc(100vh - 100px);background:var(--idp-surface);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(8px) scale(.98);pointer-events:none;transition:opacity .18s ease, transform .18s ease;border:1px solid var(--idp-border);}'
    + '.idp-chatbot-root.idp-chatbot-open .idp-chatbot-panel{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}'
    // Intro video shown as a centered card (width x height) below the header. The
    // video FILLS the card (object-fit:cover); object-position keeps the face in
    // frame when the ratio differs. Surface band matches the header.
    // flex:0 0 auto keeps it above the (independently scrolling) messages.
    + '.idp-chatbot-video{position:relative;flex:0 0 auto;width:100%;display:flex;align-items:center;justify-content:center;padding:10px 12px;background:var(--idp-surface);}'
    + '.idp-chatbot-video-card{position:relative;flex:0 0 auto;width:var(--idp-video-width,180px);height:var(--idp-video-height,250px);border-radius:12px;overflow:hidden;background:#000;box-shadow:0 4px 14px rgba(0,0,0,.4);}'
    + '.idp-chatbot-video-card video{display:block;width:100%;height:100%;object-fit:cover;object-position:var(--idp-video-position,center 50%);background:#000;}'
    + '.idp-chatbot-unmute{position:absolute;right:8px;bottom:8px;display:inline-flex;align-items:center;gap:5px;background:rgba(6,11,26,.72);color:#fff;border:1px solid var(--idp-border);border-radius:999px;padding:5px 9px;font-size:11px;font-weight:600;line-height:1;cursor:pointer;}'
    + '.idp-chatbot-unmute:hover{background:rgba(6,11,26,.92);}'
    + '.idp-chatbot-unmute:focus-visible{outline:2px solid var(--idp-accent);outline-offset:2px;}'
    + '.idp-chatbot-unmute svg{width:14px;height:14px;display:block;}'
    + '.idp-chatbot-header{background:var(--idp-surface);color:var(--idp-text);padding:14px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--idp-border);}'
    + '.idp-chatbot-header-text{flex:1;min-width:0;}'
    + '.idp-chatbot-title{font-size:15px;font-weight:600;line-height:1.2;}'
    + '.idp-chatbot-subtitle{font-size:12px;color:var(--idp-muted);line-height:1.3;margin-top:2px;}'
    + '.idp-chatbot-icon-btn{background:transparent;border:0;color:var(--idp-text);cursor:pointer;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;}'
    + '.idp-chatbot-icon-btn:hover{background:rgba(255,255,255,.1);}'
    + '.idp-chatbot-icon-btn:focus-visible{outline:2px solid var(--idp-accent);outline-offset:1px;}'
    + '.idp-chatbot-icon-btn svg{width:18px;height:18px;}'
    + '.idp-chatbot-notice{background:rgba(111,168,255,.08);color:var(--idp-muted);font-size:12px;padding:8px 12px;border-bottom:1px solid var(--idp-border);}'
    + '.idp-chatbot-messages{flex:1 1 0;min-height:0;overflow-y:auto;padding:14px 12px;background:var(--idp-bg);display:flex;flex-direction:column;gap:8px;}'
    + '.idp-chatbot-msg{max-width:85%;padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.4;word-wrap:break-word;white-space:pre-wrap;}'
    + '.idp-chatbot-msg-bot{background:var(--idp-surface);color:var(--idp-text);border:1px solid var(--idp-border);border-top-left-radius:4px;align-self:flex-start;}'
    + '.idp-chatbot-msg-user{background:var(--idp-accent);color:var(--idp-on-accent);border-top-right-radius:4px;align-self:flex-end;}'
    + '.idp-chatbot-msg-system{background:rgba(111,168,255,.12);color:var(--idp-text);border:1px solid var(--idp-border);font-size:13px;align-self:stretch;max-width:100%;text-align:center;}'
    + '.idp-chatbot-typing{display:inline-flex;gap:3px;padding:10px 12px;background:var(--idp-surface);border:1px solid var(--idp-border);border-radius:12px;border-top-left-radius:4px;align-self:flex-start;}'
    + '.idp-chatbot-typing span{width:6px;height:6px;border-radius:50%;background:var(--idp-muted);animation:idp-chatbot-blink 1.2s infinite ease-in-out;}'
    + '.idp-chatbot-typing span:nth-child(2){animation-delay:.15s;}'
    + '.idp-chatbot-typing span:nth-child(3){animation-delay:.3s;}'
    + '@keyframes idp-chatbot-blink{0%,80%,100%{opacity:.25;transform:translateY(0);}40%{opacity:1;transform:translateY(-2px);}}'
    + '.idp-chatbot-quickreplies{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 0;flex:0 1 auto;max-height:118px;overflow-y:auto;}'
    + '.idp-chatbot-qr{background:var(--idp-surface);border:1px solid var(--idp-border);color:var(--idp-text);border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer;transition:background .12s ease, border-color .12s ease, color .12s ease;}'
    + '.idp-chatbot-qr:hover{background:var(--idp-surface-2);border-color:var(--idp-accent);color:var(--idp-accent);}'
    + '.idp-chatbot-qr:focus-visible{outline:2px solid var(--idp-accent);outline-offset:1px;}'
    + '.idp-chatbot-input-area{border-top:1px solid var(--idp-border);background:var(--idp-surface);padding:8px;display:flex;gap:6px;align-items:flex-end;}'
    + '.idp-chatbot-input{flex:1;border:1px solid var(--idp-border);border-radius:10px;padding:8px 10px;font-size:14px;resize:none;max-height:96px;font-family:inherit;color:var(--idp-text);background:var(--idp-surface-2);}'
    + '.idp-chatbot-input::placeholder{color:var(--idp-muted);}'
    + '.idp-chatbot-input:focus{outline:none;border-color:var(--idp-accent);box-shadow:0 0 0 3px rgba(111,168,255,.2);}'
    + '.idp-chatbot-send{background:var(--idp-accent);color:var(--idp-on-accent);border:0;border-radius:10px;padding:0 14px;height:38px;font-size:14px;font-weight:600;cursor:pointer;}'
    + '.idp-chatbot-send:hover{background:var(--idp-accent-hover);}'
    + '.idp-chatbot-send:disabled{background:var(--idp-muted);cursor:not-allowed;}'
    + '.idp-chatbot-send:focus-visible{outline:2px solid var(--idp-accent);outline-offset:2px;}'
    + '.idp-chatbot-footer-actions{display:flex;justify-content:space-between;font-size:12px;padding:6px 12px;color:var(--idp-muted);background:var(--idp-surface);border-top:1px solid var(--idp-border);}'
    + '.idp-chatbot-footer-actions button{background:transparent;border:0;color:var(--idp-accent);cursor:pointer;font-size:12px;padding:2px 4px;}'
    + '.idp-chatbot-footer-actions button:hover{text-decoration:underline;}'
    + '@media (max-width:480px){.idp-chatbot-panel{right:-8px;bottom:72px;width:calc(100vw - 16px);height:calc(100vh - 100px);max-height:none;border-radius:14px;}.idp-chatbot-root{right:12px;bottom:12px;}}'
    + '@media (prefers-reduced-motion: reduce){.idp-chatbot-panel,.idp-chatbot-bubble{transition:none;}.idp-chatbot-typing span{animation:none;}}';

  // Map config.theme keys → CSS custom properties. Any subset can be supplied.
  var THEME_VARS = {
    accent: '--idp-accent', accentHover: '--idp-accent-hover', onAccent: '--idp-on-accent',
    bg: '--idp-bg', surface: '--idp-surface', surface2: '--idp-surface-2',
    text: '--idp-text', muted: '--idp-muted', border: '--idp-border'
  };
  function applyTheme(rootEl) {
    var t = CFG.theme;
    if (!t || typeof t !== 'object') return;
    for (var key in THEME_VARS) {
      if (Object.prototype.hasOwnProperty.call(t, key) && t[key]) {
        rootEl.style.setProperty(THEME_VARS[key], String(t[key]));
      }
    }
  }

  function injectStyle() {
    if (document.getElementById('idp-chatbot-style')) return;
    var s = document.createElement('style');
    s.id = 'idp-chatbot-style';
    s.appendChild(document.createTextNode(STYLE));
    document.head.appendChild(s);
  }

  // ---------- Widget engine ----------
  function Chatbot() {
    this.state = this.loadOrInitState();
    this.els = {};
    this.isTyping = false;
  }

  Chatbot.prototype.loadOrInitState = function () {
    var raw = safeStorageGet(CFG.storageKey);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) return parsed;
      } catch (e) { /* fall through */ }
    }
    return {
      version: 1,
      stage: 'greeting',          // greeting → intent → qualifying → recommend → askSchedule → choosePerson → leadForm → done
      intent: null,               // PRODUCTS key
      recommendedProduct: null,
      qualifyingIndex: 0,
      answers: {},
      lead: {},
      messages: [],               // [{role:'bot'|'user'|'system', text, ts, quickReplies?}]
      createdAt: nowIso()
    };
  };

  Chatbot.prototype.persist = function () {
    safeStorageSet(CFG.storageKey, JSON.stringify(this.state));
  };

  // ----- Rendering -----
  Chatbot.prototype.mount = function () {
    injectStyle();

    var root = document.createElement('div');
    root.className = 'idp-chatbot-root';
    root.setAttribute('data-idp-chatbot', '');
    applyTheme(root); // config.theme overrides the default CSS variables
    // Size the intro-video area (px). Also settable via the --idp-video-height CSS var.
    if (CFG.introVideo) {
      root.style.setProperty('--idp-video-width', (parseInt(CFG.introVideoWidth, 10) || 180) + 'px');
      root.style.setProperty('--idp-video-height', (parseInt(CFG.introVideoHeight, 10) || 250) + 'px');
      root.style.setProperty('--idp-video-position', String(CFG.introVideoPosition || 'center 50%'));
    }

    root.innerHTML =
      '<button type="button" class="idp-chatbot-bubble" aria-label="Open chat" aria-expanded="false">'
      +   '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'
      +     '<path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9l-4 4v-4H7a3 3 0 0 1-3-3V5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
      +   '</svg>'
      + '</button>'
      + '<div class="idp-chatbot-panel" role="dialog" aria-label="ID-PRIVACY Assistant" aria-modal="false">'
      +   '<div class="idp-chatbot-header">'
      +     '<div class="idp-chatbot-header-text">'
      +       '<div class="idp-chatbot-title">' + escapeHtml(CFG.productName) + ' Assistant</div>'
      +       '<div class="idp-chatbot-subtitle">Privacy Automation Support</div>'
      +     '</div>'
      +     '<button type="button" class="idp-chatbot-icon-btn idp-chatbot-schedule" aria-label="Schedule a call" title="Schedule a call">'
      +       '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
      +     '</button>'
      +     '<button type="button" class="idp-chatbot-icon-btn idp-chatbot-close-btn" aria-label="Close chat">'
      +       '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
      +     '</button>'
      +   '</div>'
      // Intro-video container under the header — always present so injecting the
      // <video> on open() causes no layout shift. The <video> is injected in open().
      +   (CFG.introVideo
            ? '<div class="idp-chatbot-video" role="region" aria-label="' + escapeHtml(CFG.productName + ' video introduction') + '"></div>'
            : '')
      +   '<div class="idp-chatbot-notice" role="note">Please do not enter sensitive personal data in this chat.</div>'
      +   '<div class="idp-chatbot-messages" aria-live="polite" aria-atomic="false"></div>'
      +   '<div class="idp-chatbot-quickreplies"></div>'
      +   '<form class="idp-chatbot-input-area" autocomplete="off">'
      +     '<textarea class="idp-chatbot-input" rows="1" placeholder="Type your message…" aria-label="Type your message"></textarea>'
      +     '<button type="submit" class="idp-chatbot-send">Send</button>'
      +   '</form>'
      +   '<div class="idp-chatbot-footer-actions">'
      +     '<button type="button" class="idp-chatbot-restart">Start over</button>'
      +     '<span>Powered by ' + escapeHtml(CFG.companyName) + '</span>'
      +   '</div>'
      + '</div>';

    document.body.appendChild(root);

    this.els.root         = root;
    this.els.bubble       = root.querySelector('.idp-chatbot-bubble');
    this.els.panel        = root.querySelector('.idp-chatbot-panel');
    this.els.video        = root.querySelector('.idp-chatbot-video');
    this.els.closeBtn     = root.querySelector('.idp-chatbot-close-btn');
    this.els.scheduleBtn  = root.querySelector('.idp-chatbot-schedule');
    this.els.messages     = root.querySelector('.idp-chatbot-messages');
    this.els.quickReplies = root.querySelector('.idp-chatbot-quickreplies');
    this.els.form         = root.querySelector('.idp-chatbot-input-area');
    this.els.input        = root.querySelector('.idp-chatbot-input');
    this.els.send         = root.querySelector('.idp-chatbot-send');
    this.els.restart      = root.querySelector('.idp-chatbot-restart');

    this.bindEvents();
    this.renderHistory();

    // First-time visitor: kick off the greeting.
    if (this.state.messages.length === 0) {
      this.startConversation();
    } else {
      // Re-attach quick-replies appropriate to current stage on refresh.
      this.renderQuickRepliesForStage();
    }
  };

  Chatbot.prototype.bindEvents = function () {
    var self = this;
    this.els.bubble.addEventListener('click', function () { self.toggle(); });
    this.els.closeBtn.addEventListener('click', function () { self.close(); });
    this.els.restart.addEventListener('click', function () { self.reset(); });
    this.els.scheduleBtn.addEventListener('click', function () { self.shortcutSchedule(); });

    this.els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      self.handleUserInput();
    });

    // Submit on Enter, newline on Shift+Enter — common chat UX.
    this.els.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        self.handleUserInput();
      }
    });

    // Esc closes the panel for keyboard users.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && self.els.root.classList.contains('idp-chatbot-open')) {
        self.close();
      }
    });
  };

  Chatbot.prototype.renderHistory = function () {
    this.els.messages.innerHTML = '';
    for (var i = 0; i < this.state.messages.length; i++) {
      this.appendMessageElement(this.state.messages[i]);
    }
    this.scrollToBottom();
  };

  Chatbot.prototype.appendMessageElement = function (msg) {
    var div = document.createElement('div');
    div.className = 'idp-chatbot-msg idp-chatbot-msg-' + msg.role;
    div.innerHTML = escapeHtml(msg.text);
    this.els.messages.appendChild(div);
  };

  Chatbot.prototype.scrollToBottom = function () {
    this.els.messages.scrollTop = this.els.messages.scrollHeight;
  };

  Chatbot.prototype.pushMessage = function (role, text) {
    var msg = { role: role, text: text, ts: nowIso() };
    this.state.messages.push(msg);
    this.appendMessageElement(msg);
    this.scrollToBottom();
    this.persist();
  };

  // Bot messages get a typing indicator + delay so the conversation reads naturally.
  Chatbot.prototype.botSay = function (text, callback) {
    var self = this;
    self.showTyping();
    setTimeout(function () {
      self.hideTyping();
      self.pushMessage('bot', text);
      if (callback) callback();
    }, CFG.typingDelayMs);
  };

  Chatbot.prototype.showTyping = function () {
    if (this.isTyping) return;
    this.isTyping = true;
    var el = document.createElement('div');
    el.className = 'idp-chatbot-typing';
    el.id = 'idp-chatbot-typing-indicator';
    el.innerHTML = '<span></span><span></span><span></span>';
    this.els.messages.appendChild(el);
    this.scrollToBottom();
  };

  Chatbot.prototype.hideTyping = function () {
    this.isTyping = false;
    var el = document.getElementById('idp-chatbot-typing-indicator');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };

  // ----- Quick replies -----
  Chatbot.prototype.setQuickReplies = function (options) {
    var self = this;
    this.els.quickReplies.innerHTML = '';
    if (!options || !options.length) return;
    options.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'idp-chatbot-qr';
      btn.textContent = opt.label;
      btn.addEventListener('click', function () {
        // Reflect the click as a user message and route to the handler.
        self.pushMessage('user', opt.label);
        self.clearQuickReplies();
        self.handleQuickReply(opt);
      });
      self.els.quickReplies.appendChild(btn);
    });
  };

  Chatbot.prototype.clearQuickReplies = function () {
    this.els.quickReplies.innerHTML = '';
  };

  // After a refresh, restore quick-replies that match the current stage.
  Chatbot.prototype.renderQuickRepliesForStage = function () {
    switch (this.state.stage) {
      case 'intent':
        this.setQuickReplies(INITIAL_OPTIONS);
        break;
      case 'discoveryOrRedaction':
        this.setQuickReplies([
          { label: 'Data discovery',           value: 'discovery' },
          { label: 'Data redaction / masking', value: 'redaction' },
          { label: 'Both',                     value: 'discovery' }
        ]);
        break;
      case 'qualifying':
        this.askCurrentQualifyingQuestion(/*restore=*/true);
        break;
      case 'askSchedule':
        this.setQuickReplies([
          { label: 'Yes, schedule a call', value: 'yes' },
          { label: 'No thanks',            value: 'no'  }
        ]);
        break;
      case 'choosePerson':
        this.setQuickReplies(this.personOptions());
        break;
      default:
        this.clearQuickReplies();
    }
  };

  // ----- Conversation flow -----
  Chatbot.prototype.startConversation = function () {
    var self = this;
    this.state.stage = 'greeting';
    this.persist();
    this.botSay(INITIAL_GREETING, function () {
      self.state.stage = 'intent';
      self.persist();
      self.setQuickReplies(INITIAL_OPTIONS);
    });
  };

  Chatbot.prototype.handleQuickReply = function (opt) {
    switch (this.state.stage) {
      case 'intent':
        this.handleIntentSelection(opt.value);
        break;
      case 'discoveryOrRedaction':
        this.state.intent = opt.value; // 'discovery' or 'redaction'
        this.persist();
        this.beginQualifying();
        break;
      case 'qualifying':
        this.recordQualifyingAnswer(opt.label);
        break;
      case 'askSchedule':
        if (opt.value === 'yes') this.askForPerson();
        else this.endConversation(false);
        break;
      case 'choosePerson':
        this.state.lead.preferredPerson = opt.label;
        this.persist();
        this.startLeadForm();
        break;
      default:
        // No-op
    }
  };

  Chatbot.prototype.handleIntentSelection = function (intent) {
    if (intent === 'schedule') {
      this.state.intent = 'schedule';
      this.persist();
      this.askForPerson();
      return;
    }
    if (intent === 'unsure') {
      var self = this;
      this.botSay("No problem — tell me a bit about what you're trying to do, in your own words. For example: 'we need to handle DSARs faster' or 'we want a cookie banner that supports Google Consent Mode'.", function () {
        self.state.stage = 'intent'; // remain in intent — free text will route
        self.persist();
        self.clearQuickReplies();
      });
      return;
    }

    // The 'discovery' menu option covers both Discovery and Redaction —
    // disambiguate before qualifying.
    if (intent === 'discovery') {
      var self2 = this;
      this.botSay('Got it — are you looking for data discovery, redaction/masking, or both?', function () {
        self2.state.stage = 'discoveryOrRedaction';
        self2.persist();
        self2.setQuickReplies([
          { label: 'Data discovery',           value: 'discovery' },
          { label: 'Data redaction / masking', value: 'redaction' },
          { label: 'Both',                     value: 'discovery' }
        ]);
      });
      return;
    }

    this.state.intent = intent;
    this.persist();
    this.beginQualifying();
  };

  Chatbot.prototype.beginQualifying = function () {
    this.state.stage = 'qualifying';
    this.state.qualifyingIndex = 0;
    this.persist();
    this.askCurrentQualifyingQuestion();
  };

  Chatbot.prototype.askCurrentQualifyingQuestion = function (restoreOnly) {
    var q = QUALIFICATION_QUESTIONS[this.state.qualifyingIndex];
    if (!q) { this.recommend(); return; }

    var self = this;
    var present = function () {
      if (q.freeText) {
        self.clearQuickReplies();
        if (self.els.input) self.els.input.placeholder = q.placeholder || 'Type your answer…';
      } else {
        self.setQuickReplies(q.options.map(function (label) { return { label: label, value: label }; }));
        if (self.els.input) self.els.input.placeholder = 'Type your message…';
      }
    };

    if (restoreOnly) {
      // Avoid replaying the prompt — last bot message in history already shows it.
      present();
    } else {
      this.botSay(q.prompt, present);
    }
  };

  Chatbot.prototype.recordQualifyingAnswer = function (answer) {
    var q = QUALIFICATION_QUESTIONS[this.state.qualifyingIndex];
    if (!q) return;
    this.state.answers[q.key] = answer;
    this.state.qualifyingIndex++;
    this.persist();
    if (this.state.qualifyingIndex >= QUALIFICATION_QUESTIONS.length) {
      this.recommend();
    } else {
      this.askCurrentQualifyingQuestion();
    }
  };

  Chatbot.prototype.recommend = function () {
    var self = this;
    var product = PRODUCTS[this.state.intent] || CFG.productName;
    this.state.recommendedProduct = product;
    this.state.stage = 'recommend';
    this.persist();

    var line = "Based on what you shared, I recommend our " + product + " module. It typically addresses the use case you described and aligns with the regulations you mentioned.";
    this.botSay(line, function () {
      self.botSay('Would you like to schedule a call with our privacy automation team?', function () {
        self.state.stage = 'askSchedule';
        self.persist();
        self.setQuickReplies([
          { label: 'Yes, schedule a call', value: 'yes' },
          { label: 'No thanks',            value: 'no'  }
        ]);
      });
    });
  };

  Chatbot.prototype.personOptions = function () {
    return CFG.people.map(function (p) { return { label: p, value: p }; });
  };

  Chatbot.prototype.askForPerson = function () {
    var self = this;
    this.botSay('Great — who would you like to meet with?', function () {
      self.state.stage = 'choosePerson';
      self.persist();
      self.setQuickReplies(self.personOptions());
    });
  };

  // ----- Lead-capture form (rendered as a guided sequence of messages) -----
  // We deliberately avoid a popup form — the chat metaphor stays consistent.
  var LEAD_FIELDS = [
    { key: 'name',          prompt: 'What is your name?',                                  required: true },
    { key: 'email',         prompt: 'What is your business email?',                        required: true, validate: 'email' },
    { key: 'company',       prompt: 'What company are you with?',                          required: true },
    { key: 'phone',         prompt: 'Phone number? (optional — type "skip" to skip)',      required: false },
    { key: 'preferredTime', prompt: 'What date/time works best? (e.g. "Tue 2pm PT next week")', required: true },
    { key: 'message',       prompt: 'Anything else you would like our team to know? (optional — type "skip" to skip)', required: false }
  ];

  Chatbot.prototype.startLeadForm = function () {
    this.state.stage = 'leadForm';
    this.state.leadFieldIndex = 0;
    this.persist();
    this.askLeadField();
  };

  Chatbot.prototype.askLeadField = function () {
    var field = LEAD_FIELDS[this.state.leadFieldIndex];
    if (!field) { this.submitLead(); return; }
    this.clearQuickReplies();
    this.els.input.placeholder = 'Type your answer…';
    this.botSay(field.prompt);
  };

  Chatbot.prototype.handleLeadInput = function (text) {
    var field = LEAD_FIELDS[this.state.leadFieldIndex];
    if (!field) return;

    var trimmed = String(text).trim();
    var isSkip = !field.required && /^skip$/i.test(trimmed);

    if (isSkip) {
      this.state.lead[field.key] = '';
    } else {
      if (field.required && !trimmed) {
        this.botSay("That field is required. " + field.prompt);
        return;
      }
      if (field.validate === 'email') {
        if (!isValidEmail(trimmed)) {
          this.botSay("That email doesn't look right — please enter a valid business email.");
          return;
        }
        if (!isBusinessEmail(trimmed)) {
          this.botSay("Please use your work email — personal and temporary email addresses (Gmail, Yahoo, Outlook, Mailinator, etc.) aren't accepted. Enter your company email address.");
          return;
        }
      }
      this.state.lead[field.key] = trimmed;
    }

    this.state.leadFieldIndex++;
    this.persist();
    this.askLeadField();
  };

  Chatbot.prototype.buildPayload = function () {
    return {
      source: 'webflow_contact_us_chatbot',
      intent: this.state.intent || '',
      recommendedProduct: this.state.recommendedProduct || '',
      name:            this.state.lead.name || '',
      email:           this.state.lead.email || '',
      company:         this.state.lead.company || '',
      phone:           this.state.lead.phone || '',
      preferredPerson: this.state.lead.preferredPerson || CFG.defaultAssignee,
      preferredTime:   this.state.lead.preferredTime || '',
      message:         this.state.lead.message || '',
      answers:         this.state.answers || {},
      createdAt:       nowIso()
    };
  };

  Chatbot.prototype.submitLead = function () {
    var self = this;
    var payload = this.buildPayload();

    this.showTyping();

    // We use fetch with a JSON body. CORS, auth, etc. are the responsibility of
    // the receiving endpoint; failure is recovered with a friendly retry option.
    var p;
    try {
      p = fetch(CFG.webhookUrl, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      p = Promise.reject(e);
    }

    p.then(function (res) {
      if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
      return res;
    }).then(function () {
      self.hideTyping();
      self.pushMessage('system', 'Submission successful');
      self.botSay('Thank you. We have received your request and our team will contact you shortly.', function () {
        self.endConversation(true);
      });
    }).catch(function (err) {
      self.hideTyping();
      // Don't expose internals — but log for debugging.
      if (window.console && console.warn) console.warn('[IDPrivacyChatbot] webhook failed:', err);
      self.pushMessage('system', 'We could not submit your request automatically.');
      self.botSay('Sorry — we could not submit your request right now. You can try again, or email us directly. Type "retry" to try again.', function () {
        self.state.stage = 'leadFormError';
        self.persist();
        self.setQuickReplies([
          { label: 'Retry', value: 'retry' },
          { label: 'Cancel', value: 'cancel' }
        ]);
      });
    });
  };

  Chatbot.prototype.endConversation = function (submitted) {
    this.state.stage = 'done';
    this.persist();
    this.clearQuickReplies();
    var msg = submitted
      ? 'You can close this chat or type "start over" to begin a new conversation.'
      : "No problem — feel free to reach out anytime. Type \"start over\" to ask about something else.";
    this.botSay(msg);
  };

  // ----- Free-text routing -----
  Chatbot.prototype.handleUserInput = function () {
    var text = (this.els.input.value || '').trim();
    if (!text) return;
    this.els.input.value = '';
    this.pushMessage('user', text);

    // Universal escape hatch.
    if (/^start over$/i.test(text)) { this.reset(); return; }

    switch (this.state.stage) {
      case 'greeting':
        // User typed before the greeting finished — queue a soft re-route.
        this.routeFreeText(text);
        break;

      case 'intent':
        this.routeFreeText(text);
        break;

      case 'discoveryOrRedaction':
        // If the user types instead of clicking, infer.
        this.state.intent = /redact|mask/i.test(text) ? 'redaction' : 'discovery';
        this.persist();
        this.beginQualifying();
        break;

      case 'qualifying':
        this.recordQualifyingAnswer(text);
        break;

      case 'askSchedule':
        if (/^(y|yes|sure|ok)/i.test(text)) this.askForPerson();
        else this.endConversation(false);
        break;

      case 'choosePerson':
        // Match by case-insensitive substring against the configured list.
        var chosen = CFG.people.find(function (p) {
          return p.toLowerCase().indexOf(text.toLowerCase()) !== -1
              || text.toLowerCase().indexOf(p.toLowerCase()) !== -1;
        });
        this.state.lead.preferredPerson = chosen || text;
        this.persist();
        this.startLeadForm();
        break;

      case 'leadForm':
        this.handleLeadInput(text);
        break;

      case 'leadFormError':
        if (/^retry$/i.test(text)) {
          this.clearQuickReplies();
          this.submitLead();
        } else {
          this.endConversation(false);
        }
        break;

      case 'done':
      default:
        // After completion, free-text just nudges back to start.
        var self = this;
        this.botSay('We are all set for now. Type "start over" to begin a new conversation.', function () {
          self.clearQuickReplies();
        });
    }
  };

  Chatbot.prototype.routeFreeText = function (text) {
    var intent = detectIntent(text);
    if (intent && PRODUCTS[intent] !== undefined) {
      var self = this;
      this.botSay('Got it — sounds like this is about ' + (PRODUCTS[intent] || 'scheduling a call') + '.', function () {
        self.handleIntentSelection(intent);
      });
    } else {
      var self2 = this;
      this.botSay("I want to make sure I point you to the right module — could you pick one of these?", function () {
        self2.setQuickReplies(INITIAL_OPTIONS);
      });
    }
  };

  // ----- Intro video (self-hosted MP4, top of the chat panel) -----

  // Contents of the mute/unmute toggle button for a given muted state.
  function unmuteButtonHtml(muted) {
    var unmuteIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor"/><path d="m17 9 4 6M21 9l-4 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var muteIcon   = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 7a7 7 0 0 1 0 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    return (muted ? unmuteIcon : muteIcon) + '<span>' + (muted ? 'Unmute' : 'Mute') + '</span>';
  }

  // Inject a fresh <video> on every open so it restarts from the beginning.
  Chatbot.prototype.injectVideo = function () {
    if (!CFG.introVideo || !this.els.video) return;
    this.els.video.innerHTML =
      '<div class="idp-chatbot-video-card">'
      + '<video class="idp-chatbot-video-el"'
      + ' src="' + escapeHtml(CFG.introVideoUrl) + '"'
      + (CFG.introVideoPoster ? ' poster="' + escapeHtml(CFG.introVideoPoster) + '"' : '')
      // autoplay + playsinline → plays INLINE (no fullscreen takeover). We try to
      // start WITH sound below; CSS sizes the video to fill the card.
      + ' autoplay playsinline preload="auto"'
      + ' title="' + escapeHtml(CFG.productName + ' video introduction') + '"'
      + ' aria-label="' + escapeHtml(CFG.productName + ' video introduction') + '"></video>'
      + '<button type="button" class="idp-chatbot-unmute"'
      +   ' aria-label="Mute introduction video" title="Mute">'
      +   unmuteButtonHtml(false)
      + '</button>'
      + '</div>';

    var videoEl = this.els.video.querySelector('.idp-chatbot-video-el');
    var btn = this.els.video.querySelector('.idp-chatbot-unmute');
    if (!videoEl) return;

    function syncBtn() {
      if (!btn) return;
      var muted = videoEl.muted;
      btn.innerHTML = unmuteButtonHtml(muted);
      btn.setAttribute('aria-label', muted ? 'Unmute introduction video' : 'Mute introduction video');
      btn.setAttribute('title', muted ? 'Unmute' : 'Mute');
    }

    // Default: sound ON (introVideoMuted=false). Browsers only allow unmuted autoplay
    // with user activation — opening the chat is a click, so this usually works. If
    // it's blocked, fall back to muted so the video still plays.
    videoEl.muted = !!CFG.introVideoMuted;
    var pr = videoEl.play();
    if (pr && pr.then) {
      pr.then(syncBtn).catch(function () {
        if (!videoEl.muted) {
          videoEl.muted = true;            // unmuted autoplay blocked → mute & retry
          var retry = videoEl.play();
          if (retry && retry.catch) retry.catch(function () {});
        }
        syncBtn();
      });
    } else {
      syncBtn();
    }

    if (btn) {
      btn.addEventListener('click', function () {
        // Self-hosted MP4 is same-document, so sound toggles INSTANTLY — no reload
        // and no restart (the key advantage over a cross-origin iframe).
        videoEl.muted = !videoEl.muted;
        syncBtn();
      });
    }
  };

  // Pause + remove the video when the chat closes so it stops and reopens fresh.
  // The empty container keeps its fixed height, so reopening causes no layout shift.
  Chatbot.prototype.clearVideo = function () {
    if (!this.els.video) return;
    var videoEl = this.els.video.querySelector('.idp-chatbot-video-el');
    if (videoEl && videoEl.pause) { try { videoEl.pause(); } catch (e) {} }
    this.els.video.innerHTML = '';
  };

  // ----- Public API -----
  // open()/close() are the openChat()/closeChat() equivalents; video injection
  // lives in open() so the intro plays on every open, not at page load.
  Chatbot.prototype.open = function () {
    this.els.root.classList.add('idp-chatbot-open');
    this.els.bubble.setAttribute('aria-expanded', 'true');
    // Inject the intro video on every open so it autoplays (muted) and restarts
    // from the beginning.
    this.injectVideo();
    this.els.input.focus();
  };
  Chatbot.prototype.close = function () {
    this.els.root.classList.remove('idp-chatbot-open');
    this.els.bubble.setAttribute('aria-expanded', 'false');
    this.clearVideo(); // stop playback when the chat closes
  };
  Chatbot.prototype.toggle = function () {
    if (this.els.root.classList.contains('idp-chatbot-open')) this.close();
    else this.open();
  };
  Chatbot.prototype.reset = function () {
    safeStorageRemove(CFG.storageKey);
    this.state = this.loadOrInitState();
    this.renderHistory();
    this.clearQuickReplies();
    this.startConversation();
  };
  Chatbot.prototype.shortcutSchedule = function () {
    // "Schedule a call" header button — works at any point in the conversation.
    this.open();
    this.state.intent = this.state.intent || 'schedule';
    this.persist();
    var self = this;
    this.pushMessage('user', 'I would like to schedule a call.');
    this.askForPerson();
  };
  Chatbot.prototype.destroy = function () {
    if (this.els.root && this.els.root.parentNode) {
      this.els.root.parentNode.removeChild(this.els.root);
    }
  };

  // ---------- Boot ----------
  function boot() {
    var bot = new Chatbot();
    bot.mount();

    window.IDPrivacyChatbot = {
      __loaded: true,
      open:    function () { bot.open();    },
      close:   function () { bot.close();   },
      toggle:  function () { bot.toggle();  },
      reset:   function () { bot.reset();   },
      destroy: function () { bot.destroy(); },
      // Expose config/state read-only for debugging in production:
      _state:  function () { return JSON.parse(JSON.stringify(bot.state)); },
      _config: function () { return JSON.parse(JSON.stringify(CFG)); }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
