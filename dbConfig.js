require('dotenv').config();
const admin = require('firebase-admin');
const serviceAccount = require('./iknowaguy_Admin_sdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DB_URL
});

const db = admin.firestore();

module.exports=db;