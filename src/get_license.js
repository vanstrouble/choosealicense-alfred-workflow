#!/usr/bin/env node

import { request } from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define path for the licenses file
const licensesFilePath = path.join(__dirname, 'licenses.json');

/**
 * Fetch license data from GitHub API
 * @param {string} endpoint - API endpoint path (e.g., '/licenses' or '/licenses/mit')
 * @returns {Promise<Object>} The parsed JSON response
 */
function fetchFromGitHub(endpoint) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: endpoint,
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
                    const response = JSON.parse(data);

                    // Check for API error responses
                    if (response.message && response.documentation_url) {
                        reject(new Error(`GitHub API: ${response.message}`));
                        return;
                    }

                    resolve(response);
                } catch (error) {
                    reject(new Error(`Failed to parse response: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Request failed: ${error.message}`));
        });

        req.end();
    });
}

/**
 * Main function to update the licenses file
 */
async function updateLicenses() {
    try {
        console.log('Checking for license updates...');

        // Check if the licenses file exists
        let existingLicenses = null;
        let shouldUpdate = true;

        if (fs.existsSync(licensesFilePath)) {
            try {
                existingLicenses = JSON.parse(fs.readFileSync(licensesFilePath, 'utf8'));
                console.log(`Found existing licenses file last updated on ${existingLicenses.last_updated}`);
                shouldUpdate = false; // Initially assume no update needed unless we find changes
            } catch (err) {
                console.log('Existing licenses file is corrupted, will create a new one.');
                shouldUpdate = true;
            }
        } else {
            console.log('No existing licenses file found, will create a new one.');
        }

        // Fetch licenses list first to check for changes
        console.log('Fetching licenses from GitHub API...');
        const licensesList = await fetchFromGitHub('/licenses');
        console.log(`Found ${licensesList.length} licenses`);

        // If we have existing licenses, check if the count or any spdx_ids have changed
        if (existingLicenses) {
            // Check if count changed
            if (existingLicenses.count !== licensesList.length) {
                console.log(`License count changed: ${existingLicenses.count} -> ${licensesList.length}`);
                shouldUpdate = true;
            } else {
                // Check if any licenses changed by comparing spdx_ids
                const existingSpdxIds = new Set(existingLicenses.licenses.map(l => l.spdx_id));
                const newSpdxIds = new Set(licensesList.map(l => l.spdx_id));

                // Check for additions or removals
                for (const id of newSpdxIds) {
                    if (!existingSpdxIds.has(id)) {
                        console.log(`New license found: ${id}`);
                        shouldUpdate = true;
                        break;
                    }
                }

                if (!shouldUpdate) {
                    for (const id of existingSpdxIds) {
                        if (!newSpdxIds.has(id)) {
                            console.log(`License removed: ${id}`);
                            shouldUpdate = true;
                            break;
                        }
                    }
                }

                // If no basic changes found, check for detailed changes in a sample license
                if (!shouldUpdate && licensesList.length > 0) {
                    // Check a random license for detailed changes
                    const sampleLicense = licensesList[0];
                    const sampleDetails = await fetchFromGitHub(`/licenses/${sampleLicense.spdx_id}`);
                    const existingSample = existingLicenses.licenses.find(l => l.spdx_id === sampleLicense.spdx_id);

                    if (existingSample) {
                        // Check if description changed
                        if (existingSample.description !== sampleDetails.description) {
                            console.log(`License details changed for ${sampleLicense.spdx_id}`);
                            shouldUpdate = true;
                        }
                    }
                }
            }
        }

        // If no updates needed, exit early
        if (!shouldUpdate) {
            console.log('No changes detected in licenses. Using existing data.');
            return;
        }

        // Continue with fetching detailed information if update is needed
        console.log('Fetching detailed information for each license...');
        const licensesDetails = await Promise.all(
            licensesList.map(async license => {
                const details = await fetchFromGitHub(`/licenses/${license.spdx_id}`);
                console.log(`✓ Fetched ${license.spdx_id}`);
                return {
                    key: license.key,
                    spdx_id: license.spdx_id,
                    name: license.name,
                    description: details.description,
                    permissions: details.permissions,
                    conditions: details.conditions,
                    limitations: details.limitations,
                    body: details.body
                };
            })
        );

        // Create the final data structure with metadata
        const licensesData = {
            last_updated: new Date().toISOString(),
            count: licensesDetails.length,
            licenses: licensesDetails
        };

        // Write to file
        fs.writeFileSync(
            licensesFilePath,
            JSON.stringify(licensesData, null, 2),
            'utf8'
        );

        console.log(`\nLicenses successfully updated and saved to ${licensesFilePath}`);
        console.log(`Last updated: ${licensesData.last_updated}`);
        console.log(`Total licenses: ${licensesData.count}`);
    } catch (error) {
        console.error('Error updating licenses:', error.message);
        process.exit(1);
    }
}

// Run the update
updateLicenses();
