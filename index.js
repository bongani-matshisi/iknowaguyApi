require('dotenv').config();
const axios = require("axios");
const crypto = require("crypto");
const dns = require('dns');
const express = require("express");
const cors = require("cors");
const bodyParser = require('body-parser');
const db = require("./dbConfig");
const moment = require('moment');
const nodemailer = require("nodemailer");
const validDomais = [
  'www.payfast.co.za',
  'sandbox.payfast.co.za',
  'w1w.payfast.co.za',
  'w2w.payfast.co.za',
  "https://inkowaguy.vercel.app",
  "https://www.inkowaguy.vercel.app",
  "https://www.iknowaguysa.co.za",
  "https://www.paysho.co.za",
  "https://payfastpaymentvalidator.onrender.com",
  "http://localhost",
  "http://localhost:3000"
];
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors({ origin: validDomais }));

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

    if (check1 == true) {
      // All checks have passed, the payment is successful
      console.log("valid checks");
      const { m_payment_id, amount_gross, custom_str1, custom_str2, amount_fee, amount_net, custom_str3, name_first, name_last, email_address } = req?.body;
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
            tokens: [...tokens, { "tk": m_payment_id, "pdate": moment().format('MMMM Do YYYY, h:mm a'), amount_gross, amount_fee, amount_net, "Package": custom_str2, "phone": custom_str3 }]
          }
          // Update specific fields in the document
          docRef.update(updateBalance).then(() => {
            console.log('Document successfully updated!');
            const site = 'https://inkowaguy.vercel.app/login';
            //SendSmsToCustomer(`Hi ${name_first + " " + name_last},\n Thank you for recharging your account with us on I-know-A-Guy.\n You bought the ${custom_str2} package. You may review your account balance on the site : ${site} \n\n Kind Reagerds,\n I Know A Guy Team.`, custom_str3?.trim());

          }).catch((error) => {
            console.error('Error updating document: ', error);
          });

        } else {
          //send sms recharge failure
          // SendSmsToCustomer(`Hi Future,\n sorry we had a technical issue while attempting to recharche your account (avoid attempting to recharge your account until you consult with us).\n Kindly contact our adminstration Team.\n\nOrder Details\n
          // Package: ${custom_str2}
          // \nGross Amount: ${amount_gross}
          //  \nRefference Key: ${m_payment_id}`, custom_str3?.trim());
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

app.post('/sendemailawardingproject', async (req, res) => {
  const { name, email, message, subject } = req.body;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.HOST,
      port: process.env.EMAILPORT,
      secure: true,
      auth: {
        user: process.env.USER,
        pass: process.env.PASS,
      },
      rejectUnauthorized: true,
    });

    transporter.sendMail({
      from: process.env.USER,
      to: email,
      subject: subject,

      html: `<p>Dear ${name},<br>You have been awarded the project for ${message?.project} that you placed a bid on.</p><br>
      <p><h4 style="text-decoration: underline">Project Details</h4><br>
      project: ${message?.project}<br>
      homeowmer: ${message?.homeowmer}<br>
      phone number : ${message?.phoneNum}</p><br>
      <p> You may contact the homeowner using more of their details which you will find under your profile on the I Know A Guy website.</p><br>
			<p>Kind Regards,</p><br><strong>IKAG Admin</strong>`
    }).then(() => {
      res.status(200).json({ message: "email deliverd" });
    }).catch((error) => {
      res.status(400).json({ message: "error: " + error?.message });
    })
  } catch (error) {
    res.status(400).json({ message: error?.mesage });
  }
});
app.post('/sendemailrecommendation', async (req, res) => {
  const { name, email, message, subject } = req.body;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.HOST,
      port: process.env.EMAILPORT,
      secure: true,
      auth: {
        user: process.env.USER,
        pass: process.env.PASS,
      },
      rejectUnauthorized: true,
    });

    transporter.sendMail({
      from: process.env.USER,
      to: email,
      subject: subject,
      html: `<p>Dear ${name},<br>You have been recommended on I Know a Guy website</p><br>
      <p><h4 style="text-decoration: underline">Recommendation Details</h4><br>
      Contractor's Name : ${message?.contName}<br>
      Company Name: ${message?.cmpName}<br>
      Contractor's Phone No. : ${message?.cmpPhone}<br>
      Compay's Address : ${message?.cmpAddr}<br>
      Company's Service(s) : ${message?.cmpService}<br>
      Recommending Person's Name : ${message?.recomName}<br>
      Indicated Relationship : "${message?.relation}"<br><br>
      Click the link to register on the website. </p><a href="https://inkowaguy.vercel.app/contractor-registration" target="blank">Register On Website</a><br>
      <p>Kind Regards,</p><br><strong>IKAG Admin</strong>`
    }).then(() => {
      res.status(200).json({ message: "email deliverd" });
    }).catch((error) => {
      res.status(400).json({ message: "error: " + error?.message });
    })
  } catch (error) {
    res.status(400).json({ message: error?.mesage });
  }
});
app.post('/sendemailAdminRecommendationCopy', async (req, res) => {
  const { email, message, subject } = req.body;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.HOST,
      port: process.env.EMAILPORT,
      secure: true,
      auth: {
        user: process.env.USER,
        pass: process.env.PASS,
      },
      rejectUnauthorized: true,
    });

    transporter.sendMail({
      from: process.env.USER,
      to: email,
      subject: subject,
      html: `<p>A recommendation has been made on I Know a Guy website</p><br>
      <p><h4 style="text-decoration: underline">Recommendation Details</h4><br>
      Contractor's Name : ${message?.contName}<br>
      Company Name: ${message?.cmpName}<br>
      Contractor's Phone No. : ${message?.cmpPhone}<br>
      Compay's Address : ${message?.cmpAddr}<br>
      Company's Service(s) : ${message?.cmpService}<br>
      Recommending Person's Name : ${message?.recomName}<br>
      Indicated Relationship : "${message?.relation}"</p><br>
      <p>Kind Regards,</p><br><strong>IKAG Admin</strong>`
    }).then(() => {
      res.status(200).json({ message: "email deliverd" });
    }).catch((error) => {
      res.status(400).json({ message: "error: " + error?.message });
    })
  } catch (error) {
    res.status(400).json({ message: error?.mesage });
  }
});
app.post('/smscustomer', async (req, res) => {
  try {
    const { message, phone } = req.body;
    let apiKey = process.env.SMS_API_KEY;
    let apiSecret = process.env.SMS_API_SECRET;
    let accountApiCredentials = apiKey + ':' + apiSecret;

    let buff = new Buffer.from(accountApiCredentials);
    let base64Credentials = buff.toString('base64');

    let requestHeaders = {
      headers: {
        'Authorization': `Basic ${base64Credentials}`,
        'Content-Type': 'application/json'
      }
    };

    let requestData = JSON.stringify({
      messages: [{
        content: message.trim(),
        destination: phone.trim()
      }]
    });

    const response = await axios.post('https://rest.smsportal.com/bulkmessages', requestData, requestHeaders);
    if (response?.data) {
      res.status(200).json(response?.data);
    }

  } catch (error) {
    console.log("Send SMS Failure:");
    console.log(error?.response.data);
    res.status(400).json({ message: "error: " + error?.message });
  }
});
app.post('/smshomeowner', async (req, res) => {
  try {
    const { message, phone } = req.body;
    let apiKey = process.env.SMS_API_KEY;
    let apiSecret = process.env.SMS_API_SECRET;
    let accountApiCredentials = apiKey + ':' + apiSecret;

    let buff = new Buffer.from(accountApiCredentials);
    let base64Credentials = buff.toString('base64');

    let requestHeaders = {
      headers: {
        'Authorization': `Basic ${base64Credentials}`,
        'Content-Type': 'application/json'
      }
    };
    let contentMsg=`Hi ${message?.owner}, a bid has been placed on your project: ${message?.task} \nThe contractor made an offer amount of R${message?.offerMade}.\nCompany Name / Skilled Individual : ${message?.companyName}`;
    
    let requestData = JSON.stringify({
      messages: [{
        content: contentMsg?.trim(),
        destination: phone.trim()
      }]
    });

    const response = await axios.post('https://rest.smsportal.com/bulkmessages', requestData, requestHeaders);
    if (response?.data) {
      res.status(200).json(response?.data);
    }

  } catch (error) {
    console.log("Send SMS Failure:");
    console.log(error?.response.data);
    res.status(400).json({ message: "error: " + error?.message });
  }
});
app.listen(process.env.PORT, () => {
  console.log("Listening on port : " + process.env.PORT)
});
