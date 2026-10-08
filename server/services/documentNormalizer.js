// Common document vocabulary mapping
const documentVocabulary = {
    'aadhaar': ['aadhaar', 'aadhar', 'adhar card', 'aadhaar card', 'aadhaar and aadhaar consent form'],
    'ration_card': ['ration card', 'family card', 'family (ration) card', 'smart card'],
    'income_certificate': ['income certificate', 'income certificate (vao / revenue authority)'],
    'community_certificate': ['community certificate', 'caste certificate'],
    'bank_passbook': ['bank passbook', 'bank account details', 'aadhaar-linked bank account', 'bank account details (aadhaar-linked)'],
    'age_proof': ['age proof', 'proof of age', 'birth certificate'],
    'photo': ['photo', 'passport size photo', 'photograph'],
    'disability_certificate': ['disability certificate', 'differently abled certificate'],
    'death_certificate_spouse': ['husband\'s death certificate', 'death certificate of spouse'],
    'school_transfer_certificate': ['school transfer certificate', 'tc', 'school transfer certificate (for your emis number)', 'school transfer certificate (class 6–12)'],
    'address_proof': ['address proof', 'proof of address'],
    'emis_number': ['umis / emis number', 'emis number'],
    'college_admission_proof': ['college admission proof'],
    'destitute_affidavit': ['destitute affidavit', 'destitute widow certificate (revenue dept)', 'self-declaration', 'self-declaration by head of family'],
    'unmarried_certificate': ['unmarried certificate']
};

/**
 * Normalizes a raw document string into a shared vocabulary key.
 * If no match is found, returns 'other'.
 */
function normalizeDocumentName(rawName) {
    if (!rawName) return 'other';
    const lower = rawName.toLowerCase().trim();
    
    for (const [key, aliases] of Object.entries(documentVocabulary)) {
        if (aliases.some(alias => lower.includes(alias))) {
            return key;
        }
    }
    return 'other';
}

module.exports = { normalizeDocumentName, documentVocabulary };
