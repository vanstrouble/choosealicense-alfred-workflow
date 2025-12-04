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
 * Formats array items as bullet list
 * @param {string[]} items - Array of items
 * @returns {string} Formatted bullet list
 */
function formatList(items) {
    if (!items || items.length === 0) return "";
    return items.map(item => `- ${item.replace(/-/g, " ")}`).join("\n");
}

/**
 * Generates Markdown from license data
 * @param {Object} license - License object from cache
 * @param {string} body - Processed license body text
 * @returns {string} Markdown formatted string
 */
function generateMarkdown(license, body) {
    let markdown = `# ${license.name}\n\n`;

    // SPDX ID
    if (license.spdx_id) {
        markdown += `**SPDX ID:** \`${license.spdx_id}\`\n\n`;
    }

    // Description
    if (license.description) {
        markdown += `## 📝 Description\n\n${license.description}\n\n`;
    }

    // Permissions
    if (license.permissions && license.permissions.length > 0) {
        markdown += `## ✅ Permissions\n\n`;
        markdown += formatList(license.permissions);
        markdown += `\n\n`;
    }

    // Conditions
    if (license.conditions && license.conditions.length > 0) {
        markdown += `## ⚠️ Conditions\n\n`;
        markdown += formatList(license.conditions);
        markdown += `\n\n`;
    }

    // Limitations
    if (license.limitations && license.limitations.length > 0) {
        markdown += `## 🚫 Limitations\n\n`;
        markdown += formatList(license.limitations);
        markdown += `\n\n`;
    }

    // Implementation notes
    if (license.implementation) {
        markdown += `## 💡 Implementation\n\n${license.implementation}\n\n`;
    }

    // License body
    markdown += `## 📄 License Text\n\n`;
    markdown += "```\n";
    markdown += body;
    markdown += "\n```\n\n";

    // Footer with links
    markdown += `---\n\n`;
    if (license.html_url) {
        markdown += `[View on ChooseALicense.com](${license.html_url})`;
    }
    if (license.url) {
        markdown += ` | [API Reference](${license.url})`;
    }

    return markdown;
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
