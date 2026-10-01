const Scheme = require('../models/Scheme');

const upsertScheme = async (normalizedScheme) => {
  try {
    // Find by name and department
    let existingScheme = await Scheme.findOne({ 
      schemeName: normalizedScheme.schemeName,
      department: normalizedScheme.department 
    });

    if (existingScheme) {
      // Update existing
      existingScheme.lastVerifiedAt = new Date();
      existingScheme.isActive = true;
      
      // Update missing fields
      if (!existingScheme.description) existingScheme.description = normalizedScheme.description;
      if (!existingScheme.benefit) existingScheme.benefit = normalizedScheme.benefit;
      
      // Add source reference if new
      const hasRef = existingScheme.sourceReferences.some(
        ref => ref.sourceName === normalizedScheme.sourceName
      );
      if (!hasRef) {
        existingScheme.sourceReferences.push({
          sourceName: normalizedScheme.sourceName,
          url: normalizedScheme.officialSourceUrl
        });
      }

      await existingScheme.save();
    } else {
      // Create new
      normalizedScheme.sourceReferences = [{
        sourceName: normalizedScheme.sourceName,
        url: normalizedScheme.officialSourceUrl
      }];
      await Scheme.create(normalizedScheme);
    }
  } catch (error) {
    console.error('Error upserting scheme:', error.message);
    throw error;
  }
};

module.exports = {
  upsertScheme
};
