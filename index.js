require('dotenv').config();
const axios = require("axios");
const crypto = require("crypto");
const dns = require('dns');
const express = require("express");
const cors = require("cors");
const bodyParser = require('body-parser');
const db = require("./dbConfig");
const moment = require('moment');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware to parse application/json
app.use(bodyParser.json());
app.use(cors());

const pfValidSignature = (pfData, pfParamString, pfPassphrase = null) => {
  // Calculate security signature
  let tempParamString = '';
  if (pfPassphrase !== null) {
    pfParamString += `&passphrase=${encodeURIComponent(pfPassphrase.trim()).replace(/%20/g, "+")}`;
  }
  const signature = crypto.createHash("md5").update(pfParamString).digest("hex");
  return pfData['signature'] === signature;
};

async function ipLookup(domain) {
  return new Promise((resolve, reject) => {
    dns.lookup(domain, { all: true }, (err, address, family) => {
      if (err) {
        reject(err)
      } else {
        const addressIps = address.map(function (item) {
          return item.address;
        });
        resolve(addressIps);
      }
    });
  });
}

const pfValidIP = async (req) => {
  const validHosts = [
    'www.payfast.co.za',
    'sandbox.payfast.co.za',
    'w1w.payfast.co.za',
    'w2w.payfast.co.za'
  ];

  let validIps = [];
  const pfIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  try {
    for (let key in validHosts) {
      const ips = await ipLookup(validHosts[key]);
      validIps = [...validIps, ...ips];
    }
  } catch (err) {
    console.error(err);
  }

  const uniqueIps = [...new Set(validIps)];

  if (uniqueIps.includes(pfIp)) {
    return true;
  }
  return false;
};
const pfValidServerConfirmation = async (pfHost, pfParamString) => {
  const result = await axios.post(`https://${pfHost}/eng/query/validate`, pfParamString)
    .then((res) => {
      return res.data;
    })
    .catch((error) => {
      console.error(error)
    });
  return result === 'VALID';
};
app.post("/notify", async (req, res) => {
  try {
    const testingMode = true;
    const pfHost = testingMode ? "sandbox.payfast.co.za" : "www.payfast.co.za";

    const pfData = JSON.parse(JSON.stringify(req.body));

    let pfParamString = "";
    for (let key in pfData) {
      if (pfData.hasOwnProperty(key) && key !== "signature") {
        pfParamString += `${key}=${encodeURIComponent(pfData[key].trim()).replace(/%20/g, "+")}&`;
      }
    }

    // Remove last ampersand
    pfParamString = pfParamString.slice(0, -1);
    const passPhrase = process.env.PHASS_PHRASE;
    const check1 = pfValidSignature(pfData, pfParamString, passPhrase);
    const check2 = await pfValidIP(req);
    const check4 = await pfValidServerConfirmation(pfHost, pfParamString);

    if (check1 == true ) {
      // All checks have passed, the payment is successful
      console.log("valid checks");
      const { m_payment_id, amount_gross, custom_str1, custom_str2,amount_fee,amount_net,custom_str3 , email_address } = req?.body;
      console.log(req.body);
      const docRef = db.collection('BidCredits').doc(custom_str1);

      db.collection('BidCredits').doc(custom_str1).get().then((doc) => {
        if (doc.exists) {
          console.log('Document data:', doc.data());
          //recharge account
          const { credit, tokens } = doc?.data();
          let updateBalance = {};
          updateBalance = {
            credit: custom_str2 == "Bronze" ? credit + 5 : custom_str2 == "Silver" ? credit + 10 : credit + 20,
            CreditType: "paid",
            tokens: [...tokens, { "tk": m_payment_id, "pdate": moment().format('MMMM Do YYYY, h:mm a'),amount_gross,amount_fee,amount_net,"Package":custom_str2,"phone":custom_str3 }]
          }
          // Update specific fields in the document
          docRef.update(updateBalance).then(() => {
            console.log('Document successfully updated!');
            //send success rechange sms


          }).catch((error) => {
            console.error('Error updating document: ', error);
          });

        } else {
          //send sms recharge failure
        }
      }).catch((error) => {
        //send sms recharge failure
        console.error('Error getting document: ', error);
      });
      // Reference to the document

      res.status(200).json({ message: "valid checks" });
    } else {
      // Some checks have failed, check payment manually and log for investigation
      console.log("invalid checks");
      console.log(req.body);
      res.status(200).json({ message: "invalid checks" });
    }
  } catch (error) {
    console.log("something went wrong");
    res.status(404).json({ message: error.message });
  }

});
app.post('/verify-recaptcha', async (req, res) => {
  const { token } = req.body;
  const secretKey = process.env.SECRETKEY;
  try {
    const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
      params: {
        secret: secretKey,
        response: token,
      },
    });

    if (response.data.success) {
      // Token is valid
      console.log("success");
      res.json({ success: true, message: 'reCAPTCHA verification successful' });
    } else {
      // Token is invalid
      res.status(400).json({ success: false, message: 'reCAPTCHA verification failed' });
    }
  } catch (error) {
    console.error('Error verifying reCAPTCHA token:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
app.listen(4000, () => {
  console.log("Listening on port : " + process.env.PORT)
});

