# Lead-capture webhook contract

The widget submits one `POST` request when a lead completes the form.

## Request

- **URL**: configured via `IDPrivacyChatbotConfig.webhookUrl`
- **Method**: `POST`
- **Headers**: `Content-Type: application/json`
- **Body**: JSON, shape below

```json
{
  "source": "webflow_contact_us_chatbot",
  "intent": "dsar",
  "recommendedProduct": "Data Subject Access Rights / DSAR",
  "name": "Jane Doe",
  "email": "jane.doe@acme.com",
  "company": "Acme Corp",
  "phone": "+1 415 555 0142",
  "preferredPerson": "Privacy Consultant",
  "preferredTime": "Tue 2pm PT next week",
  "message": "We are launching in California next month and need help.",
  "answers": {
    "companySize": "501–5,000",
    "industry":    "Retail / E-commerce",
    "region":      "CPRA / CCPA (California)",
    "painPoint":   "Manual DSAR fulfillment is too slow",
    "timeline":    "Urgent (this month)"
  },
  "createdAt": "2026-05-02T18:42:11.123Z"
}
```

### Field semantics

| Field                | Type   | Notes                                                               |
| -------------------- | ------ | ------------------------------------------------------------------- |
| `source`             | string | Always `"webflow_contact_us_chatbot"`. Use to filter your CRM.      |
| `intent`             | string | One of: `consent`, `cookie`, `scriptBlock`, `dsar`, `discovery`, `redaction`, `pia`, `aiGov`, `audit`, `breach`, `schedule`, `unsure`. Empty if user jumped straight to scheduling. |
| `recommendedProduct` | string | Customer-facing module name. Empty if scheduling-only flow.         |
| `name`               | string | Required.                                                            |
| `email`              | string | Required, format-validated client-side.                              |
| `company`            | string | Required.                                                            |
| `phone`              | string | Optional. Empty string when skipped.                                |
| `preferredPerson`    | string | One of `IDPrivacyChatbotConfig.people`, or free-text fallback.      |
| `preferredTime`      | string | Free-text. Replace with calendar-integration field when wired.      |
| `message`            | string | Optional notes.                                                      |
| `answers`            | object | Map of qualifying-question key → answer.                             |
| `createdAt`          | string | ISO-8601 UTC timestamp generated client-side.                        |

## Response contract

- **2xx** → widget shows the success confirmation.
- **Anything else / network error** → widget shows the failure message and
  offers a *Retry* button. The user's answers stay in `localStorage` so the
  retry sends the same payload without re-asking questions.

## Server-side recommendations

- Validate `email` server-side again — never trust the client.
- Rate-limit by IP and `email`.
- Add CORS for the Webflow domain only:
  `Access-Control-Allow-Origin: https://www.your-webflow-site.com`.
- Forward to your CRM (HubSpot, Salesforce, etc.) and to a notification channel
  (Slack, email).
- Log `intent` and `recommendedProduct` to track which modules drive demand.
