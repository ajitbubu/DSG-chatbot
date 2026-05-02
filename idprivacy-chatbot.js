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
 *                "Technical Architect", "Ajit Sahu", "Sudhir Sahu"],
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
      'Technical Architect',
      'Ajit Sahu',
      'Sudhir Sahu'
    ],
    storageKey: 'idp_chatbot_session_v1',
    typingDelayMs: 600,
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
  var STYLE = ''
    + '.idp-chatbot-root,.idp-chatbot-root *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}'
    + '.idp-chatbot-root{position:fixed;right:20px;bottom:20px;z-index:2147483000;color:#0b1f3a;}'
    + '.idp-chatbot-bubble{width:60px;height:60px;border-radius:50%;background:#0b1f3a;color:#fff;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(11,31,58,.25);display:flex;align-items:center;justify-content:center;transition:transform .15s ease, box-shadow .15s ease;}'
    + '.idp-chatbot-bubble:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(11,31,58,.3);}'
    + '.idp-chatbot-bubble:focus-visible{outline:3px solid #2563eb;outline-offset:3px;}'
    + '.idp-chatbot-bubble svg{width:28px;height:28px;}'
    + '.idp-chatbot-panel{position:absolute;right:0;bottom:76px;width:380px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 100px);background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(11,31,58,.25);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(8px) scale(.98);pointer-events:none;transition:opacity .18s ease, transform .18s ease;}'
    + '.idp-chatbot-root.idp-chatbot-open .idp-chatbot-panel{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}'
    + '.idp-chatbot-header{background:#0b1f3a;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;}'
    + '.idp-chatbot-header-text{flex:1;min-width:0;}'
    + '.idp-chatbot-title{font-size:15px;font-weight:600;line-height:1.2;}'
    + '.idp-chatbot-subtitle{font-size:12px;opacity:.8;line-height:1.3;margin-top:2px;}'
    + '.idp-chatbot-icon-btn{background:transparent;border:0;color:#fff;cursor:pointer;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;}'
    + '.idp-chatbot-icon-btn:hover{background:rgba(255,255,255,.12);}'
    + '.idp-chatbot-icon-btn:focus-visible{outline:2px solid #fff;outline-offset:1px;}'
    + '.idp-chatbot-icon-btn svg{width:18px;height:18px;}'
    + '.idp-chatbot-notice{background:#eff6ff;color:#1e3a8a;font-size:12px;padding:8px 12px;border-bottom:1px solid #dbeafe;}'
    + '.idp-chatbot-messages{flex:1;overflow-y:auto;padding:14px 12px;background:#f5f7fb;display:flex;flex-direction:column;gap:8px;}'
    + '.idp-chatbot-msg{max-width:85%;padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.4;word-wrap:break-word;white-space:pre-wrap;}'
    + '.idp-chatbot-msg-bot{background:#fff;color:#0b1f3a;border:1px solid #e5e7eb;border-top-left-radius:4px;align-self:flex-start;}'
    + '.idp-chatbot-msg-user{background:#2563eb;color:#fff;border-top-right-radius:4px;align-self:flex-end;}'
    + '.idp-chatbot-msg-system{background:#fef3c7;color:#78350f;border:1px solid #fde68a;font-size:13px;align-self:stretch;max-width:100%;text-align:center;}'
    + '.idp-chatbot-typing{display:inline-flex;gap:3px;padding:10px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;border-top-left-radius:4px;align-self:flex-start;}'
    + '.idp-chatbot-typing span{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:idp-chatbot-blink 1.2s infinite ease-in-out;}'
    + '.idp-chatbot-typing span:nth-child(2){animation-delay:.15s;}'
    + '.idp-chatbot-typing span:nth-child(3){animation-delay:.3s;}'
    + '@keyframes idp-chatbot-blink{0%,80%,100%{opacity:.25;transform:translateY(0);}40%{opacity:1;transform:translateY(-2px);}}'
    + '.idp-chatbot-quickreplies{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 0;}'
    + '.idp-chatbot-qr{background:#fff;border:1px solid #cbd5e1;color:#0b1f3a;border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer;transition:background .12s ease, border-color .12s ease;}'
    + '.idp-chatbot-qr:hover{background:#eff6ff;border-color:#2563eb;}'
    + '.idp-chatbot-qr:focus-visible{outline:2px solid #2563eb;outline-offset:1px;}'
    + '.idp-chatbot-input-area{border-top:1px solid #e5e7eb;background:#fff;padding:8px;display:flex;gap:6px;align-items:flex-end;}'
    + '.idp-chatbot-input{flex:1;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font-size:14px;resize:none;max-height:96px;font-family:inherit;color:#0b1f3a;background:#fff;}'
    + '.idp-chatbot-input:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15);}'
    + '.idp-chatbot-send{background:#2563eb;color:#fff;border:0;border-radius:10px;padding:0 14px;height:38px;font-size:14px;font-weight:600;cursor:pointer;}'
    + '.idp-chatbot-send:hover{background:#1d4ed8;}'
    + '.idp-chatbot-send:disabled{background:#94a3b8;cursor:not-allowed;}'
    + '.idp-chatbot-send:focus-visible{outline:2px solid #1d4ed8;outline-offset:2px;}'
    + '.idp-chatbot-footer-actions{display:flex;justify-content:space-between;font-size:12px;padding:6px 12px;color:#64748b;background:#fff;border-top:1px solid #f1f5f9;}'
    + '.idp-chatbot-footer-actions button{background:transparent;border:0;color:#2563eb;cursor:pointer;font-size:12px;padding:2px 4px;}'
    + '.idp-chatbot-footer-actions button:hover{text-decoration:underline;}'
    + '@media (max-width:480px){.idp-chatbot-panel{right:-8px;bottom:72px;width:calc(100vw - 16px);height:calc(100vh - 100px);max-height:none;border-radius:14px;}.idp-chatbot-root{right:12px;bottom:12px;}}'
    + '@media (prefers-reduced-motion: reduce){.idp-chatbot-panel,.idp-chatbot-bubble{transition:none;}.idp-chatbot-typing span{animation:none;}}';

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
      if (field.validate === 'email' && !isValidEmail(trimmed)) {
        this.botSay("That email doesn't look right — please enter a valid business email.");
        return;
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

  // ----- Public API -----
  Chatbot.prototype.open = function () {
    this.els.root.classList.add('idp-chatbot-open');
    this.els.bubble.setAttribute('aria-expanded', 'true');
    this.els.input.focus();
  };
  Chatbot.prototype.close = function () {
    this.els.root.classList.remove('idp-chatbot-open');
    this.els.bubble.setAttribute('aria-expanded', 'false');
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
