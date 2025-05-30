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
 * Format license text for Alfred's Text View display
 * @param {Object} license - The license object containing text to format
 * @returns {string} Formatted license text ready for display
 */
function formatLicenseText(license) {
    // Create a rich formatted text with metadata
    return `
## ${license.name} (${license.spdx_id})

### Description
${license.description || "No description available"}

### Permissions
${license.permissions ? "✓ " + license.permissions.join("\n✓ ") : "None specified"}

### Conditions
${license.conditions ? "• " + license.conditions.join("\n• ") : "None specified"}

### Limitations
${license.limitations ? "⊗ " + license.limitations.join("\n⊗ ") : "None specified"}

---

\`\`\`
${license.body}
\`\`\`
`;
}

async function run() {
    try {
        const input = process.argv[2] || "";

        // Extract SPDX ID by removing "view:" prefix
        const spdxId = input.replace("view:", "");

        // Get license and display formatted text
        const license = await getLicenseById(spdxId);
        console.log(formatLicenseText(license));
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}
// Run
run();
