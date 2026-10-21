// Utility functions for Tamil and English localization across Scheme screens

String getCategoryName(String category, {required bool isTamil}) {
  final catLower = category.trim().toLowerCase();
  if (!isTamil) {
    if (catLower.isEmpty) return 'GENERAL';
    return category.toUpperCase();
  }

  if (catLower.contains('health')) return 'சுகாதாரம் (HEALTH)';
  if (catLower.contains('education') || catLower.contains('scholarship')) return 'கல்வி (EDUCATION)';
  if (catLower.contains('social welfare') || catLower.contains('women')) return 'சமூக நலம் (SOCIAL WELFARE)';
  if (catLower.contains('agri') || catLower.contains('farmer')) return 'விவசாயம் (AGRICULTURE)';
  if (catLower.contains('employment') || catLower.contains('job') || catLower.contains('skill')) return 'வேலைவாய்ப்பு (EMPLOYMENT)';
  if (catLower.contains('housing')) return 'வீட்டு வசதி (HOUSING)';
  if (catLower.contains('differently abled') || catLower.contains('disab')) return 'மாற்றுத்திறனாளிகள் நலம்';
  if (catLower.contains('senior') || catLower.contains('pension')) return 'முதியோர் நலம் / ஓய்வூதியம்';
  if (catLower.contains('youth') || catLower.contains('sports')) return 'இளைஞர் நலம் / விளையாட்டு';

  return category.isNotEmpty ? category.toUpperCase() : 'பொதுவான திட்டம்';
}

String translateCriteria(String criteria, {required bool isTamil}) {
  if (!isTamil) return criteria;
  final trimmed = criteria.trim();

  // Pattern matches
  // 1. Income is below ₹120000 limit / Income is within ₹...
  final incomeMatch = RegExp(r'income (?:is )?(?:below|within|<=|<)\s*(₹?\s*[\d,]+)', caseSensitive: false).firstMatch(trimmed);
  if (incomeMatch != null) {
    final amt = incomeMatch.group(1)!.trim();
    return 'ஆண்டு வருமானம் $amt வரம்பிற்குள் உள்ளது';
  }

  // 2. Age is at least 21 / Age matches (>= 21)
  final ageMatch = RegExp(r'age (?:is )?(?:at least|>=|>)\s*(\d+)', caseSensitive: false).firstMatch(trimmed);
  if (ageMatch != null) {
    final age = ageMatch.group(1)!.trim();
    return 'வயது $age அல்லது அதற்கு மேல் உள்ளது';
  }
  final ageMaxMatch = RegExp(r'age (?:is )?(?:at most|<=|<)\s*(\d+)', caseSensitive: false).firstMatch(trimmed);
  if (ageMaxMatch != null) {
    final age = ageMaxMatch.group(1)!.trim();
    return 'வயது $age வரம்பிற்குள் உள்ளது';
  }

  // 3. Gender matches / Gender is female
  if (RegExp(r'gender (?:is female|matches \(f\)|= f)', caseSensitive: false).hasMatch(trimmed)) {
    return 'பெண்களுக்கான திட்டம் (பாலினம் பொருந்துகிறது)';
  }
  if (RegExp(r'gender (?:is male|matches \(m\)|= m)', caseSensitive: false).hasMatch(trimmed)) {
    return 'ஆண்களுக்கான திட்டம் (பாலினம் பொருந்துகிறது)';
  }

  // 4. Community / caste matches
  final commMatch = RegExp(r'community (?:category )?matches \((.+?)\)', caseSensitive: false).firstMatch(trimmed);
  if (commMatch != null) {
    final comm = commMatch.group(1)!.trim();
    return 'சமூகப் பிரிவு பொருந்துகிறது ($comm)';
  }

  // 5. Ration card head / family card
  if (RegExp(r'rationCardHead|ration card head', caseSensitive: false).hasMatch(trimmed)) {
    return 'குடும்ப அட்டை தலைவர் தகுதி பொருந்துகிறது';
  }

  // 6. Common unmapped or specific criteria
  if (RegExp(r'name must be on the family card', caseSensitive: false).hasMatch(trimmed)) {
    return 'உங்கள் பெயர் குடும்ப அட்டையில் (Ration Card) இடம்பெற்றிருக்க வேண்டும்';
  }
  if (RegExp(r'differently abled persons.*exempt', caseSensitive: false).hasMatch(trimmed)) {
    return 'மாற்றுத்திறனாளிகள் மற்றும் சில பிரிவினருக்கு வருமான வரம்பில் விலக்கு உண்டு (சரிபார்க்கவும்)';
  }
  if (RegExp(r'Recognized UG, diploma, ITI or professional course', caseSensitive: false).hasMatch(trimmed)) {
    return 'அங்கீகரிக்கப்பட்ட இளங்கலை பட்டம், டிப்ளமோ, ஐடிஐ அல்லது தொழிற்கல்வி பயில வேண்டும்';
  }
  if (RegExp(r'Distance / open-university courses are not eligible', caseSensitive: false).hasMatch(trimmed)) {
    return 'தொலைதூரக் கல்வி / திறந்தநிலை பல்கலைக்கழக படிப்புகள் தகுதியற்றவை';
  }
  if (RegExp(r'Family land under 5 acres wetland', caseSensitive: false).hasMatch(trimmed)) {
    return 'குடும்ப நிலம்: 5 ஏக்கர் நன்செய் அல்லது 10 ஏக்கர் புன்செய் நிலத்திற்குள் இருக்க வேண்டும்';
  }
  if (RegExp(r'Household electricity use under 3,600 units', caseSensitive: false).hasMatch(trimmed)) {
    return 'வீட்டு மின்சாரப் பயன்பாடு: ஆண்டுக்கு 3,600 யூனிட்டுகளுக்குள் இருக்க வேண்டும்';
  }
  if (RegExp(r'Only one woman per ration card', caseSensitive: false).hasMatch(trimmed)) {
    return 'ஒரு குடும்ப அட்டைக்கு ஒரு பெண் மட்டுமே விண்ணப்பிக்க முடியும்';
  }
  if (RegExp(r'Not eligible: government employees', caseSensitive: false).hasMatch(trimmed)) {
    return 'தகுதியற்றவர்கள்: அரசு ஊழியர்கள், வருமான வரி செலுத்துவோர், 4 சக்கர வாகனம் உடையவர்கள்';
  }
  if (RegExp(r'studied Classes 6.*in a government school', caseSensitive: false).hasMatch(trimmed)) {
    return '6 முதல் 12-ஆம் வகுப்பு வரை அரசுப் பள்ளியில் படித்திருக்க வேண்டும்';
  }

  return trimmed;
}

String translateDocumentName(String doc, {required bool isTamil}) {
  if (!isTamil) return doc;
  final d = doc.trim();
  final dLower = d.toLowerCase();

  if (dLower.contains('income certificate')) return 'வருமானச் சான்றிதழ் (VAO / வருவாய்த்துறை)';
  if (dLower.contains('family') || dLower.contains('ration')) return 'குடும்ப அட்டை (Smart Ration Card)';
  if (dLower.contains('aadhaar')) return 'ஆதார் அட்டை (Aadhaar)';
  if (dLower.contains('bank passbook') || dLower.contains('bank account')) return 'வங்கி கணக்கு புத்தகம் (Aadhaar linked Bank Passbook)';
  if (dLower.contains('self-declaration')) return 'குடும்பத் தலைவரின் சுய அறிவிப்புப் படிவம் (Self-declaration)';
  if (dLower.contains('transfer certificate') || dLower.contains('emis')) return 'பள்ளி மாற்றுச் சான்றிதழ் (Transfer Certificate / EMIS)';
  if (dLower.contains('address proof')) return 'முகவரிச் சான்று (Address Proof)';
  if (dLower.contains('community certificate')) return 'சாதி / சமூக சான்றிதழ் (Community Certificate)';
  if (dLower.contains('disability certificate')) return 'மாற்றுத்திறனாளி தேசிய அடையாள அட்டை (Disability Card)';
  if (dLower.contains('10th') || dLower.contains('12th') || dLower.contains('marksheet')) return 'கல்வி மதிப்பெண் சான்றிதழ் (Marksheet)';
  if (dLower.contains('photo')) return 'பாஸ்போர்ட் அளவு புகைப்படம் (Passport Photo)';

  return d;
}

String translateBenefit(String benefit, {required bool isTamil}) {
  if (!isTamil || benefit.trim().isEmpty) return benefit;
  final b = benefit.trim();

  // CMCHIS
  if (b.toLowerCase().contains('cashless treatment cover of ₹5 lakh')) {
    return 'ஆண்டுக்கு ஒரு குடும்பத்திற்கு ₹5 லட்சம் வரை கட்டணமில்லா ரொக்கமில்லா மருத்துவ சிகிச்சை காப்பீடு. (₹25 லட்சமாக உயர்த்துவது குறித்த அதிகாரப்பூர்வ அறிவிப்பு தேதி இன்னும் வெளியிடப்படவில்லை).';
  }

  // KMUT
  if (b.toLowerCase().contains('₹1,000/month by dbt to the woman head')) {
    return 'தகுதியுள்ள குடும்பத்தின் பெண் தலைவருக்கு நேரடி பணப் பரிமாற்றம் (DBT) மூலம் மாதம் ₹1,000 உரிமைத் தொகை.';
  }

  // Pudhumai Penn
  if (b.toLowerCase().contains('pudhumai') || (b.toLowerCase().contains('₹1,000/month for girls') && b.toLowerCase().contains('higher education'))) {
    return 'அரசுப் பள்ளியில் 6 முதல் 12-ஆம் வகுப்பு வரை படித்து உயர்கல்வி பயிலும் மாணவிகளுக்கு மாதம் ₹1,000 உதவித்தொகை. வருமான வரம்பு இல்லை.';
  }

  // Tamil Pudhalvan
  if (b.toLowerCase().contains('tamil pudhalvan') || (b.toLowerCase().contains('₹1,000/month for boys') && b.toLowerCase().contains('higher education'))) {
    return 'அரசுப் பள்ளியில் 6 முதல் 12-ஆம் வகுப்பு வரை படித்து உயர்கல்வி பயிலும் மாணவர்களுக்கு மாதம் ₹1,000 உதவித்தொகை.';
  }

  // Moovalur Ramamirtham
  if (b.toLowerCase().contains('marriage assistance') || b.toLowerCase().contains('thirumangalyam')) {
    return 'திருமண நிதியுதவி மற்றும் தாலிக்கு தங்கம் திட்டம் (தகுதியுள்ள பட்டதாரி / பத்தாம் வகுப்பு முடித்த பெண்களுக்கு).';
  }

  // OAP - Old Age Pension
  if (b.toLowerCase().contains('old age') || b.toLowerCase().contains('pension of ₹1,000') || b.toLowerCase().contains('oap')) {
    return 'தகுதியுள்ள முதியோருக்கு மாதம் ₹1,000 அல்லது ₹1,200 முதியோர் உதவித்தொகை (OAP).';
  }

  // General monthly pattern: ₹X/month
  final monthMatch = RegExp(r'₹\s*([\d,]+)\s*(?:/|\s*per\s*)month', caseSensitive: false).firstMatch(b);
  if (monthMatch != null && b.length < 80) {
    final amt = monthMatch.group(1)!.trim();
    return 'மாதம் ₹$amt நேரடி நிதியுதவி.';
  }

  return b;
}

String translateHowToApplyStep(String step, {required bool isTamil}) {
  if (!isTamil || step.trim().isEmpty) return step;
  final s = step.trim();
  final sLower = s.toLowerCase();

  if (sLower.contains('income certificate from the vao')) {
    return 'கிராம நிர்வாக அலுவலர் (VAO) அல்லது வருவாய்த்துறை வட்டாட்சியரிடம் வருமானச் சான்றிதழ் பெறவும்.';
  }
  if (sLower.contains('collectorate with your documents') || sLower.contains('cmchis registration centre')) {
    return 'மாவட்ட ஆட்சியர் அலுவலகத்தில் உள்ள திட்ட பதிவு மையத்தை அசல் ஆவணங்களுடன் அணுகவும்.';
  }
  if (sLower.contains('biometric verification') || sLower.contains('aadhaar and biometric')) {
    return 'ஆதார் மற்றும் கைரேகை சரிபார்ப்பை (Biometric verification) நிறைவு செய்யவும்.';
  }
  if (sLower.contains('receive your smart card') || sLower.contains('cashless treatment at empanelled')) {
    return 'உங்கள் முதலமைச்சர் மருத்துவ காப்பீட்டு ஸ்மார்ட் கார்டைப் பெற்று, அங்கீகரிக்கப்பட்ட மருத்துவமனைகளில் இலவச சிகிச்சை பெறவும்.';
  }
  if (sLower.contains('check the conditions above')) {
    return 'நிலம், மின்சாரப் பயன்பாடு மற்றும் வருமான வரம்புகள் உள்ளிட்ட தகுதி நிபந்தனைகளைச் சரிபார்க்கவும்.';
  }
  if (sLower.contains('taluk special camp when registration is open')) {
    return 'பதிவு முகாம்கள் நடைபெறும் போது உங்கள் தாலுகா சிறப்பு முகாமில் அல்லது ஆன்லைனில் விண்ணப்பிக்கவும்.';
  }
  if (sLower.contains('keep your ration card, aadhaar and bank details ready')) {
    return 'குடும்ப அட்டை (Ration Card), ஆதார் மற்றும் வங்கி கணக்கு விவரங்களை தயாராக வைத்திருக்கவும்.';
  }
  if (sLower.contains('ask your school or college to register you')) {
    return 'நேரடியாக விண்ணப்பிக்க இயலாது. நீங்கள் பயிலும் பள்ளி அல்லது கல்லூரி மூலம் இணையதளத்தில் பதிவு செய்ய அணுகவும்.';
  }
  if (sLower.contains('institution logs in and enters your details')) {
    return 'கல்லூரி நிர்வாகம் இணையதளத்தில் உள்நுழைந்து உங்கள் விவரங்கள் மற்றும் ஆவணங்களைப் பதிவேற்றும்.';
  }
  if (sLower.contains('submit and keep the acknowledgement')) {
    return 'விண்ணப்பத்தை சமர்ப்பித்து ஒப்புதல் ரசீதைப் பத்திரமாக வைத்திருக்கவும். அடுத்த ஆண்டிற்கான புதுப்பித்தலை கல்லூரி உறுதி செய்யும்.';
  }

  return s;
}
