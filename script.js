const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

// Removes hidden tags
function cleanTags(tags) {
  return (tags || []).filter(
    tag => !tag.startsWith("_") && !tag.startsWith("crom:")
  );
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

async function loadCachedArticles() {
  try {
    const response = await fetch(`data/articles.json?cacheBust=${Date.now()}`);
    if (!response.ok) throw new Error("Could not load cached articles.");

    const data = await response.json();

    resultsEl.innerHTML = "";
    data.articles.forEach(article => {
      resultsEl.appendChild(renderCard(article));
    });

    const updated = new Date(data.updatedAt).toLocaleString();
    statusEl.textContent = `Updated: ${updated}`;
  } catch (error) {
    console.error(error);
    statusEl.textContent = error.message;
  }
}

loadCachedArticles();
