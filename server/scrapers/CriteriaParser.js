class CriteriaParser {
  constructor() {
    this.patterns = [
      { regex: /(?:age\s*|aged\s*)?(\d+)\s*(?:years.*?and above|years.*?or more|and above)/i, field: 'age', op: '$gte' },
      { regex: /annual income.*?not exceed(?:ing)?.*?rs\.?\s*([\d,]+)/i, field: 'annualIncome', op: '$lte' },
      { regex: /widow/i, field: 'maritalStatus', value: 'widowed' },
      { regex: /destitute/i, field: 'destitute', value: true },
      { regex: /(\d+)%?\s*(?:or more)?\s*disability/i, field: 'disabilityPercent', op: '$gte' }
    ];
  }

  parse(text) {
    const rules = {};
    const unmapped = [];
    let matchedAny = false;

    for (const pattern of this.patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        matchedAny = true;
        if (pattern.value !== undefined) {
           rules[pattern.field] = pattern.value;
        } else if (match[1]) {
           const numValue = parseInt(match[1].replace(/,/g, ''), 10);
           if (!isNaN(numValue)) {
              if (pattern.op) {
                 rules[pattern.field] = { [pattern.op]: numValue };
              } else {
                 rules[pattern.field] = numValue;
              }
           }
        }
      }
    }
    
    if (!matchedAny) {
      unmapped.push(text.trim());
    }

    return { rules, unmapped };
  }
}

module.exports = CriteriaParser;
