ObjC.import("Foundation");
ObjC.import("stdlib");

const GITHUB_LICENSE_API_URL = "https://api.github.com/licenses";
const CURL_TIMEOUT = 5;
const CACHE_EXPIRY = 31536000; // 1 year in seconds

// Cache configuration - initialized once globally
const ENV = $.NSProcessInfo.processInfo.environment;
const WORKFLOW_CACHE = ObjC.unwrap(ENV.objectForKey("alfred_workflow_cache"));
const CACHE_DIR = WORKFLOW_CACHE || "/tmp/alfred-choosealicense-cache";
const FILE_MANAGER = $.NSFileManager.defaultManager;
const CACHE_FILE = `${CACHE_DIR}/used-licenses.json`;

/**
 * Replaces author placeholder in license text based on license key
 * @param {string} author - Author name to insert
 * @param {string} key - License key (e.g., "mit", "apache-2.0")
 * @param {string} text - License text with placeholders
 * @returns {string} License text with author replaced
 */
function replaceAuthor(author, key, text) {
    // Use [fullname] as fallback if author is not provided
    const authorName = author || "[fullname]";

    switch (key) {
        case "agpl-3.0":
        case "gpl-2.0":
        case "gpl-3.0":
        case "lgpl-2.1":
            text = text.replace(/<name of author>/g, authorName);
            break;

        case "apache-2.0":
            text = text.replace(/\[name of copyright owner\]/g, authorName);
            break;

        case "bsd-2-clause":
        case "bsd-3-clause":
        case "mit":
        case "bsd-4-clause":
        case "isc":
            text = text.replace(/\[fullname\]/g, authorName);
            break;

        case "wtfpl":
            text = text.replace(/Sam Hocevar <sam@hocevar\.net>/g, authorName);
            break;

        case "bsl-1.0":
        case "cc0-1.0":
        case "epl-2.0":
        case "mpl-2.0":
        case "unlicense":
        case "cc-by-4.0":
        case "lgpl-3.0":
        default:
            break;
    }

    return text;
}

/**
 * Replaces year placeholder in license text based on license key
 * @param {string} year - Year to insert
 * @param {string} key - License key (e.g., "mit", "apache-2.0")
 * @param {string} text - License text with placeholders
 * @returns {string} License text with year replaced
 */
function replaceYear(year, key, text) {
    switch (key) {
        case "agpl-3.0":
        case "gpl-2.0":
        case "gpl-3.0":
        case "lgpl-2.1":
            text = text.replace(/<year>/g, year);
            break;

        case "apache-2.0":
            text = text.replace(/\[yyyy\]/g, year);
            break;

        case "bsd-2-clause":
        case "bsd-3-clause":
        case "mit":
        case "bsd-4-clause":
        case "isc":
            text = text.replace(/\[year\]/g, year);
            break;

        case "wtfpl": {
            // Replace second occurrence
            let count = 0;
            text = text.replace(/2004/g, (match) => (++count === 2 ? year : match));
            break;
        }

        case "bsl-1.0":
        case "cc0-1.0":
        case "epl-2.0":
        case "mpl-2.0":
        case "unlicense":
        case "cc-by-4.0":
        case "lgpl-3.0":
        default:
            break;
    }

    return text;
}

/**
 * Processes license text by replacing placeholders
 * @param {Object} license - License object from API
 * @param {string} author - Author name from Alfred variable
 * @returns {string} Processed license body text
 */
function processLicense(license, author) {
    if (!license || !license.body) return "";

    const currentYear = new Date().getFullYear().toString();
    let processedBody = license.body;

    // Replace author placeholder
    processedBody = replaceAuthor(author, license.key, processedBody);

    // Replace year placeholder
    processedBody = replaceYear(currentYear, license.key, processedBody);

    return processedBody;
}

/**
 * Checks if cache file exists and is fresh
 * @param {string} cacheFile - Cache file path
 * @param {Object} fileManager - NSFileManager instance
 * @returns {boolean} True if cache is fresh
 */
function isCacheFresh(cacheFile, fileManager) {
    if (!fileManager.fileExistsAtPath(cacheFile)) return false;

    try {
        const attrs = fileManager.attributesOfItemAtPathError(cacheFile, $());
        if (!attrs) return false;

        const modDate = attrs.objectForKey($.NSFileModificationDate);
        if (!modDate) return false;

        // Calculate expiry date once instead of time intervals
        const expiryDate = modDate.dateByAddingTimeInterval(CACHE_EXPIRY);
        const now = $.NSDate.date;

        // Simple comparison: is current time before expiry?
        return now.compare(expiryDate) === $.NSOrderedAscending;
    } catch (e) {
        // If we can't read file attributes, consider cache stale
        return false;
    }
}

/**
 * Reads and parses JSON from cache file
 * @param {string} cacheFile - Cache file path
 * @returns {Object[]|null} Parsed cache array or null
 */
function readCache(cacheFile) {
    try {
        const data = $.NSData.dataWithContentsOfFile(cacheFile);
        if (!data) return null;

        const jsonString = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
        const cache = JSON.parse(jsonString);

        return Array.isArray(cache) ? cache : null;
    } catch (e) {
        return null;
    }
}

/**
 * Writes cache array to file
 * @param {string} cacheFile - Cache file path
 * @param {Object[]} cacheData - Cache data array to write
 */
function writeCache(cacheFile, cacheData) {
    try {
        const jsonString = JSON.stringify(cacheData, null, 2);
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
 * Fetches a specific license from GitHub API
 * @param {string} licenseKey - License key (e.g., "mit", "apache-2.0")
 * @returns {Object|null} License object or null
 */
function fetchLicense(licenseKey) {
    try {
        const task = $.NSTask.alloc.init;
        task.setLaunchPath("/bin/sh");
        task.setArguments([
            "-c",
            `curl -s --max-time ${CURL_TIMEOUT} -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "${GITHUB_LICENSE_API_URL}/${licenseKey}"`,
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
 * Gets a license from cache or fetches from API
 * @param {string} licenseKey - License key to retrieve
 * @param {string} cacheFile - Cache file path
 * @param {Object} fileManager - NSFileManager instance
 * @returns {Object|null} License object or null
 */
function getLicense(licenseKey, cacheFile, fileManager) {
    // Check if cache is fresh
    if (isCacheFresh(cacheFile, fileManager)) {
        // Read cache and search for specific license
        const cache = readCache(cacheFile) || [];
        const cachedLicense = cache.find(license => license.key === licenseKey);
        if (cachedLicense) {
            return cachedLicense;
        }
    }

    // Cache not fresh, expired, or license not found
    // Fetch from API
    const license = fetchLicense(licenseKey);

    if (license && license.key) {
        // Read existing cache (even if stale, preserve other licenses)
        let cache = readCache(cacheFile) || [];

        // Remove old version if exists
        cache = cache.filter(l => l.key !== licenseKey);

        // Add fresh license
        cache.push(license);

        // Write updated cache
        writeCache(cacheFile, cache);

        return license;
    }

    return null;
}

/**
 * Main entry point
 * @param {string[]} argv - Command line arguments (license key)
 * @returns {string} JSON string with license data or error
 */
function run(argv) {
    const licenseKey = argv[0]?.trim();

    if (!licenseKey) {
        return JSON.stringify({
            error: "No license key provided",
        });
    }

    // Get author from Alfred workflow variable
    const author = ObjC.unwrap(ENV.objectForKey("author"));

    // Create cache directory if it doesn't exist
    FILE_MANAGER.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
        $(CACHE_DIR),
        true,
        $(),
        $()
    );

    // Get license from cache or API
    const license = getLicense(licenseKey, CACHE_FILE, FILE_MANAGER);

    if (!license) {
        return JSON.stringify({
            error: `Failed to fetch license: ${licenseKey}`,
        });
    }

    // Process license body with author and year
    const processedBody = processLicense(license, author);

    return processedBody;
}
