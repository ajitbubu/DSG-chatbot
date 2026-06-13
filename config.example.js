// config.example.js — template for local config. SAFE TO COMMIT (no real values).
// Setup: copy this file to config.local.js and replace the placeholders.
//   cp config.example.js config.local.js
// config.local.js is gitignored so your real Firebase URL stays out of source control.
window.IDPrivacyChatbotConfig = {
  // Your Firebase Realtime Database URL + "/leads.json"
  // (Firebase console → Realtime Database → copy the base URL, then add /leads.json)
  webhookUrl: "https://YOUR-PROJECT-default-rtdb.firebaseio.com/leads.json",
  companyName: "Data Safeguard",
  productName: "ID-PRIVACY®",
  defaultAssignee: "Privacy Automation Team",
  people: [
    "Sales / Product Specialist",
    "Privacy Consultant",
    "Technical Architect"
  ]
};
