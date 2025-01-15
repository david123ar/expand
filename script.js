const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const port = 5000;

// Extract the data and structure it
async function extractData(episodeId, category) {
  const baseUrl = "https://hianime.pw/videos/index.php";
  const url = `${baseUrl}?episodeId=${encodeURIComponent(episodeId)}&category=${encodeURIComponent(category)}&autoPlay=1&an=1`;

  try {
    // Fetch the HTML using Axios
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    const html = response.data; // HTML content of the page

    // Load HTML into Cheerio
    const $ = cheerio.load(html);

    // Find the script tag that contains the intro and outro timings and other details
    const scriptTags = $("script").toArray();

    let introStart, introEnd, outroStart, outroEnd;
    let videoUrl, subtitleUrl;

    for (let scriptTag of scriptTags) {
      const scriptContent = $(scriptTag).html();

      // Look for the pattern where intro and outro timings are defined
      if (scriptContent && scriptContent.includes("introStart")) {
        // Extract timings for intro and outro
        const introStartMatch = scriptContent.match(/introStart\s*=\s*(\d+);/);
        const introEndMatch = scriptContent.match(/introEnd\s*=\s*(\d+);/);
        const outroStartMatch = scriptContent.match(/outroStart\s*=\s*(\d+);/);
        const outroEndMatch = scriptContent.match(/outroEnd\s*=\s*(\d+);/);

        if (
          introStartMatch &&
          introEndMatch &&
          outroStartMatch &&
          outroEndMatch
        ) {
          introStart = parseInt(introStartMatch[1], 10);
          introEnd = parseInt(introEndMatch[1], 10);
          outroStart = parseInt(outroStartMatch[1], 10);
          outroEnd = parseInt(outroEndMatch[1], 10);
        }
      }

      if (scriptContent && scriptContent.includes("jwplayer")) {
        const match = scriptContent.match(
          /jwplayer\('.*?'\)\.setup\((\{.*?\})\)/s
        );
        if (match && match[1]) {
          let rawConfig = match[1];

          // Sanitize the extracted content
          const sanitizedConfig = rawConfig
            .replace(/'/g, '"') // Convert single quotes to double quotes
            .replace(/,\s*}/g, "}") // Remove trailing commas before }
            .replace(/,\s*]/g, "]") // Remove trailing commas before ]
            .replace(/savedVolume/g, "50"); 

          try {
            const configObject = eval("(" + sanitizedConfig + ")");
            videoUrl = configObject.file;
            subtitleUrl = configObject.tracks;
          } catch (evalError) {
            console.error(
              "Error evaluating the configuration:",
              evalError.message
            );
          }

          break;
        }
      }
    }

    const result = {
      type: category,
      link: {
        file: videoUrl,
        type: "hls",
      },
      tracks: subtitleUrl,
      intro: {
        start: introStart,
        end: introEnd,
      },
      outro: {
        start: outroStart,
        end: outroEnd,
      },
    };
    const streamingLink = result

    return streamingLink;
  } catch (error) {
    console.error("Error fetching the page:", error.message);
    throw new Error("Failed to fetch data");
  }
}

// Define the API endpoint
app.get("/api/data", async (req, res) => {
  const { episodeId, category } = req.query;

  if (!episodeId || !category) {
    return res
      .status(400)
      .json({ error: "Please provide both episodeId and category" });
  }

  try {
    const data = await extractData(episodeId, category);
    res.json(data); // Send the JSON response
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Default root route
app.get("/", (req, res) => {
  res.send("Welcome to the API! Access data at /api/data");
});

// Start the server on port 5000
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
