import fs from "node:fs/promises";

const CROM_ENDPOINT = "https://apiv1.crom.avn.sh/graphql";
const WIKI_URL = "http://scp-wiki.wikidot.com";

// Number of articles displayed
const TARGET_COUNT = 3;

// Articles pulled per query
const RANDOMS_PER_QUERY = 10;

// Max number of queries before throwing error
const MAX_ATTEMPTS = 30;

// Maximum rating to be displayed
const MAX_RATING = 25;

// Minimum age required to be displayed
const MIN_AGE_MONTHS = 6;

// Date of cutoff to be elligible
function cutoffDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - MIN_AGE_MONTHS);
  return date;
}

function isOldEnough(createdAt) {
  const created = new Date(createdAt);
  return !Number.isNaN(created.getTime()) && created <= cutoffDate();
}

// Is older than MIN_AGE_MONTHS and has rating lower than MAX_RATING
function isEligible(page) {
  const info = page?.wikidotInfo;
  const rating = Number(info?.rating);

  return (
    page?.url &&
    Number.isFinite(rating) &&
    rating < MAX_RATING &&
    isOldEnough(info?.createdAt)
  );
}

// Removes hidden tags
function cleanTags(tags = []) {
  return tags.filter(tag => !tag.startsWith("_") && !tag.startsWith("crom:"));
}

// page data
function pageFields() {
  return `
    page {
      url
      alternateTitles { title }
      wikidotInfo {
        title
        rating
        createdAt
        tags
        thumbnailUrl
      }
      attributions {
        user { name }
      }
    }
  `;
}

// Query skeleton
function buildQuery() {
  const randoms = Array.from({ length: RANDOMS_PER_QUERY }, (_, index) => {
    return `
      p${index}: randomPage(
        filter: {
          allTags: ["scp"]
          anyBaseUrl: ["${WIKI_URL}"]
        }
      ) {
        ${pageFields()}
      }
    `;
  }).join("\n");

  return `query RandomScpBatch { ${randoms} }`;
}

// Crom API query
async function cromRequest(query) {
  const response = await fetch(CROM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "RandTest GitHub Action"
    },
    body: JSON.stringify({ query }),
  });

  const text = await response.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("Crom returned non-JSON response:");
    console.error("Status:", response.status, response.statusText);
    console.error("Content-Type:", response.headers.get("content-type"));
    console.error(text.slice(0, 1000));

    throw new Error(
      `Crom returned non-JSON response: ${response.status} ${response.statusText}`
    );
  }

  if (!response.ok || json.errors) {
    console.error(JSON.stringify(json.errors || json, null, 2));
    throw new Error(json.errors?.[0]?.message || "Crom request failed.");
  }

  return json.data;
}

// Maps API data to variables
function mapPage(page) {
  return {
    url: page.url,
    title: page.wikidotInfo?.title || "Untitled",
    alternateTitle: page.alternateTitles?.[0]?.title || "",
    rating: page.wikidotInfo?.rating ?? null,
    createdAt: page.wikidotInfo?.createdAt || null,
    tags: cleanTags(page.wikidotInfo?.tags || []),
    thumbnailUrl: page.wikidotInfo?.thumbnailUrl || "",
    authors:
      page.attributions
        ?.map(attr => attr.user?.name)
        .filter(Boolean) || [],
  };
}

async function main() {
  const found = new Map();

  for (let queryCount = 1; queryCount <= MAX_ATTEMPTS; queryCount++) {
    const data = await cromRequest(buildQuery());

    for (const result of Object.values(data)) {
      const page = result?.page;
      if (!isEligible(page)) continue;
      if (found.has(page.url)) continue;

      found.set(page.url, mapPage(page));

      if (found.size >= TARGET_COUNT) break;
    }

    if (found.size >= TARGET_COUNT) break;
  }

  const output = {
    updatedAt: new Date().toISOString(),
    criteria: {
      tag: "scp",
      ratingBelow: MAX_RATING,
      olderThanMonths: MIN_AGE_MONTHS,
      count: TARGET_COUNT,
    },
    articles: [...found.values()],
  };

  // Writes to json
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/articles.json", JSON.stringify(output, null, 2));

  if (found.size < TARGET_COUNT) {
    throw new Error(`Only found ${found.size}/${TARGET_COUNT} matching articles.`);
  }
}

main();
