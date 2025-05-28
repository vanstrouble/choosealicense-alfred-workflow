#!/usr/bin/env node

import { request } from 'https';

function getLicenseContent(licenseId) {
    return new Promise((resolve, reject) => {
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

        const req = request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const license = JSON.parse(data);
                    if (license.body) {
                        resolve(license.body);
                    } else {
                        reject(new Error('License content not found'));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function run() {
    try {
        const licenseId = process.argv[2];
        if (!licenseId) {
            throw new Error('No license ID provided');
        }

        const licenseContent = await getLicenseContent(licenseId);
        // Set the environment variable
        process.env.license_val = licenseContent;

        // Print the content for Alfred to capture
        // console.log(licenseContent);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

run();
