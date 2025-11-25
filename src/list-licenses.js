ObjC.import("Foundation");
ObjC.import("stdlib");

const GITHUB_API_URL = "https://api.github.com/licenses";
const CACHE_EXPIRY = 86400; // 24 hours - licenses don't change frequently
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
 * Reads text file if exists
 * @param {string} filepath - File path
 * @param {Object} fileManager - NSFileManager instance
 * @returns {string|null} File content or null
 */
function readTextFile(filepath, fileManager) {
	if (!fileManager.fileExistsAtPath(filepath)) return null;

	const data = $.NSData.dataWithContentsOfFile(filepath);
	if (!data) return null;

	return $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)
		.js;
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
			if (!query) return true;
			const name = license.name.toLowerCase();
			const key = license.key.toLowerCase();
			return name.includes(queryLower) || key.includes(queryLower);
		})
		.map((license) => ({
			uid: license.key,
			title: license.name,
			subtitle: categorizeLicense(license.key, license.name),
			arg: license.key,
			autocomplete: license.name,
			valid: true,
			mods: {
				cmd: {
					subtitle: `View ${license.name} details on GitHub`,
					arg: license.html_url || license.url,
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

	// Setup cache
	const env = $.NSProcessInfo.processInfo.environment;
	const workflowCache = ObjC.unwrap(
		env.objectForKey("alfred_workflow_cache")
	);
	const cacheDir = workflowCache || "/tmp/alfred-choosealicense-cache";
	const fileManager = $.NSFileManager.defaultManager;

	fileManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
		$(cacheDir),
		true,
		$(),
		$()
	);

	const cacheFile = `${cacheDir}/cache.json`;
	const currentTime = Math.floor(Date.now() / 1000);

	// Read existing cache
	let cache = {};
	const cacheData = readTextFile(cacheFile, fileManager);
	if (cacheData) {
		try {
			cache = JSON.parse(cacheData);
		} catch (e) {
			cache = {};
		}
	}

	// Check cache validity
	let licenses = [];
	if (
		cache.licenses &&
		cache.timestamp &&
		currentTime - cache.timestamp < CACHE_EXPIRY
	) {
		licenses = cache.licenses;
	} else {
		// Fetch fresh data
		const freshLicenses = fetchLicenses();

		if (!freshLicenses || !Array.isArray(freshLicenses)) {
			// Try to use stale cache if available
			if (cache.licenses && Array.isArray(cache.licenses)) {
				licenses = cache.licenses;
			} else {
				return JSON.stringify({
					items: [
						{
							title: "Error fetching licenses",
							subtitle:
								"Could not connect to GitHub API. Please try again.",
							valid: false,
						},
					],
				});
			}
		} else {
			licenses = freshLicenses;

			// Update cache
			cache = {
				licenses: licenses,
				timestamp: currentTime,
			};
			writeTextFile(cacheFile, JSON.stringify(cache));
		}
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
