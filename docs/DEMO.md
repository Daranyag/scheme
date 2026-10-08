# TN Schemes & Pensions Finder - 5 Minute Demo Script

## Prerequisites
- Start MongoDB locally.
- Run `node seed.js` (if empty) then `node server.js` in `/server`.
- Run `flutter run` in `/mobile_app`.

## 1. Introduction (0:00 - 1:00)
**Action:** Open the app. It lands on the "Profile" screen.
**Talk Track:** "Welcome to the TN Schemes Finder. This app helps citizens discover government schemes they are eligible for. We start by creating a local profile. The best part? No login is required, and all personal data stays securely on your device."
**Action:** Fill out: Age 65, Female, Income 80,000, Widowed, check "Destitute". Save.

## 2. The Rule Engine (1:00 - 2:00)
**Action:** The app redirects to the Dashboard.
**Talk Track:** "The app's on-device rule engine instantly calculates eligibility. Here you see we qualify for the Old Age Pension and Destitute Widow Pension. Let's look at the 'Almost Eligible' section. Notice it says we are just 5,000 Rupees over the limit for another scheme. We only show near-misses for mutable fields like Income or Age."
**Action:** Tap "Destitute Widow Pension" to show the checklist.
**Talk Track:** "Here we see the normalized document checklist. If I tick 'Aadhaar' here, it auto-ticks on every other scheme requiring Aadhaar."

## 3. AI Scheme Finder & Grounding (2:00 - 3:30)
**Action:** Switch to "Scheme Finder" tab. Paste a web link to a new unlisted scheme.
**Talk Track:** "What if a scheme isn't in our database? Using Google Gemini, the backend fetches the page, reads the text, and extracts the rules to compare against our local profile. The extraction is strictly grounded against the provided document to prevent hallucinations."

## 4. AI Chat (3:30 - 4:30)
**Action:** Switch to the "AI Chat" tab. Tap the microphone icon. Say: "What documents do I need for the Widow Pension?"
**Talk Track:** "This chatbot uses Gemini Function Calling to securely query our MongoDB database. It *never* guesses amounts or rules from its general memory. Watch as it streams the exact document list."

## 5. Review Panel (Admin) (4:30 - 5:00)
**Action:** Switch to a desktop browser, open `http://localhost:3000/admin`.
**Talk Track:** "Finally, because AI makes mistakes, any scheme discovered by the AI goes into a 'Pending' queue. A human administrator uses this dashboard to verify the extraction against the official source link before approving it for all app users."
