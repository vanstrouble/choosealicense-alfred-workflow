ObjC.import("Foundation");
ObjC.import("stdlib");

const GITHUB_LICENSE_API_URL = "https://api.github.com/licenses";
const CURL_TIMEOUT = 5;

/**
 * Reads and parses JSON from cache file
 * @param {string} cacheFile - Cache file path
 * @returns {Object|null} Parsed cache object or null
 */
function readCache(cacheFile) {
    try {
        const data = $.NSData.dataWithContentsOfFile(cacheFile);
        if (!data) return null;

        const jsonString = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
        return JSON.parse(jsonString);
    } catch (e) {
        return null;
    }
}

/**
 * Writes cache object to file
 * @param {string} cacheFile - Cache file path
 * @param {Object} cacheData - Cache data to write
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
 * @returns {Object|null} License object or null
 */
function getLicense(licenseKey, cacheFile) {
    // Read existing cache
    let cache = readCache(cacheFile) || {};

    // Check if license is already cached
    if (cache[licenseKey]) {
        return cache[licenseKey];
    }

    // Fetch from API
    const license = fetchLicense(licenseKey);

    if (license && license.key) {
        // Add to cache
        cache[licenseKey] = license;
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

    // Get cache directory and file path
    const env = $.NSProcessInfo.processInfo.environment;
    const workflowCache = ObjC.unwrap(env.objectForKey("alfred_workflow_cache"));
    const cacheDir = workflowCache || "/tmp/alfred-choosealicense-cache";
    const fileManager = $.NSFileManager.defaultManager;
    const cacheFile = `${cacheDir}/used-licenses.json`;

    // Create cache directory if it doesn't exist
    fileManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
        $(cacheDir),
        true,
        $(),
        $()
    );

    // Get license from cache or API
    const license = getLicense(licenseKey, cacheFile);

    if (!license) {
        return JSON.stringify({
            error: `Failed to fetch license: ${licenseKey}`,
        });
    }

    return JSON.stringify(license);
}
