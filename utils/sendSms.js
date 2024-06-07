const axios = require('axios');

const SendSmsToCustomer = (message,phone) => {

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

    axios.post('https://rest.smsportal.com/bulkmessages', requestData, requestHeaders)

        .then(response => {
            if (response.data) {
                console.log("Success:");
                console.log(response.data);
            }
        })
        .catch(error => {
            if (error.response) {
                console.log("Failure:");
                console.log(error.response.data);
            } else {
                console.log("Something went wrong during the network request.");
            }
        });
}

module.exports = SendSmsToCustomer;