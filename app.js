import { getDocument, GlobalWorkerOptions } from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs";

const PDF_URL = "https://www.portlandeyeopener.com/AA-BigBook-4th-Edition.pdf";
const INDEX_CACHE_KEY = "bb-index-cache-v1";
const SOBRIETY_DATE_KEY = "sobriety-date";

const sobrietyForm = document.getElementById("sobriety-form");
const sobrietyDateInput = document.getElementById("sobriety-date");
const sobrietyDateDisplay = document.getElementById("sobriety-date-display");
const soberDays = document.getElementById("sober-days");
const soberDuration = document.getElementById("sober-duration");
const liveClock = document.getElementById("live-clock");
const dateModal = document.getElementById("date-modal");
const openDatePickerButton = document.getElementById("open-date-picker");
const aboutButton = document.getElementById("about-button");
const searchInput = document.getElementById("search-input");
const suggestionsList = document.getElementById("suggestions");
const searchButton = document.getElementById("search-button");
const commonSearches = document.getElementById("common-searches");
const emptyState = document.getElementById("empty-state");
const indexStatus = document.getElementById("index-status");
const resultsContainer = document.getElementById("results");
const detailCard = document.getElementById("detail-card");
const detailTitle = document.getElementById("detail-title");
const detailContent = document.getElementById("detail-content");
const backToResultsButton = document.getElementById("back-to-results");

let paragraphIndex = [];
let suggestionScores = new Map();
let lastResults = [];

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function formatDateLong(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function updateClock() {
  liveClock.textContent = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function openDateModal() {
  dateModal.classList.remove("hidden");
  sobrietyDateInput.focus();
}

function closeDateModal() {
  dateModal.classList.add("hidden");
}

function renderSobrietyDuration(dateString) {
  const start = new Date(`${dateString}T00:00:00`);
  const now = new Date();

  if (Number.isNaN(start.getTime()) || start > now) {
    sobrietyDateDisplay.textContent = "Please choose a valid sobriety date in the past.";
    soberDays.textContent = "0";
    soberDuration.textContent = "0y 0m 0d";
    return false;
  }

  const diffMs = now - start;
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(totalDays / 365.25);
  const months = Math.floor((totalDays % 365.25) / 30.44);
  const days = Math.floor(totalDays - years * 365.25 - months * 30.44);

  soberDays.textContent = totalDays.toLocaleString();
  soberDuration.textContent = `${years}y ${months}m ${days}d`;
  sobrietyDateDisplay.textContent = formatDateLong(dateString);
  return true;
}

function loadSobrietyDate() {
  const saved = localStorage.getItem(SOBRIETY_DATE_KEY);
  if (!saved) {
    openDateModal();
    return;
  }

  sobrietyDateInput.value = saved;
  const valid = renderSobrietyDuration(saved);
  if (!valid) {
    openDateModal();
  }
}

function parseParagraphs(text) {
  const normalized = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");

  return normalized
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 45);
}

function addScore(map, phrase, amount = 1) {
  if (!phrase || phrase.length < 2) {
    return;
  }
  map.set(phrase, (map.get(phrase) || 0) + amount);
}

function buildSuggestionScores(paragraphs) {
  const scores = new Map();

  for (const paragraph of paragraphs) {
    const words = paragraph.toLowerCase().match(/[a-z][a-z'’-]{1,}/g) || [];

    for (let i = 0; i < words.length; i += 1) {
      addScore(scores, words[i], 1);

      if (i + 1 < words.length) {
        addScore(scores, `${words[i]} ${words[i + 1]}`, 2);
      }

      if (i + 2 < words.length) {
        addScore(scores, `${words[i]} ${words[i + 1]} ${words[i + 2]}`, 3);
      }
    }
  }

  return scores;
}

async function extractPdfText() {
  indexStatus.textContent = "Downloading and indexing Big Book text…";

  const loadingTask = getDocument(PDF_URL);
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pages.push(textContent.items.map((item) => item.str).join(" "));
    indexStatus.textContent = `Indexing page ${pageNumber}/${pdf.numPages}…`;
  }

  return parseParagraphs(pages.join("\n\n")).map((paragraph, index) => ({
    id: index,
    paragraph,
    normalized: normalizeText(paragraph)
  }));
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
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
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

  const candidates = [...suggestionScores.entries()]
    .filter(([phrase]) => phrase.includes(normalizedQuery))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([phrase]) => phrase);

  if (candidates.length === 0) {
    suggestionsList.classList.remove("show");
    suggestionsList.innerHTML = "";
    return;
  }

  suggestionsList.innerHTML = candidates
    .map((phrase) => `<li><button type="button" class="suggestion-btn" data-word="${phrase}">${phrase}</button></li>`)
    .join("");
  suggestionsList.classList.add("show");
}

function renderResults(matches, query, fromSuggestion = false) {
  emptyState.classList.toggle("hidden", matches.length > 0 || query.length > 0);

  if (!query) {
    resultsContainer.innerHTML = "";
    return;
  }

  if (matches.length === 0) {
    resultsContainer.innerHTML = `<article class="result-item"><p>No matches found for <strong>${query}</strong>.</p></article>`;
    return;
  }

  const intro = fromSuggestion
    ? `<article class="result-item"><p><strong>Preview matches for “${query}”.</strong> Tap a preview to open the full highlighted paragraph.</p></article>`
    : "";

  const cards = matches
    .map((item, index) => {
      const preview = item.paragraph.length > 220 ? `${item.paragraph.slice(0, 220)}…` : item.paragraph;
      return `
      <article class="result-item open-result" data-id="${item.id}" role="button" tabindex="0" aria-label="Open full paragraph ${index + 1}">
        <h3>Preview ${index + 1}</h3>
        <p>${preview}</p>
      </article>
    `;
    })
    .join("");

  resultsContainer.innerHTML = `${intro}${cards}`;
}

function showDetail(result, query) {
  const expression = new RegExp(`(${escapeRegExp(normalizeText(query))})`, "ig");
  const highlighted = result.paragraph.replace(expression, "<mark>$1</mark>");

  detailTitle.textContent = "Paragraph Match";
  detailContent.innerHTML = `<p>${highlighted}</p>`;
  detailCard.classList.remove("hidden");
  detailCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function runSearch(fromSuggestion = false) {
  const query = normalizeText(searchInput.value);
  suggestionsList.classList.remove("show");

  if (!query) {
    lastResults = [];
    detailCard.classList.add("hidden");
    renderResults([], query);
    return;
  }

  const matches = paragraphIndex.filter((entry) => entry.normalized.includes(query)).slice(0, 24);
  lastResults = matches;
  renderResults(matches, query, fromSuggestion);
}

async function initializeIndex() {
  const cached = loadCache();

  if (cached) {
    paragraphIndex = cached;
    suggestionScores = buildSuggestionScores(cached.map((entry) => entry.paragraph));
    indexStatus.textContent = `Ready. Indexed ${paragraphIndex.length} paragraphs from cache.`;
    return;
  }

  try {
    paragraphIndex = await extractPdfText();
    suggestionScores = buildSuggestionScores(paragraphIndex.map((entry) => entry.paragraph));
    saveCache(paragraphIndex);
    indexStatus.textContent = `Ready. Indexed ${paragraphIndex.length} paragraphs.`;
  } catch (error) {
    console.error(error);
    indexStatus.textContent = "Could not load the PDF in this browser session. Please refresh and try again.";
  }
}

openDatePickerButton.addEventListener("click", openDateModal);

aboutButton.addEventListener("click", () => {
  window.alert("BigBookSearch: sobriety tracker + Big Book search.");
});

sobrietyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = sobrietyDateInput.value;
  const valid = renderSobrietyDuration(value);
  if (!valid) {
    return;
  }

  localStorage.setItem(SOBRIETY_DATE_KEY, value);
  closeDateModal();
});

searchInput.addEventListener("input", () => {
  setSuggestions(searchInput.value);
  if (!searchInput.value.trim()) {
    runSearch();
  }
});

searchButton.addEventListener("click", () => runSearch(false));

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    runSearch(false);
  }
});

commonSearches.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.classList.contains("chip")) {
    return;
  }

  searchInput.value = target.textContent || "";
  runSearch(false);
});

suggestionsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.classList.contains("suggestion-btn")) {
    return;
  }

  searchInput.value = target.dataset.word || "";
  runSearch(true);
});

resultsContainer.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const resultCard = target.closest(".open-result");
  if (!(resultCard instanceof HTMLElement)) {
    return;
  }

  const result = lastResults.find((item) => item.id === Number(resultCard.dataset.id));
  if (result) {
    showDetail(result, searchInput.value);
  }
});

resultsContainer.addEventListener("keydown", (event) => {
  if (!(event.target instanceof HTMLElement) || !event.target.classList.contains("open-result")) {
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  const result = lastResults.find((item) => item.id === Number(event.target.dataset.id));
  if (result) {
    showDetail(result, searchInput.value);
  }
});

backToResultsButton.addEventListener("click", () => {
  detailCard.classList.add("hidden");
});

updateClock();
setInterval(updateClock, 1000);
loadSobrietyDate();
initializeIndex();
