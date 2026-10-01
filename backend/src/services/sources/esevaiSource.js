const fetchSchemes = async () => {
  // Simulated e-Sevai fetch
  return [
    {
      schemeName: "CM Uzhavar Pathukapu Thittam",
      description: "Farmers security scheme.",
      category: "Social Welfare",
      department: "e-Sevai",
      benefit: "Various assistance",
      officialSourceUrl: "https://tnesevai.tn.gov.in/"
    }
  ];
};

module.exports = {
  sourceName: 'Tamil Nadu e-Sevai',
  sourceUrl: 'https://tnesevai.tn.gov.in/',
  sourceType: 'MANUAL_VERIFIED',
  fetchSchemes
};
