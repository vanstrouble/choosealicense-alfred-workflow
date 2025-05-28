import https from "https";

// Options for the HTTP request
const options = {
  hostname: "api.github.com",
  path: "/licenses",
  method: "GET",
  headers: {
    "User-Agent": "Choose-License-Alfred-Workflow",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
};

// Make the request
const req = https.request(options, (res) => {
  let data = "";

  // Collect the data
  res.on("data", (chunk) => {
    data += chunk;
  });

  // Process the data when the response ends
  res.on("end", () => {
    try {
      const licenses = JSON.parse(data);
      console.log("Available licenses:");
      licenses.forEach((license) => {
        console.log(
          `- ${license.name} (${license.spdx_id}): ${license.url}`
        );
      });
    } catch (error) {
      console.error("Error parsing data:", error.message);
      console.log("Raw response:", data);
    }
  });
});

// Handle request errors
req.on("error", (error) => {
  console.error("Error making the request:", error.message);
});

// End the request
req.end();
