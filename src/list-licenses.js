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
 * Checks if cache file exists and is fresh
 * @param {string} cacheFile - Cache file path
 * @param {Object} fileManager - NSFileManager instance
 * @returns {boolean} True if cache is fresh
 */
function isCacheFresh(cacheFile, fileManager) {
    if (!fileManager.fileExistsAtPath(cacheFile)) return false;

    const attrs = fileManager.attributesOfItemAtPathError(cacheFile, $());
    const modDate = attrs.objectForKey($.NSFileModificationDate);
    const now = $.NSDate.date;

    return now.timeIntervalSinceDate(modDate) < CACHE_EXPIRY;
}

/**
 * Reads and parses JSON from cache file
 * @param {string} cacheFile - Cache file path
 * @returns {Object[]|null} Parsed licenses or null
 */
function readCache(cacheFile) {
    try {
        const data = $.NSData.dataWithContentsOfFile(cacheFile);
        if (!data) return null;

        const jsonString = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
        const licenses = JSON.parse(jsonString);

        return Array.isArray(licenses) ? licenses : null;
    } catch (e) {
        return null;
    }
}

/**
 * Writes licenses to cache file
 * @param {string} cacheFile - Cache file path
 * @param {Object[]} licenses - Licenses to cache
 */
function writeCache(cacheFile, licenses) {
    try {
        const jsonString = JSON.stringify(licenses);
        const nsString = $.NSString.stringWithString(jsonString);
        nsString.writeToFileAtomicallyEncodingError(
            cacheFile,
            true,
            $.NSUTF8StringEncoding,
            $()
        );
    } catch (e) {
        // Fail silently on cache write errors
    }
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
            `curl -s --max-time ${CURL_TIMEOUT} -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "${GITHUB_API_URL}"`,
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
 * Gets licenses from cache or API
 * @param {string} cacheFile - Cache file path
 * @param {Object} fileManager - NSFileManager instance
 * @returns {Object[]|null} Array of license objects or null
 */
function getLicenses(cacheFile, fileManager) {
    // Try cache first if it's fresh
    if (isCacheFresh(cacheFile, fileManager)) {
        const cachedLicenses = readCache(cacheFile);
        if (cachedLicenses) return cachedLicenses;
    }

    // Fetch fresh data from API
    const licenses = fetchLicenses();

    // Cache the fresh data if successful
    if (licenses && Array.isArray(licenses)) {
        writeCache(cacheFile, licenses);
    }

    return licenses;
}

/**
 * Converts licenses into Alfred-compatible JSON items
 * @param {Object[]} licenses - Array of license objects
 * @returns {Object[]} Array of Alfred item objects
 */
function makeItems(licenses) {
    return licenses.map((license) => ({
        uid: license.key,
        title: license.name,
        subtitle: categorizeLicense(license.key, license.name),
        arg: license.key,
        autocomplete: license.name,
        valid: true,
        match: `${license.name} ${license.key} ${license.spdx_id}`, // For Alfred's fuzzy matching
        quicklookurl: `https://choosealicense.com/licenses/${license.key}/`,
        mods: {
            cmd: {
                subtitle: `Paste ${license.spdx_id} on frontmost app`,
                arg: license.key,
            },
            alt: {
                subtitle: `View ${license.spdx_id} on Text Viewer`,
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
    // Get cache directory and file path
    const env = $.NSProcessInfo.processInfo.environment;
    const workflowCache = ObjC.unwrap(env.objectForKey("alfred_workflow_cache"));
    const cacheDir = workflowCache || "/tmp/alfred-choosealicense-cache";
    const fileManager = $.NSFileManager.defaultManager;
    const cacheFile = `${cacheDir}/licenses.json`;

    // Create cache directory if it doesn't exist
    fileManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
        $(cacheDir),
        true,
        $(),
        $()
    );

    // Get licenses from cache or API
    const licenses = getLicenses(cacheFile, fileManager);

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

    // Convert to Alfred items (no filtering - let Alfred handle it)
    const items = makeItems(licenses);

    return JSON.stringify({ items });
}
