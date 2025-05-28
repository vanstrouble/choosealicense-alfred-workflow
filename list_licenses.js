#!/usr/bin/env node

import { request } from 'https';

const LICENSE_CATEGORIES = {
    'AGPL-3.0': 'Strongest Copyleft License',
    'GPL-3.0': 'Strong Copyleft License',
    'GPL-2.0': 'Strong Copyleft License',
    'LGPL-2.1': 'Weak Copyleft License',
    'MPL-2.0': 'Weak Copyleft License',
    'Apache-2.0': 'Permissive License',
    'MIT': 'Short and Simple Permissive License',
    'BSD-2-Clause': 'Simple Permissive License',
    'BSD-3-Clause': 'Permissive License',
    'BSL-1.0': 'Permissive License',
    'EPL-2.0': 'Permissive License',
    'CC0-1.0': 'No Conditions Whatsoever',
    'Unlicense': 'No Conditions Whatsoever'
};

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
            title: `${license.name} (${license.spdx_id})`,
            subtitle: LICENSE_CATEGORIES[license.spdx_id],
            arg: license.spdx_id,
            icon: { path: "icon.png" },
            mods: {
                alt: {
                    subtitle: "⌥: View full license text",
                    arg: `view:${license.spdx_id}`
                },
                cmd: {
                    subtitle: "⌘: Copy license to clipboard",
                    arg: `copy:${license.spdx_id}`
                }
            }
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
