#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Get current script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define path for the licenses file
const licensesFilePath = path.join(__dirname, "licenses.json");

/**
 * Function to get all licenses from local JSON file
 * @return {Promise} Promise that resolves to an array of licenses
 */
function getLicenses() {
    return new Promise((resolve, reject) => {
        try {
            // Check if the licenses file exists
            if (!fs.existsSync(licensesFilePath)) {
                reject(
                    new Error(`Licenses file not found at ${licensesFilePath}`)
                );
                return;
            }

            // Read and parse the file
            const fileData = fs.readFileSync(licensesFilePath, "utf8");
            const licensesData = JSON.parse(fileData);

            if (
                !licensesData.licenses ||
                !Array.isArray(licensesData.licenses)
            ) {
                reject(new Error("Invalid licenses file format"));
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
    const license = licenses.find((lic) => lic.spdx_id === spdxId);

    if (!license) {
        throw new Error(`License with SPDX ID "${spdxId}" not found`);
    }

    return license;
}

/**
 * Get license body/content for copying to clipboard
 * @param {Object} license - The license object
 * @returns {string} The license body text ready for copying
 */
function getLicenseBody(license) {
    return license.body || "License content not available";
}

/**
 * Extract license body from formatted license text
 * @param {string} formattedText - The formatted license text from Alfred
 * @returns {string} The extracted license body
 */
function extractLicenseBodyFromText(formattedText) {
    // Look for the license body after the last "```" marker
    const codeBlockRegex = /```\s*\n([\s\S]*?)(?:```|$)/;
    const match = formattedText.match(codeBlockRegex);

    if (match && match[1]) {
        return match[1].trim();
    }

    // If no code block found, try to extract the license text including the title
    // Look for the actual license text that starts with the license name
    const licensePatterns = [
        /(MIT License[\s\S]*?)(?:\n\n\n|$)/i,
        /(Apache License[\s\S]*?)(?:\n\n\n|$)/i,
        /(GNU General Public License[\s\S]*?)(?:\n\n\n|$)/i,
        /(BSD.*License[\s\S]*?)(?:\n\n\n|$)/i,
        // Fallback: look for any license block that starts after the metadata
        /￼\s*\n([\s\S]*?)(?:\n\n\n|$)/
    ];

    for (const pattern of licensePatterns) {
        const match = formattedText.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }

    // If no pattern matches, return the original text
    return formattedText;
}

/**
 * Detect if input is a SPDX ID or formatted license text
 * @param {string} input - The input string
 * @returns {boolean} True if it's likely a SPDX ID, false if it's formatted text
 */
function isSpdxId(input) {
    // SPDX IDs are typically short, alphanumeric with dashes, and don't contain newlines
    return input.length < 50 && !input.includes('\n') && /^[a-zA-Z0-9\-\.+]+$/.test(input);
}

async function run() {
    try {
        const input = process.argv[2] || "";

        if (!input) {
            throw new Error("Input is required (SPDX ID or license text)");
        }

        let licenseBody;

        if (isSpdxId(input)) {
            // Input is a SPDX ID - get license from local data
            const license = await getLicenseById(input);
            licenseBody = getLicenseBody(license);
        } else {
            // Input is formatted license text - extract the body
            licenseBody = extractLicenseBodyFromText(input);
        }

        // Set the license body in Alfred's environment variable
        process.env.value_license = licenseBody;

        // Output the value_license for Alfred to process
        console.log(process.env.value_license);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Run
run();
