ObjC.import("Foundation");
ObjC.import("stdlib");

const GITHUB_API_URL = "https://api.github.com/licenses";
const CURL_TIMEOUT = 5;

/**
 * Categorizes a license based on keywords
 * @param {string} key - License SPDX ID
 * @param {string} name - License full name
 * @returns {string} Category description
 */
function categorizeLicense(key, name) {
    const nameLower = name.toLowerCase();
    const keyLower = key.toLowerCase();

    // Strongest copyleft
    if (keyLower.includes("agpl") || nameLower.includes("affero")) {
        return "Strongest Copyleft License";
    }

    // Strong copyleft
    if (keyLower.includes("gpl") && !keyLower.includes("lgpl")) {
        return "Strong Copyleft License";
    }

    // Weak copyleft
    if (
        keyLower.includes("lgpl") ||
        keyLower.includes("mpl") ||
        keyLower.includes("epl") ||
        nameLower.includes("lesser") ||
        nameLower.includes("mozilla")
    ) {
        return "Weak Copyleft License";
    }

    // Public domain / No conditions
    if (
        keyLower.includes("cc0") ||
        keyLower.includes("unlicense") ||
        nameLower.includes("public domain")
    ) {
        return "No Conditions Whatsoever";
    }

    // Permissive
    if (
        keyLower.includes("mit") ||
        keyLower.includes("bsd") ||
        keyLower.includes("apache") ||
        keyLower.includes("bsl") ||
        nameLower.includes("permissive")
    ) {
        return "Permissive License";
    }

    return "Open Source License";
}

/**
 * Fetches licenses from GitHub API using curl
 * @returns {Object[]|null} Array of license objects or null
 */
function fetchLicenses() {
	try {
		const task = $.NSTask.alloc.init;
		task.setLaunchPath("/bin/sh");
		task.setArguments([
			"-c",
			`/usr/bin/curl -s --max-time ${CURL_TIMEOUT} -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "${GITHUB_API_URL}"`,
		]);

		const pipe = $.NSPipe.pipe;
		task.setStandardOutput(pipe);
		task.setStandardError($.NSPipe.pipe);

		task.launch;
		task.waitUntilExit;

		const data = pipe.fileHandleForReading.readDataToEndOfFile;

		if (!data || data.length === 0) {
			return null;
		}

		const jsonString = $.NSString.alloc.initWithDataEncoding(
			data,
			$.NSUTF8StringEncoding
		).js;

		return JSON.parse(jsonString);
	} catch (e) {
		return null;
	}
}

/**
 * Converts licenses into Alfred-compatible JSON items
 * @param {Object[]} licenses - Array of license objects
 * @param {string} query - Search query for filtering
 * @returns {Object[]} Array of Alfred item objects
 */
function makeItems(licenses, query) {
	const queryLower = query.toLowerCase();

	return licenses
		.filter((license) => {
			if (!queryLower) return true;
			return (
				license.name.toLowerCase().includes(queryLower) ||
				license.key.toLowerCase().includes(queryLower)
			);
		})
		.map((license) => ({
			uid: license.key,
			title: license.name,
			subtitle: categorizeLicense(license.key, license.name),
			arg: license.key,
			autocomplete: license.name,
			valid: true,
			quicklookurl: `https://choosealicense.com/licenses/${license.key}/`,
			mods: {
				cmd: {
					subtitle: `Paste ${license.spdx_id} on frontmost app`,
					arg: license.key,
				},
				alt: {
					subtitle: `View ${license.spdx_id} on View Text`,
					arg: license.key,
				},
			},
		}));
}

/**
 * Main Alfred Script Filter entry point
 * @param {string[]} argv - Command line arguments (query)
 * @returns {string} JSON string for Alfred Script Filter
 */
function run(argv) {
    const query = argv[0]?.trim() || "";

    const licenses = fetchLicenses();

    if (!licenses || !Array.isArray(licenses)) {
        return JSON.stringify({
            items: [
                {
                    title: "Error fetching licenses",
                    subtitle: "Could not connect to GitHub API. Please try again.",
                    valid: false,
                },
            ],
        });
    }

    const items = makeItems(licenses, query);

    if (items.length === 0) {
        return JSON.stringify({
            items: [
                {
                    title: "No licenses found",
                    subtitle: `No results for "${query}"`,
                    valid: false,
                },
            ],
        });
    }

    return JSON.stringify({
        items: items,
    });
}
