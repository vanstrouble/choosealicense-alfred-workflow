#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import https from 'https';

// Get current script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define path for the licenses file
const licensesFilePath = path.join(__dirname, 'licenses.json');

/**
 * Function to get all licenses from local JSON file
 * @return {Promise} Promise that resolves to an array of licenses
 */
function getLicenses() {
    return new Promise((resolve, reject) => {
        try {
            // Check if the licenses file exists
            if (!fs.existsSync(licensesFilePath)) {
                reject(new Error(`Licenses file not found at ${licensesFilePath}`));
                return;
            }

            // Read and parse the file
            const fileData = fs.readFileSync(licensesFilePath, 'utf8');
            const licensesData = JSON.parse(fileData);

            if (!licensesData.licenses || !Array.isArray(licensesData.licenses)) {
                reject(new Error('Invalid licenses file format'));
                return;
            }

            resolve(licensesData.licenses);
        } catch (error) {
            reject(new Error(`Failed to read licenses file: ${error.message}`));
        }
    });
}

/**
 * Get a specific license by its SPDX ID
 * @param {string} spdxId - The SPDX ID of the license to find
 * @return {Promise} Promise that resolves to the license object
 */
async function getLicenseById(spdxId) {
    const licenses = await getLicenses();
    const license = licenses.find(lic => lic.spdx_id === spdxId);

    if (!license) {
        throw new Error(`License with SPDX ID "${spdxId}" not found`);
    }

    return license;
}

/**
 * Fetch license details from GitHub API
 * @param {string} spdxId - The SPDX ID of the license
 * @returns {Promise} Promise that resolves to license details
 */
function fetchLicenseFromGitHub(spdxId) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "api.github.com",
            path: `/licenses/${spdxId}`,
            method: "GET",
            headers: {
                "User-Agent": "Choose-License-Alfred-Workflow",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        };

        const req = https.request(options, (res) => {
            let data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                try {
                    if (res.statusCode !== 200) {
                        reject(new Error(`GitHub API returned status ${res.statusCode}: ${data}`));
                        return;
                    }

                    const licenseData = JSON.parse(data);
                    resolve(licenseData);
                } catch (error) {
                    reject(new Error(`Error parsing GitHub API response: ${error.message}`));
                }
            });
        });

        req.on("error", (error) => {
            reject(new Error(`Error fetching license from GitHub: ${error.message}`));
        });

        req.end();
    });
}

/**
 * Format license text for Alfred's Large Type or Copy to Clipboard features
 * @param {Object} license - The license object containing text to format
 * @returns {Object} Alfred text object for JSON response
 */
function formatLicenseText(license) {
    // Replace placeholders with current year and a default name
    let licenseText = license.body
        .replace(/\[year\]/g, new Date().getFullYear())
        .replace(/\[fullname\]/g, 'Your Name');

    // Create Alfred Text View JSON structure
    return {
        alfredworkflow: {
            variables: {
                license_text: licenseText,
                license_name: license.name,
                license_id: license.spdx_id
            },
            arg: licenseText,
            config: {
                title: `${license.name} (${license.spdx_id})`,
                text: licenseText
            }
        }
    };
}

/**
 * Main function that processes the license input
 */
async function run() {
    try {
        const input = process.argv[2] || '';

        // Check if we're viewing a specific license
        if (input.startsWith('view:')) {
            const spdxId = input.replace('view:', '');

            try {
                // Try to get from GitHub API first for most recent version
                const licenseData = await fetchLicenseFromGitHub(spdxId);
                console.log(JSON.stringify(formatLicenseText(licenseData)));
            } catch (apiError) {
                // If API fails, fallback to local data
                console.error(`GitHub API error: ${apiError.message}. Falling back to local data.`);
                const license = await getLicenseById(spdxId);
                console.log(JSON.stringify(formatLicenseText(license)));
            }
        } else {
            // If not viewing license text, return the plain SPDX ID
            console.log(input);
        }
    } catch (error) {
        console.error(error);
        const errorResponse = {
            alfredworkflow: {
                variables: {
                    error: error.message
                },
                arg: `Error: ${error.message}`,
                config: {
                    title: "Error processing license",
                    text: `An error occurred: ${error.message}`
                }
            }
        };
        console.log(JSON.stringify(errorResponse));
    }
}

// Run
run();
