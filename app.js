import { getDocument, GlobalWorkerOptions } from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs";

const PDF_URL = "https://www.portlandeyeopener.com/AA-BigBook-4th-Edition.pdf";
const INDEX_CACHE_KEY = "bb-index-cache-v1";
const SOBRIETY_DATE_KEY = "sobriety-date";

const sobrietyForm = document.getElementById("sobriety-form");
const sobrietyDateInput = document.getElementById("sobriety-date");
const sobrietyOutput = document.getElementById("sobriety-output");
const searchInput = document.getElementById("search-input");
const suggestionsList = document.getElementById("suggestions");
const searchButton = document.getElementById("search-button");
const indexStatus = document.getElementById("index-status");
const resultsContainer = document.getElementById("results");
const detailCard = document.getElementById("detail-card");
const detailTitle = document.getElementById("detail-title");
const detailContent = document.getElementById("detail-content");
const backToResultsButton = document.getElementById("back-to-results");

let paragraphIndex = [];
let wordFrequency = new Map();
let lastResults = [];

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function loadSobrietyDate() {
  const saved = localStorage.getItem(SOBRIETY_DATE_KEY);
  if (!saved) {
    return;
  }

  sobrietyDateInput.value = saved;
  renderSobrietyDuration(saved);
}

function renderSobrietyDuration(dateString) {
  const start = new Date(`${dateString}T00:00:00`);
  const now = new Date();

  if (Number.isNaN(start.getTime()) || start > now) {
    sobrietyOutput.textContent = "Please choose a valid sobriety date in the past.";
    return;
  }

  const diffMs = now - start;
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(totalDays / 365.25);
  const months = Math.floor((totalDays % 365.25) / 30.44);
  const days = Math.floor(totalDays - years * 365.25 - months * 30.44);

  sobrietyOutput.textContent = `You've been sober for ${years} year(s), ${months} month(s), and ${days} day(s). (${totalDays} total days)`;
}

function parseParagraphs(text) {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  return normalized
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 45);
}

function buildWordFrequency(paragraphs) {
  const frequency = new Map();

  for (const paragraph of paragraphs) {
    const words = paragraph
      .toLowerCase()
      .match(/[a-z][a-z'’-]{1,}/g);

    if (!words) {
      continue;
    }

    for (const word of words) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }
  }

  return frequency;
}

async function extractPdfText() {
  indexStatus.textContent = "Downloading and indexing Big Book text…";

  const loadingTask = getDocument(PDF_URL);
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item) => item.str).join(" ");
    pages.push(text);
    indexStatus.textContent = `Indexing page ${pageNumber}/${pdf.numPages}…`;
  }

  const allText = pages.join("\n\n");
  const paragraphs = parseParagraphs(allText).map((paragraph, index) => ({
    id: index,
    paragraph,
    normalized: normalizeText(paragraph)
  }));

  return paragraphs;
}

function saveCache(paragraphs) {
  localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(paragraphs));
}

function loadCache() {
  const raw = localStorage.getItem(INDEX_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setSuggestions(query) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery || normalizedQuery.length < 2) {
    suggestionsList.classList.remove("show");
    suggestionsList.innerHTML = "";
    return;
  }

  const candidates = [...wordFrequency.entries()]
    .filter(([word]) => word.includes(normalizedQuery))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);

  if (candidates.length === 0) {
    suggestionsList.classList.remove("show");
    suggestionsList.innerHTML = "";
    return;
  }

  suggestionsList.innerHTML = candidates
    .map(
      (word) =>
        `<li><button type="button" class="suggestion-btn" data-word="${word}">${word}</button></li>`
    )
    .join("");
  suggestionsList.classList.add("show");
}

function renderResults(matches, query) {
  if (!query) {
    resultsContainer.innerHTML = "";
    return;
  }

  if (matches.length === 0) {
    resultsContainer.innerHTML = `<p>No matches found for <strong>${query}</strong>.</p>`;
    return;
  }

  resultsContainer.innerHTML = matches
    .map((item, index) => {
      const preview = item.paragraph.length > 190 ? `${item.paragraph.slice(0, 190)}…` : item.paragraph;
      return `
        <article class="result-item">
          <h3>Match ${index + 1}</h3>
          <p>${preview}</p>
          <button type="button" class="open-result" data-id="${item.id}">Open paragraph</button>
        </article>
      `;
    })
    .join("");
}

function showDetail(result, query) {
  const expression = new RegExp(`(${escapeRegExp(query)})`, "ig");
  const highlighted = result.paragraph.replace(expression, "<mark>$1</mark>");

  detailTitle.textContent = `Paragraph Match`;
  detailContent.innerHTML = `<p>${highlighted}</p>`;
  detailCard.classList.remove("hidden");
  detailCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function runSearch() {
  const query = normalizeText(searchInput.value);
  if (!query) {
    return;
  }

  suggestionsList.classList.remove("show");

  const matches = paragraphIndex.filter((entry) => entry.normalized.includes(query)).slice(0, 100);
  lastResults = matches;
  renderResults(matches, query);
}

async function initializeIndex() {
  const cached = loadCache();

  if (cached) {
    paragraphIndex = cached;
    wordFrequency = buildWordFrequency(cached.map((entry) => entry.paragraph));
    indexStatus.textContent = `Ready. Indexed ${paragraphIndex.length} paragraphs from cache.`;
    return;
  }

  try {
    paragraphIndex = await extractPdfText();
    wordFrequency = buildWordFrequency(paragraphIndex.map((entry) => entry.paragraph));
    saveCache(paragraphIndex);
    indexStatus.textContent = `Ready. Indexed ${paragraphIndex.length} paragraphs.`;
  } catch (error) {
    console.error(error);
    indexStatus.textContent = "Could not load the PDF in this browser session. Please refresh and try again.";
  }
}

sobrietyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const dateValue = sobrietyDateInput.value;
  localStorage.setItem(SOBRIETY_DATE_KEY, dateValue);
  renderSobrietyDuration(dateValue);
});

searchInput.addEventListener("input", () => {
  setSuggestions(searchInput.value);
});

searchButton.addEventListener("click", runSearch);

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    runSearch();
  }
});

suggestionsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (!target.classList.contains("suggestion-btn")) {
    return;
  }

  searchInput.value = target.dataset.word || "";
  suggestionsList.classList.remove("show");
  runSearch();
});

resultsContainer.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (!target.classList.contains("open-result")) {
    return;
  }

  const id = Number(target.dataset.id);
  const result = lastResults.find((item) => item.id === id);

  if (!result) {
    return;
  }

  showDetail(result, searchInput.value);
});

backToResultsButton.addEventListener("click", () => {
  detailCard.classList.add("hidden");
});

loadSobrietyDate();
initializeIndex();
