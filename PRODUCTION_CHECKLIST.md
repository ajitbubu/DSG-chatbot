# Production checklist

Before pointing real visitors at the widget.

## Configuration

- [ ] Replace placeholder `webhookUrl` (`https://example.com/api/contact-lead`)
      with the real lead-capture endpoint.
- [ ] Confirm `people` list matches the actual humans/teams who can be booked.
- [ ] Decide whether the bot should appear on the Contact Us page only
      (per-page custom code) or site-wide (project footer custom code).

## Hosting the JS file

- [ ] Upload `idprivacy-chatbot.js` to a CDN with HTTPS.
- [ ] Set long-cache headers (`Cache-Control: public, max-age=31536000, immutable`)
      and version the filename when you change it (e.g. `idprivacy-chatbot.v2.js`).
- [ ] Enable gzip / brotli on the bucket or CDN.

## Backend

- [ ] Implement the webhook to accept the JSON payload (see `API_PAYLOAD.md`).
- [ ] Add CORS allow-list for the Webflow domain(s).
- [ ] Add rate-limiting per IP and email.
- [ ] Validate email format server-side.
- [ ] Sanitize free-text fields (`message`, `painPoint`, `preferredTime`) before
      storing or rendering anywhere.
- [ ] Forward lead to CRM (HubSpot/Salesforce/etc.) and post a Slack/email alert.

## Privacy & compliance

- [ ] Add the chatbot to your privacy policy / cookie notice (it stores data in
      `localStorage` under the key `idp_chatbot_session_v1`). It does not set
      cookies, but `localStorage` is in scope under GDPR/ePrivacy depending on
      what you log.
- [ ] Confirm the in-chat notice ("Please do not enter sensitive personal data")
      reads correctly for your jurisdictions.
- [ ] If your consent banner blocks non-essential JavaScript pre-consent, ensure
      the chat widget is treated as functional / opt-in per your policy.

## QA

- [ ] Click through every menu option to a successful submission.
- [ ] Verify free-text intent detection on a few sample phrases:
  - "We need a cookie banner that supports Google Consent Mode"
  - "Help with DSARs"
  - "EU AI Act readiness"
  - "Demo please"
- [ ] Test on Chrome, Safari, Firefox, Edge (desktop + iOS/Android).
- [ ] Verify mobile layout — bubble bottom-right, full-width panel.
- [ ] Refresh mid-conversation — state restores, no duplicate messages.
- [ ] Force the webhook to 500 — confirm error UI + Retry works.
- [ ] Run the Webflow page through Lighthouse — widget should not regress
      Performance / Accessibility scores.
- [ ] Confirm keyboard nav: Tab into bubble → Enter to open → Tab through
      quick-replies → Esc to close.

## Future enhancements (placeholders already wired in config)

- [ ] **Calendly**: pass `calendly: { url: "..." }` and replace the
      `preferredTime` text input with an embedded scheduler iframe at the
      person-selection step.
- [ ] **Google Calendar / Outlook Calendar**: OAuth-based slot picker. Requires
      a server-side component and an availability API.
- [ ] **Analytics**: emit `chatbot_intent_selected`, `chatbot_lead_submitted`,
      `chatbot_webhook_failed` events to GA4 or Segment.
- [ ] **i18n**: extract user-facing strings into a `STRINGS` object and accept
      `IDPrivacyChatbotConfig.locale`.

## Release

- [ ] Smoke test on a Webflow staging domain.
- [ ] Roll to production. Watch the webhook for the first 24 hours.
