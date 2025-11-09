const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://bambaremun2025_db_user:cLJpmC3knrEUQ40k@cluster0.rlglyd0.mongodb.net/test?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('🎉 CONNECTÉ À MONGODB !');
    process.exit(0);
  })
  .catch(err => {
    console.log('❌ ERREUR:', err.message);
    process.exit(1);
  });
