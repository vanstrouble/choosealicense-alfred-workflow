ObjC.import("Foundation");
ObjC.import("stdlib");

const GITHUB_API_URL = "https://api.github.com/licenses";
const CURL_TIMEOUT = 5;
const CACHE_EXPIRY = 86400; // 24 hours in seconds

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
 * Reads text file if exists
 * @param {string} filepath - File path
 * @param {Object} fileManager - NSFileManager instance
 * @returns {string|null} File content or null
 */
function readTextFile(filepath, fileManager) {
	if (!fileManager.fileExistsAtPath(filepath)) return null;

	const data = $.NSData.dataWithContentsOfFile(filepath);
	if (!data) return null;

	return $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
}

/**
 * Writes text file
 * @param {string} filepath - File path
 * @param {string} content - Content to write
 */
function writeTextFile(filepath, content) {
	const nsString = $.NSString.stringWithString(content);
	nsString.writeToFileAtomicallyEncodingError(
		filepath,
		true,
		$.NSUTF8StringEncoding,
		$()
	);
}

/**
 * Gets cached licenses or fetches from API if expired
 * @param {string} cacheDir - Cache directory path
 * @param {Object} fileManager - NSFileManager instance
 * @returns {Object[]|null} Array of license objects or null
 */
function getCachedLicenses(cacheDir, fileManager) {
	const cacheFile = `${cacheDir}/licenses.json`;

	// Try to read cache
	const cacheData = readTextFile(cacheFile, fileManager);
	if (cacheData) {
		try {
			const licenses = JSON.parse(cacheData);

			// Return cached licenses if valid array
			if (Array.isArray(licenses) && licenses.length > 0) {
				return licenses;
			}
		} catch (e) {
			// Invalid cache, will fetch fresh data
		}
	}

	// Cache doesn't exist or is invalid, fetch fresh data
	const licenses = fetchLicenses();

	if (licenses && Array.isArray(licenses)) {
		// Save to cache directly as JSON array
		writeTextFile(cacheFile, JSON.stringify(licenses));
	}

	return licenses;
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

    // Get cache directory
    const env = $.NSProcessInfo.processInfo.environment;
    const workflowCache = ObjC.unwrap(env.objectForKey("alfred_workflow_cache"));
    const cacheDir = workflowCache || "/tmp/alfred-choosealicense-cache";
    const fileManager = $.NSFileManager.defaultManager;

    // Create cache directory if it doesn't exist
    fileManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
        $(cacheDir),
        true,
        $(),
        $()
    );

    // Get licenses from cache or API
    const licenses = getCachedLicenses(cacheDir, fileManager);

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
