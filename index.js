const axios = require("axios");
const crypto = require("crypto");
const dns = require('dns');
const express = require("express");
const cors = require("cors");
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

const pfValidSignature = (pfData, pfParamString, pfPassphrase = null ) => {
    // Calculate security signature
    let tempParamString = '';
    if (pfPassphrase !== null) {
      pfParamString +=`&passphrase=${encodeURIComponent(pfPassphrase.trim()).replace(/%20/g, "+")}`;
    }
    const signature = crypto.createHash("md5").update(pfParamString).digest("hex");
    console.log(signature);
    return pfData['signature'] === signature;
  };
  
  async function ipLookup(domain){
    return new Promise((resolve, reject) => {
      dns.lookup(domain, {all: true}, (err, address, family) => {
        if(err) {
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
  
    try{
      for(let key in validHosts) {
        const ips = await ipLookup(validHosts[key]);
        validIps = [...validIps, ...ips];
      }
    } catch(err) {
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
app.post("/notify", (req, res) => {

    const testingMode = true;
    const pfHost = testingMode ? "sandbox.payfast.co.za" : "www.payfast.co.za";

    console.log(req.body);
    const pfData = JSON.parse(JSON.stringify(req.body));

    console.log("pd data");
    console.log(pfData)
    let pfParamString = "";
    for (let key in pfData) {
        if (pfData.hasOwnProperty(key) && key !== "signature") {
            pfParamString += `${key}=${encodeURIComponent(pfData[key].trim()).replace(/%20/g, "+")}&`;
        }
    }

    // Remove last ampersand
    pfParamString = pfParamString.slice(0, -1);
    const passPhrase = "jt7NOE43FZPn";
    const check1 = pfValidSignature(pfData, pfParamString, passPhrase);
   // const check2 = pfValidIP(req);
    //const check4 = pfValidServerConfirmation(pfHost, pfParamString);

if(check1==true ) {
    // All checks have passed, the payment is successful
    console.log("valid checks")
    res.status(200).json({ message: "valid checks" });
} else {
    // Some checks have failed, check payment manually and log for investigation
    console.log("invalid checks")
    res.status(200).json({ message: "invalid checks" });
}

   // res.status(200).json({ message: "hello post" });
});

app.listen(4000);

