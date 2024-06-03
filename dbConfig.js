const admin = require('firebase-admin');
const serviceAccount = require('./inknowaguy-firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://console.firebase.google.com/project/inknowaguy/database/inknowaguy-default-rtdb/data/~2F"
});

const db = admin.firestore();

module.exports=db;