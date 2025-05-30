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

const LICENSE_CATEGORIES = {
	"AGPL-3.0": "Strongest Copyleft License",
	"GPL-3.0": "Strong Copyleft License",
	"GPL-2.0": "Strong Copyleft License",
	"LGPL-2.1": "Weak Copyleft License",
	"MPL-2.0": "Weak Copyleft License",
	"Apache-2.0": "Permissive License",
	MIT: "Short and Simple Permissive License",
	"BSD-2-Clause": "Simple Permissive License",
	"BSD-3-Clause": "Permissive License",
	"BSL-1.0": "Permissive License",
	"EPL-2.0": "Permissive License",
	"CC0-1.0": "No Conditions Whatsoever",
	Unlicense: "No Conditions Whatsoever",
};

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
 * Creates the response object for Alfred to list licenses
 * @param {Array} licenses - Array of filtered licenses
 * @returns {Object} Alfred response object
 */
function createAlfredResponse(licenses) {
	return {
		items: licenses.map((license) => {
			const spdxId = license.spdx_id;

			return {
				title: `${license.name} (${spdxId})`,
				subtitle: LICENSE_CATEGORIES[spdxId] || "Software License",
				arg: spdxId,
				variables: {
					key_license: spdxId,
				},
				icon: { path: "icon.png" },
				mods: {
					cmd: {
						subtitle: "⌘: View full license text",
						arg: `view:${spdxId}`,
						variables: {
							key_license: spdxId, // Mantiene el valor puro sin 'view:'
						},
					},
				},
			};
		}),
	};
}

/**
 * Main function that processes Alfred's input
 */
async function run() {
	try {
		const input = process.argv[2] || "";
		const query = input.toLowerCase();
		const licenses = await getLicenses();
		const filtered = licenses.filter(
			(license) =>
				license.name.toLowerCase().includes(query) ||
				license.spdx_id.toLowerCase().includes(query)
		);

		console.log(JSON.stringify(createAlfredResponse(filtered)));
	} catch (error) {
		console.error(error);
	}
}

// Run
run();
