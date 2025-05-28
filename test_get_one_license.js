const https = require('https');

// The ID of the license we want to obtain (for example: 'mit', 'apache-2.0', 'gpl-3.0')
const licenseId = process.argv[2] || 'mit';

// Options for the HTTP request
const options = {
    hostname: 'api.github.com',
    path: `/licenses/${licenseId}`,
    method: 'GET',
    headers: {
        'User-Agent': 'Choose-License-Alfred-Workflow',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    }
};

// Make the request
const req = https.request(options, (res) => {
    let data = '';

    // Collect the data
    res.on('data', (chunk) => {
        data += chunk;
    });

    // Process the data when the response ends
    res.on('end', () => {
        try {
            const license = JSON.parse(data);
            console.log(`Name: ${license.name}`);
            console.log(`Description: ${license.description}`);
            console.log(`\nLicense content:\n`);
            console.log(license.body);
        } catch (error) {
            console.error('Error parsing data:', error.message);
            console.log('Raw response:', data);
        }
    });
});

// Handle request errors
req.on('error', (error) => {
    console.error('Error making the request:', error.message);
});

// End the request
req.end();
