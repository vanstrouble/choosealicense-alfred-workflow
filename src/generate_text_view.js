ObjC.import("Foundation");
ObjC.import("stdlib");

// Cache configuration - initialized once globally
const ENV = $.NSProcessInfo.processInfo.environment;
const WORKFLOW_CACHE = ObjC.unwrap(ENV.objectForKey("alfred_workflow_cache"));
const CACHE_DIR = WORKFLOW_CACHE || "/tmp/alfred-choosealicense-cache";
const FILE_MANAGER = $.NSFileManager.defaultManager;
const CACHE_FILE = `${CACHE_DIR}/used-licenses.json`;

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
 * Gets a license from cache (without API fallback)
 * @param {string} licenseKey - License key to retrieve
 * @param {string} cacheFile - Cache file path
 * @returns {Object|null} License object or null
 */
function getLicense(licenseKey, cacheFile) {
    const cache = readCache(cacheFile) || [];
    return cache.find(license => license.key === licenseKey) || null;
}

/**
 * Capitalizes each word in a string
 * @param {string} text - Text with hyphens
 * @returns {string} Capitalized text
 */
function capitalizeWords(text) {
    return text
        .replace(/-/g, " ")
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

/**
 * Formats array items as bullet list with each word capitalized
 * @param {string[]} items - Array of items
 * @returns {string} Formatted bullet list
 */
function formatList(items) {
    if (!items || items.length === 0) return "";

    // Pre-allocate array for better performance
    const formatted = new Array(items.length);

    for (let i = 0; i < items.length; i++) {
        formatted[i] = `- ${capitalizeWords(items[i])}`;
    }

    return formatted.join("\n");
}

/**
 * Generates Markdown from license data
 * @param {Object} license - License object from cache
 * @param {string} body - Processed license body text
 * @returns {string} Markdown formatted string
 */
function generateMarkdown(license, body) {
    const sections = [];

    // Title
    sections.push(`# ${license.name}\n`);

    // Description
    if (license.description) {
        sections.push(`**Description**\n\n${license.description}\n`);
    }

    // Permissions
    if (license.permissions?.length > 0) {
        sections.push(`🟢 **Permissions**\n\n${formatList(license.permissions)}\n`);
    }

    // Conditions
    if (license.conditions?.length > 0) {
        sections.push(`🔵 **Conditions**\n\n${formatList(license.conditions)}\n`);
    }

    // Limitations
    if (license.limitations?.length > 0) {
        sections.push(`🔴 **Limitations**\n\n${formatList(license.limitations)}\n`);
    }

    // License body
    sections.push(`**License Text**\n\n\`\`\`\n${body}\n\`\`\`\n`);

    // Footer
    if (license.html_url) {
        sections.push(`---\n\n[View on ChooseALicense.com](${license.html_url})`);
    }

    return sections.join("\n");
}

/**
 * Main entry point for Alfred Run Script
 * @param {string[]} argv - Command line arguments (processed license body)
 * @returns {string} Markdown formatted output
 */
function run(argv) {
    const body = argv[0] || "";

    if (!body) {
        return "# Error\n\nNo license body provided.";
    }

    // Get license key from Alfred variable
    const licenseKey = ObjC.unwrap(ENV.objectForKey("key_license"));

    if (!licenseKey) {
        return "# Error\n\nNo license key found in workflow variables.";
    }

    // Get license from cache
    const license = getLicense(licenseKey, CACHE_FILE);

    if (!license) {
        return `# Error\n\nLicense "${licenseKey}" not found in cache.`;
    }

    // Generate markdown
    const markdown = generateMarkdown(license, body);

    return markdown;
}
