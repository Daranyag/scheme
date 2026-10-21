const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Scheme = require('../models/Scheme');

  await Scheme.updateOne(
    { name: 'Kalaignar Magalir Urimai Thogai' },
    {
      $set: {
        howToApply: [
          'Visit your designated local Fair Price Shop (Ration Shop) or special camp in your ward/village.',
          'Bring your Smart Family Ration Card, Aadhaar card, electricity consumer number, and bank passbook (linked with Aadhaar).',
          'Fill in the application form and biometric/OTP authentication will be completed by field staff.',
          'Collect the acknowledgement receipt with the tracking application number. You can check the approval status on kmut.tn.gov.in.'
        ]
      }
    }
  );

  await Scheme.updateOne(
    { name: 'Post-Matric Scholarship for SC/ST' },
    {
      $set: {
        howToApply: [
          'Obtain your admission confirmation from your recognized college or polytechnic institution.',
          'Apply online through the Tamil Nadu Adi Dravidar and Tribal Welfare Scholarship Portal (scholarships.tn.gov.in) or National Scholarship Portal.',
          'Upload your Community Certificate, Income Certificate, 10th/12th Marks Sheet, Bank Passbook, and College Bonafide Certificate.',
          'Submit the application to the college scholarship nodal officer for institutional verification and government approval.'
        ]
      }
    }
  );

  await Scheme.updateOne(
    { name: 'Unorganised Workers Welfare Board Registration' },
    {
      $set: {
        howToApply: [
          'Visit the Tamil Nadu Labour Department portal at labour.tn.gov.in / tnuwwb.tn.gov.in or your nearest e-Sevai centre.',
          'Select your specific trade (e.g., Construction Worker, Driver, Tailor, Domestic Worker, Street Vendor).',
          'Upload your Aadhaar Card, Ration Card, Bank Passbook, and employer / trade union / VAO certificate confirming your occupation.',
          'Submit the application, download your digital Workers Welfare ID card, and use it to claim annual educational, marriage, and pension benefits.'
        ]
      }
    }
  );

  console.log('Successfully updated schemes with howToApply steps!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
