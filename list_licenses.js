#!/usr/bin/env node

import { request } from 'https';

/**
 * Function to get all licenses
 * @return {Promise} Promise that resolves to an array of licenses
 */
function getLicenses() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/licenses',
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
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * Creates the response object for Alfred
 * @param {Array} licenses - Array of filtered licenses
 * @returns {Object} Alfred response object
 */
function createAlfredResponse(licenses) {
    return {
        items: licenses.map(license => ({
            title: license.name,
            subtitle: `${license.spdx_id} - Click to see details`,
            arg: license.spdx_id,
            icon: { path: "icon.png" }
        }))
    };
}

/**
 * Main function that processes Alfred's input
 */
async function run() {
    try {
        const query = process.argv[2] ? process.argv[2].toLowerCase() : '';
        const licenses = await getLicenses();
        const filtered = licenses.filter(license =>
            license.name.toLowerCase().includes(query) ||
            license.spdx_id.toLowerCase().includes(query)
        );

        console.log(JSON.stringify(createAlfredResponse(filtered)));
    } catch (error) {
        console.error(error);
        const errorResponse = {
            items: [{
                title: "Error getting licenses",
                subtitle: error.message,
                icon: { path: "error.png" }
            }]
        };
        console.log(JSON.stringify(errorResponse));
    }
}

// Run
run();
