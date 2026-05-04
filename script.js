const CROM_ENDPOINT = "https://apiv1.crom.avn.sh/graphql";
const WIKI_URL = "http://scp-wiki.wikidot.com";

// Number of articles displayed
const TARGET_COUNT = 3;

// Max number of queries before throwing error
const MAX_ATTEMPTS = 80;

// Maximum rating to be displayed
const MAX_RATING = 25;

// Minimum age required to be displayed
const MIN_AGE_MONTHS = 6;

const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

// Crom API request
async function cromRequest(query) {
  const response = await fetch(CROM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const json = await response.json();

  if (!response.ok || json.errors) {
    throw new Error(json.errors?.[0]?.message || "Crom request failed.");
  }

  return json.data;
}

// Query skeleton
function buildRandomQuery() {
  return `
    query Random {
      randomPage(
        filter: {
          allTags: ["scp"]
          anyBaseUrl: ["${WIKI_URL}"]
        }
      ) {
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
      }
    }
  `;
}

function isOlderThanSixMonths(createdAt) {
  if (!createdAt) return false;

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) return false;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - MIN_AGE_MONTHS);

  return createdDate <= cutoff;
}

// Is older than MIN_AGE_MONTHS and has rating lower than MAX_RATING
function isEligible(page) {
  const info = page.wikidotInfo || {};
  const rating = Number(info.rating);

  return (
    Number.isFinite(rating) &&
    rating < MAX_RATING &&
    isOlderThanSixMonths(info.createdAt)
  );
}

// Removes hidden tags
function cleanTags(tags) {
  return (tags || []).filter(
    tag => !tag.startsWith("_") && !tag.startsWith("crom:")
  );
}

// Maps API data to variables
function mapPage(page) {
  return {
    url: page.url,
    title: page.wikidotInfo?.title || "Untitled",
    alternateTitle: page.alternateTitles?.[0]?.title || "",
    rating: page.wikidotInfo?.rating ?? "N/A",
    createdAt: page.wikidotInfo?.createdAt || "",
    tags: cleanTags(page.wikidotInfo?.tags),
    thumbnailUrl: page.wikidotInfo?.thumbnailUrl || "",
    authors:
      page.attributions
        ?.map(attr => attr.user?.name)
        .filter(Boolean) || [],
  };
}

function renderCard(article) {
  const card = document.createElement("article");
  card.className = "card";

  const createdDate = article.createdAt
    ? new Date(article.createdAt).toLocaleDateString()
    : "Unknown";

  card.innerHTML = `
    ${article.thumbnailUrl ? `<img src="${article.thumbnailUrl}" alt="">` : ""}
    <h2>
      <a href="${article.url}" target="_blank" rel="noopener noreferrer">
        ${article.title}
      </a>
    </h2>
    ${article.alternateTitle ? `<p class="alt">${article.alternateTitle}</p>` : ""}
    <p class="meta">Rating: ${article.rating}</p>
    ${article.authors.length ? `<p class="meta">Author: ${article.authors.join(", ")}</p>` : ""}
    <p class="tags">
      ${article.tags.map(tag => `<span>${tag}</span>`).join("")}
    </p>
  `;

  return card;
}

async function loadThreeEligible() {
  const found = new Map();
  let attempts = 0;

  resultsEl.innerHTML = "";

  while (found.size < TARGET_COUNT && attempts < MAX_ATTEMPTS) {
    attempts++;
    statusEl.textContent = `Searching... found ${found.size}/3 after ${attempts} attempts.`;

    const data = await cromRequest(buildRandomQuery());
    const page = data?.randomPage?.page;

    if (!page || found.has(page.url)) continue;
    if (!isEligible(page)) continue;

    found.set(page.url, page);

    resultsEl.innerHTML = "";
    [...found.values()].map(mapPage).forEach(article => {
      resultsEl.appendChild(renderCard(article));
    });
  }

  if (found.size < TARGET_COUNT) {
    statusEl.textContent = `Only found ${found.size}/3 matching articless after ${MAX_ATTEMPTS} attempts. Refresh to try again.`;
    return;
  }

  statusEl.textContent = "Query successful.";
}

loadThreeEligible();
