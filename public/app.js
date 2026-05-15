const state = {
  serverName: "TrackVault",
  tracks: [],
  albums: [],
  artists: [],
  genres: [],
  favorites: new Set(),
  activeView: "tracks",
  selectedArtistId: "",
  selectedAlbumId: "",
  selectedGenre: "",
  search: "",
  queue: [],
  currentIndex: -1
};

const nodes = {
  serverLabel: document.querySelector("#server-label"),
  search: document.querySelector("#search-input"),
  viewButtons: document.querySelector("#view-buttons"),
  artistList: document.querySelector("#artist-list"),
  genreList: document.querySelector("#genre-list"),
  title: document.querySelector("#view-title"),
  meta: document.querySelector("#view-meta"),
  albumGrid: document.querySelector("#album-grid"),
  trackList: document.querySelector("#track-list"),
  queueList: document.querySelector("#queue-list"),
  playVisible: document.querySelector("#play-visible"),
  shuffleVisible: document.querySelector("#shuffle-visible"),
  clearQueue: document.querySelector("#clear-queue"),
  previous: document.querySelector("#previous-track"),
  playToggle: document.querySelector("#play-toggle"),
  next: document.querySelector("#next-track"),
  audio: document.querySelector("#audio-player"),
  playerArt: document.querySelector("#player-art"),
  playerTitle: document.querySelector("#player-title"),
  playerSubtitle: document.querySelector("#player-subtitle")
};

bindEvents();
load();

function bindEvents() {
  nodes.search.addEventListener("input", () => {
    state.search = nodes.search.value.trim().toLowerCase();
    render();
  });

  nodes.viewButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    state.activeView = button.dataset.view;
    if (state.activeView !== "artists") {
      state.selectedArtistId = "";
    }
    state.selectedAlbumId = "";
    render();
  });

  nodes.artistList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-artist-id]");
    if (!button) return;
    state.selectedArtistId = button.dataset.artistId;
    state.selectedAlbumId = "";
    state.selectedGenre = "";
    state.activeView = "artists";
    render();
  });

  nodes.genreList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-genre]");
    if (!button) return;
    state.selectedGenre = button.dataset.genre;
    state.selectedArtistId = "";
    state.selectedAlbumId = "";
    render();
  });

  nodes.albumGrid.addEventListener("click", (event) => {
    const playButton = event.target.closest("button[data-play-album]");
    if (playButton) {
      const albumId = playButton.dataset.playAlbum;
      const tracks = sortedTracks(state.tracks.filter((track) => track.albumId === albumId));
      playQueue(tracks, tracks[0]?.id);
      return;
    }

    const selectButton = event.target.closest("button[data-select-album]");
    if (selectButton) {
      state.activeView = "albums";
      state.selectedAlbumId = selectButton.dataset.selectAlbum;
      render();
    }
  });

  nodes.trackList.addEventListener("click", async (event) => {
    const playButton = event.target.closest("button[data-play-track]");
    if (playButton) {
      const tracks = visibleTracks();
      playQueue(tracks, playButton.dataset.playTrack);
      return;
    }

    const favoriteButton = event.target.closest("button[data-favorite-track]");
    if (favoriteButton) {
      await toggleFavorite(favoriteButton.dataset.favoriteTrack);
    }
  });

  nodes.queueList.addEventListener("click", (event) => {
    const item = event.target.closest("button[data-queue-index]");
    if (!item) return;
    playIndex(Number(item.dataset.queueIndex));
  });

  nodes.playVisible.addEventListener("click", () => {
    const tracks = visibleTracks();
    playQueue(tracks, tracks[0]?.id);
  });

  nodes.shuffleVisible.addEventListener("click", () => {
    const tracks = shuffle(visibleTracks());
    playQueue(tracks, tracks[0]?.id);
  });

  nodes.clearQueue.addEventListener("click", () => {
    state.queue = [];
    state.currentIndex = -1;
    nodes.audio.removeAttribute("src");
    renderPlayer();
    renderQueue();
  });

  nodes.previous.addEventListener("click", () => playIndex(Math.max(0, state.currentIndex - 1)));
  nodes.next.addEventListener("click", () => playIndex(nextIndex()));
  nodes.playToggle.addEventListener("click", () => {
    if (!nodes.audio.src && state.queue.length) {
      playIndex(Math.max(0, state.currentIndex));
      return;
    }
    if (nodes.audio.paused) {
      nodes.audio.play().catch(() => {});
    } else {
      nodes.audio.pause();
    }
  });

  nodes.audio.addEventListener("play", renderPlayer);
  nodes.audio.addEventListener("pause", renderPlayer);
  nodes.audio.addEventListener("ended", () => {
    const next = nextIndex();
    if (next !== state.currentIndex) {
      playIndex(next);
    }
  });
}

async function load() {
  const [library, favorites] = await Promise.all([
    api("/api/library"),
    api("/api/favorites")
  ]);

  state.serverName = library.settings.serverName || "TrackVault";
  state.tracks = sortedTracks(library.tracks);
  state.albums = library.albums;
  state.artists = library.artists;
  state.genres = library.genres;
  state.favorites = new Set(favorites.tracks || []);

  document.title = state.serverName;
  nodes.serverLabel.textContent = state.serverName;
  render();
}

function render() {
  renderViewButtons();
  renderNavigation();
  renderLibrary();
  renderQueue();
  renderPlayer();
}

function renderViewButtons() {
  nodes.viewButtons.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
}

function renderNavigation() {
  nodes.artistList.innerHTML = state.artists.map((artist) => `
    <button type="button" class="${artist.id === state.selectedArtistId ? "active" : ""}" data-artist-id="${artist.id}">
      <span title="${escapeHtml(artist.name)}">${escapeHtml(artist.name)}</span>
      <em>${artist.albumCount}</em>
    </button>
  `).join("") || `<div class="empty-state">No artists</div>`;

  nodes.genreList.innerHTML = state.genres.map((genre) => `
    <button type="button" class="${genre === state.selectedGenre ? "active" : ""}" data-genre="${escapeHtml(genre)}">
      <span title="${escapeHtml(genre)}">${escapeHtml(genre)}</span>
    </button>
  `).join("") || `<div class="empty-state">No genres</div>`;
}

function renderLibrary() {
  const tracks = visibleTracks();
  const albums = visibleAlbums(tracks);

  nodes.title.textContent = viewTitle();
  nodes.meta.textContent = `${number(tracks.length)} tracks · ${number(albums.length)} albums`;
  nodes.playVisible.disabled = tracks.length === 0;
  nodes.shuffleVisible.disabled = tracks.length === 0;

  renderAlbums(albums);
  renderTracks(tracks);
}

function renderAlbums(albums) {
  const shouldShowAlbums = state.activeView !== "favorites";
  if (!shouldShowAlbums) {
    nodes.albumGrid.innerHTML = "";
    return;
  }

  if (!albums.length) {
    nodes.albumGrid.innerHTML = `<div class="empty-state">No albums</div>`;
    return;
  }

  nodes.albumGrid.innerHTML = albums.map((album) => `
    <article class="album-card">
      <img src="${album.artUrl}" alt="">
      <strong title="${escapeHtml(album.title)}">${escapeHtml(album.title)}</strong>
      <span title="${escapeHtml(album.artist)}">${escapeHtml(album.artist)}</span>
      <span>${number(album.trackCount)} tracks</span>
      <div class="album-actions">
        <button class="button secondary" type="button" data-select-album="${album.id}">Open</button>
        <button class="icon-button" type="button" data-play-album="${album.id}" aria-label="Play ${escapeHtml(album.title)}">&gt;</button>
      </div>
    </article>
  `).join("");
}

function renderTracks(tracks) {
  if (!tracks.length) {
    nodes.trackList.innerHTML = `<div class="empty-state">No tracks</div>`;
    return;
  }

  const current = currentTrack();
  nodes.trackList.innerHTML = tracks.map((track) => `
    <article class="track-row ${current?.id === track.id ? "current" : ""}" role="listitem">
      <button class="icon-button" type="button" data-play-track="${track.id}" aria-label="Play ${escapeHtml(track.title)}">&gt;</button>
      <div class="track-main">
        <strong title="${escapeHtml(track.title)}">${track.trackNumber ? `${track.trackNumber}. ` : ""}${escapeHtml(track.title)}</strong>
        <span title="${escapeHtml(track.artist)}">${escapeHtml(track.artist)}</span>
      </div>
      <span class="track-album" title="${escapeHtml(track.album)}">${escapeHtml(track.album)}</span>
      <span class="track-genre" title="${escapeHtml(track.genre)}">${escapeHtml(track.genre || track.extension.toUpperCase())}</span>
      <button class="icon-button favorite-button ${state.favorites.has(track.id) ? "active" : ""}" type="button" data-favorite-track="${track.id}" aria-label="Favorite ${escapeHtml(track.title)}">*</button>
    </article>
  `).join("");
}

function renderQueue() {
  if (!state.queue.length) {
    nodes.queueList.innerHTML = `<div class="empty-state">Queue empty</div>`;
    return;
  }

  nodes.queueList.innerHTML = state.queue.map((track, index) => `
    <button class="queue-item ${index === state.currentIndex ? "active" : ""}" type="button" data-queue-index="${index}">
      <img src="${track.artUrl}" alt="">
      <div>
        <strong title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</strong>
        <span title="${escapeHtml(track.artist)}">${escapeHtml(track.artist)}</span>
      </div>
    </button>
  `).join("");
}

function renderPlayer() {
  const track = currentTrack();
  nodes.playToggle.textContent = nodes.audio.paused ? "Play" : "Pause";
  nodes.previous.disabled = state.currentIndex <= 0;
  nodes.next.disabled = state.currentIndex < 0 || state.currentIndex >= state.queue.length - 1;

  if (!track) {
    nodes.playerTitle.textContent = "Nothing playing";
    nodes.playerSubtitle.textContent = state.serverName;
    nodes.playerArt.src = "/api/albums/empty/art";
    return;
  }

  nodes.playerTitle.textContent = track.title;
  nodes.playerSubtitle.textContent = `${track.artist} · ${track.album}`;
  nodes.playerArt.src = track.artUrl;
}

function visibleTracks() {
  return sortedTracks(state.tracks.filter((track) => {
    if (state.activeView === "favorites" && !state.favorites.has(track.id)) return false;
    if (state.activeView === "artists" && state.selectedArtistId && track.artistId !== state.selectedArtistId) return false;
    if (state.activeView === "albums" && state.selectedAlbumId && track.albumId !== state.selectedAlbumId) return false;
    if (state.selectedGenre && track.genre !== state.selectedGenre) return false;
    if (!state.search) return true;
    return [track.title, track.artist, track.album, track.genre].some((value) => String(value || "").toLowerCase().includes(state.search));
  }));
}

function visibleAlbums(tracks) {
  const ids = new Set(tracks.map((track) => track.albumId));
  return state.albums
    .filter((album) => ids.has(album.id))
    .sort((a, b) => compareText(a.artist, b.artist) || compareText(a.title, b.title));
}

function viewTitle() {
  if (state.activeView === "favorites") return "Favorites";
  if (state.activeView === "albums" && state.selectedAlbumId) {
    return state.albums.find((album) => album.id === state.selectedAlbumId)?.title || "Albums";
  }
  if (state.activeView === "artists" && state.selectedArtistId) {
    return state.artists.find((artist) => artist.id === state.selectedArtistId)?.name || "Artists";
  }
  if (state.selectedGenre) return state.selectedGenre;
  return state.activeView[0].toUpperCase() + state.activeView.slice(1);
}

function playQueue(tracks, trackId) {
  if (!tracks.length || !trackId) return;
  state.queue = tracks;
  state.currentIndex = Math.max(0, tracks.findIndex((track) => track.id === trackId));
  playIndex(state.currentIndex);
}

function playIndex(index) {
  if (index < 0 || index >= state.queue.length) return;
  state.currentIndex = index;
  const track = currentTrack();
  nodes.audio.src = track.streamUrl;
  nodes.audio.play().catch(() => {});
  render();
}

function nextIndex() {
  if (!state.queue.length) return -1;
  return Math.min(state.queue.length - 1, state.currentIndex + 1);
}

async function toggleFavorite(trackId) {
  const next = !state.favorites.has(trackId);
  const result = await api(`/api/favorites/${encodeURIComponent(trackId)}`, {
    method: "POST",
    body: { favorite: next }
  });
  state.favorites = new Set(result.tracks || []);
  render();
}

function currentTrack() {
  return state.queue[state.currentIndex] || null;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function sortedTracks(tracks) {
  return [...tracks].sort((a, b) => (
    compareText(a.artist, b.artist) ||
    compareText(a.album, b.album) ||
    Number(a.trackNumber || 0) - Number(b.trackNumber || 0) ||
    compareText(a.title, b.title)
  ));
}

function shuffle(tracks) {
  const output = [...tracks];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function number(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
