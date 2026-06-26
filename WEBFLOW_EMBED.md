# ID-PRIVACY® Chatbot — Webflow embed guide

Two ways to install. Pick **one**.

---

## Option A — Hosted script (recommended for production)

1. Stage the deployable files with `./build.sh` (populates `cdn-deploy/`), then
   publish that folder to a static host. Currently hosted on **Netlify**
   (`https://dsg-chatbot.netlify.app`), which serves both the widget JS and the
   intro video. See [README.md](README.md) for the build/deploy flow.

2. In Webflow, open **Pages → Contact Us → Settings (cog icon) → Custom code**
   and scroll to **"Before `</body>` tag"**.

3. Paste the snippet below, then click **Save** and **Publish**.

   ```html
   <script>
     window.IDPrivacyChatbotConfig = {
       webhookUrl: "https://dsg-chatbot-af7b5-default-rtdb.firebaseio.com/leads.json",
       companyName: "Data Safeguard",
       productName: "ID-PRIVACY®",
       defaultAssignee: "Privacy Automation Team",
       people: ["Sales / Product Specialist", "Privacy Consultant", "Technical Architect"],
       // Intro video (absolute URL required — the JS default is relative):
       introVideoUrl: "https://dsg-chatbot.netlify.app/DataSafeguard-webflow_540.mp4",
       introVideoWidth: 180,
       introVideoHeight: 250,
       introVideoPosition: "center 50%",
       introVideoMuted: false
     };
   </script>
   <script src="https://dsg-chatbot.netlify.app/idprivacy-chatbot.js" defer></script>
   ```

To enable the bot **site-wide** instead of just on Contact Us, paste the same
snippet in **Project Settings → Custom code → Footer code**.

---

## Option B — Inline (no hosting required)

If you do not want to host the JS file separately, paste the entire contents of
`idprivacy-chatbot.js` inside a `<script>` tag in the same Webflow custom-code
area. Prepend the configuration block first.

```html
<script>
  window.IDPrivacyChatbotConfig = { /* same config as above */ };
</script>
<script>
/* paste full contents of idprivacy-chatbot.js here */
</script>
```

Webflow's footer custom code field has a **10,000-character limit per field**.
The widget is small enough to fit, but if you customize and exceed that, fall
back to Option A.

---

## Verifying the install

1. Publish the page.
2. Open the Contact Us page in an incognito window.
3. You should see a navy chat bubble in the bottom-right corner.
4. Click it — the panel opens with the greeting:
   *"Hi, I'm the ID-PRIVACY® assistant…"*
5. Walk through a flow and submit a lead. Confirm the `POST` request to your
   webhook lands in your back end (check network tab + server logs).

---

## Public API (browser console)

Once loaded, the widget is available globally:

```js
window.IDPrivacyChatbot.open();    // open the panel
window.IDPrivacyChatbot.close();   // close it
window.IDPrivacyChatbot.toggle();  // toggle
window.IDPrivacyChatbot.reset();   // wipe localStorage and restart
window.IDPrivacyChatbot.destroy(); // remove from DOM
window.IDPrivacyChatbot._state();  // read current state (debug)
window.IDPrivacyChatbot._config(); // read effective config (debug)
```

You can wire any Webflow element to open the chatbot:

```html
<a href="#" onclick="event.preventDefault(); window.IDPrivacyChatbot.open();">
  Talk to us
</a>
```
