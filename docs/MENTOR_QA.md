# Mentor QA Guide

### 1. How do you prevent the AI from hallucinating scheme rules?
**Answer:** We never rely on Gemini's internal memory for facts. In the Chat, we use Function Calling to query MongoDB directly. In the Finder and Live Fetch, we use Gemini strictly as a text-extraction engine against a fetched document (or Google Search Grounding), providing rigid JSON schemas and instructions to "only extract what is written."

### 2. Is user data safe? Where is it sent?
**Answer:** Absolute privacy is core to the app. PII (Name, Aadhaar, Phone) is never collected. Demographic data (Age, Gender, Income Band) is stored locally via `SharedPreferences`. When querying the backend (e.g., for Discovery jobs), we send an anonymous UUID and only the demographic fields. Gemini never sees personal identifiers.

### 3. What if a user submits a fake scheme URL?
**Answer:** The Node.js backend strictly filters all fetches against an `allowlistedDomains` config (e.g., `gov.in`, `nic.in`, `tn.gov.in`). If a user submits a `wordpress.com` link, the fetch is rejected.

### 4. How does the "Near-Miss" logic avoid giving bad advice?
**Answer:** The rule engine separates mutable fields (Age, Income) from immutable fields (Gender, Disability). It only generates a "Near-Miss" suggestion if exactly *one* mutable field fails. We never suggest changing immutable facts (e.g., we never say "You would be eligible if you were Female").

### 5. Why is MongoDB used instead of a local SQLite DB?
**Answer:** While the user profile and evaluation happen locally, the *schemes data* changes frequently (amounts change, deadlines shift). MongoDB acts as the central verified truth that we can update via our Admin Panel without requiring an app store update. The app fetches the latest schemas and caches them locally for offline use.

### 6. How does the Document Normalization work?
**Answer:** Government sites use different names for the same document (e.g., "Ration Card", "Smart Card", "Family Card"). Our Node.js backend runs a normalization dictionary to map these into a unified vocabulary key. This allows the app to tick off "Ration Card" globally across all schemes for a family member.

### 7. What happens if a user is offline?
**Answer:** The app caches the `GET /api/schemes` payload. The Rule Engine is written in Dart and runs on-device, meaning users can evaluate their profile against the cached database completely offline. The AI Chat and Finder require connectivity.

### 8. How scalable is the AI Discovery Queue?
**Answer:** The `POST /api/profile/sync` endpoint drops a job into a MongoDB collection. We use a lock mechanism and status tracking (`pending`, `processing`, `completed`) to ensure workers pick up jobs sequentially. 

### 9. What's not done yet? (Honest Limitations)
**Answer:** 
1. The OCR fallback (converting scanned PDFs to images for Gemini Vision) requires `pdf2pic` and system-level dependencies (Ghostscript) which are not fully implemented.
2. The Web Admin panel is currently an API only; the React UI needs to be built.
3. Multilingual Voice TTS (Text-to-Speech) relies heavily on device-specific OS voices, which can be inconsistent for Tamil.
