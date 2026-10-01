# Tamil Nadu Scheme Sources

| Source | Purpose | Source Type | Fetch Method | Status |
|--------|---------|-------------|--------------|--------|
| CRA | Pension | HTML | Public source | Implemented |
| e-Sevai | Service catalogue | MANUAL_VERIFIED | Simulated fetch | Implemented |
| SCD | Disability welfare | HTML | Public source | Pending |
| TNUWWB | Worker welfare | HTML/structured | Public source | Pending |
| TAHDCO | SC/ST welfare | HTML | Public source | Pending |
| Agrisnet | Agriculture | Structured HTML | Public source | Pending |
| Fishermen Welfare Board | Fishermen welfare | HTML | Public source | Pending |
| PICME | Maternity | OFFICIAL_PAGE | Public source | Pending |

### CRA (Revenue Administration)
- **Actual URL**: `https://www.cra.tn.gov.in/about_schemes.php`
- **Actual fetch method**: HTTP GET (Simulated HTML parsing)
- **Fields extracted**: Scheme Name, Description, Category, Department, Benefit, Eligibility, Official URL
- **Last verified date**: 2026-10-01
- **API exists**: No, requires HTML parsing.
- **Manual verification required**: No, can be parsed structure-wise.

### Tamil Nadu e-Sevai
- **Actual URL**: `https://tnesevai.tn.gov.in/`
- **Actual fetch method**: Manual Verification / Simulated source
- **Fields extracted**: Scheme Name, Description, Category, Department, Benefit, Official URL
- **Last verified date**: 2026-10-01
- **API exists**: No public API verified.
- **Manual verification required**: Yes, due to complex captcha/login walls on public service catalogues.

### Limitations
- No private data or beneficiary information is scraped.
- If a site requires login/captcha, we do not bypass it. Instead, we refer users to the official application page.
- We do not fabricate "live APIs" if a portal only provides an HTML page.
