const state = {
  serverName: "TrackVault",
  tracks: [],
  albums: [],
  artists: [],
  genres: [],
  playlists: [],
  favorites: new Set(),
  activeView: "tracks",
  selectedArtistId: "",
  selectedAlbumId: "",
  selectedPlaylistId: "",
  selectedGenre: "",
  search: "",
  queue: [],
  currentIndex: -1,
  selectedTrackIds: new Set()
};

const nodes = {
  serverLabel: document.querySelector("#server-label"),
  search: document.querySelector("#search-input"),
  viewButtons: document.querySelector("#view-buttons"),
  playlistForm: document.querySelector("#client-playlist-form"),
  playlistName: document.querySelector("#client-playlist-name"),
  playlistNavList: document.querySelector("#playlist-nav-list"),
  artistList: document.querySelector("#artist-list"),
  genreList: document.querySelector("#genre-list"),
  title: document.querySelector("#view-title"),
  meta: document.querySelector("#view-meta"),
  albumGrid: document.querySelector("#album-grid"),
  trackList: document.querySelector("#track-list"),
  queueList: document.querySelector("#queue-list"),
  playVisible: document.querySelector("#play-visible"),
  shuffleVisible: document.querySelector("#shuffle-visible"),
  bulkActions: document.querySelector("#bulk-actions"),
  selectVisible: document.querySelector("#select-visible"),
  selectedCount: document.querySelector("#selected-count"),
  bulkPlaylistSelect: document.querySelector("#bulk-playlist-select"),
  bulkRemove: document.querySelector("#bulk-remove"),
  clearSelection: document.querySelector("#clear-selection"),
  clearQueue: document.querySelector("#clear-queue"),
  previous: document.querySelector("#previous-track"),
  playToggle: document.querySelector("#play-toggle"),
  progressPlay: document.querySelector("#progress-play"),
  next: document.querySelector("#next-track"),
  audio: document.querySelector("#audio-player"),
  playerArt: document.querySelector("#player-art"),
  musicBlob: document.querySelector("#music-blob"),
  playerTitle: document.querySelector("#player-title"),
  playerSubtitle: document.querySelector("#player-subtitle"),
  seekSlider: document.querySelector("#seek-slider"),
  currentTime: document.querySelector("#current-time"),
  durationTime: document.querySelector("#duration-time"),
  muteToggle: document.querySelector("#mute-toggle"),
  volumeSlider: document.querySelector("#volume-slider")
};

setupMusicBlob();
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

  nodes.playlistForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nodes.playlistName.value.trim();
    if (!name) return;
    const playlist = await api("/api/playlists", {
      method: "POST",
      body: { name }
    });
    nodes.playlistName.value = "";
    state.playlists.push(playlist);
    state.selectedPlaylistId = playlist.id;
    state.activeView = "playlists";
    render();
  });

  nodes.playlistNavList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-playlist-id]");
    if (!button) return;
    state.selectedPlaylistId = button.dataset.playlistId;
    state.selectedArtistId = "";
    state.selectedAlbumId = "";
    state.selectedGenre = "";
    state.activeView = "playlists";
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
    const checkbox = event.target.closest("input[data-select-track]");
    if (checkbox) {
      toggleTrackSelection(checkbox.dataset.selectTrack, checkbox.checked);
      return;
    }

    const playButton = event.target.closest("button[data-play-track]");
    if (playButton) {
      const tracks = visibleTracks();
      playQueue(tracks, playButton.dataset.playTrack);
      return;
    }

    const favoriteButton = event.target.closest("button[data-favorite-track]");
    if (favoriteButton) {
      await toggleFavorite(favoriteButton.dataset.favoriteTrack);
      return;
    }

    const removeButton = event.target.closest("button[data-remove-track]");
    if (removeButton) {
      await removeTrackFromSelectedPlaylist(removeButton.dataset.removeTrack);
    }
  });

  nodes.trackList.addEventListener("change", async (event) => {
    const select = event.target.closest("select[data-playlist-target]");
    if (!select || !select.value) return;
    await addTrackToPlaylist(select.dataset.playlistTarget, select.value);
    select.value = "";
  });

  nodes.selectVisible.addEventListener("change", () => {
    const tracks = visibleTracks();
    if (nodes.selectVisible.checked) {
      tracks.forEach((track) => state.selectedTrackIds.add(track.id));
    } else {
      tracks.forEach((track) => state.selectedTrackIds.delete(track.id));
    }
    renderTracks(tracks);
  });

  nodes.bulkPlaylistSelect.addEventListener("change", async () => {
    if (!nodes.bulkPlaylistSelect.value) return;
    await addSelectedTracksToPlaylist(nodes.bulkPlaylistSelect.value);
    nodes.bulkPlaylistSelect.value = "";
  });

  nodes.bulkRemove.addEventListener("click", removeSelectedTracksFromPlaylist);
  nodes.clearSelection.addEventListener("click", () => {
    state.selectedTrackIds.clear();
    renderTracks(visibleTracks());
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
  nodes.playToggle.addEventListener("click", togglePlayback);
  on(nodes.progressPlay, "click", togglePlayback);

  nodes.audio.addEventListener("play", () => {
    ensureBlobAudio();
    renderPlayer();
  });
  nodes.audio.addEventListener("pause", renderPlayer);
  nodes.audio.addEventListener("timeupdate", updateProgress);
  nodes.audio.addEventListener("loadedmetadata", updateProgress);
  nodes.audio.addEventListener("durationchange", updateProgress);
  nodes.audio.addEventListener("volumechange", updateVolumeUi);
  nodes.audio.addEventListener("ended", () => {
    const next = nextIndex();
    if (next !== state.currentIndex) {
      playIndex(next);
    }
  });

  on(nodes.seekSlider, "input", () => {
    state.seeking = true;
    const duration = safeDuration();
    nodes.currentTime.textContent = formatTime((Number(nodes.seekSlider.value) / 1000) * duration);
  });

  on(nodes.seekSlider, "change", () => {
    const duration = safeDuration();
    if (duration) {
      nodes.audio.currentTime = (Number(nodes.seekSlider.value) / 1000) * duration;
    }
    state.seeking = false;
    updateProgress();
  });

  on(nodes.muteToggle, "click", () => {
    nodes.audio.muted = !nodes.audio.muted;
  });

  on(nodes.volumeSlider, "input", () => {
    nodes.audio.volume = Number(nodes.volumeSlider.value);
    nodes.audio.muted = nodes.audio.volume === 0;
  });

  if (nodes.volumeSlider) {
    nodes.audio.volume = Number(nodes.volumeSlider.value);
  }
  updateVolumeUi();
  updateProgress();
}

async function load() {
  const [library, favorites, playlists] = await Promise.all([
    api("/api/library"),
    api("/api/favorites"),
    api("/api/playlists")
  ]);

  state.serverName = library.settings.serverName || "TrackVault";
  state.tracks = sortedTracks(library.tracks);
  state.albums = library.albums;
  state.artists = library.artists;
  state.genres = library.genres;
  state.favorites = new Set(favorites.tracks || []);
  state.playlists = playlists.playlists || [];

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
  nodes.playlistNavList.innerHTML = state.playlists.map((playlist) => `
    <button type="button" class="${playlist.id === state.selectedPlaylistId ? "active" : ""}" data-playlist-id="${playlist.id}">
      <span title="${escapeHtml(playlist.name)}">${escapeHtml(playlist.name)}</span>
      <em>${number(playlist.trackCount)}</em>
    </button>
  `).join("") || `<div class="empty-state compact">No playlists</div>`;

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
  pruneSelection(tracks);

  nodes.title.textContent = viewTitle();
  nodes.meta.textContent = `${number(tracks.length)} tracks - ${number(albums.length)} albums`;
  nodes.playVisible.disabled = tracks.length === 0;
  nodes.shuffleVisible.disabled = tracks.length === 0;

  renderAlbums(albums);
  renderTracks(tracks);
}

function renderAlbums(albums) {
  const shouldShowAlbums = state.activeView !== "favorites" && state.activeView !== "playlists";
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
  renderBulkActions(tracks);
  if (!tracks.length) {
    nodes.trackList.innerHTML = `<div class="empty-state">No tracks</div>`;
    return;
  }

  const current = currentTrack();
  const playlistOptions = state.playlists.map((playlist) => `
    <option value="${playlist.id}">${escapeHtml(playlist.name)}</option>
  `).join("");
  const canRemoveFromPlaylist = state.activeView === "playlists" && Boolean(state.selectedPlaylistId);
  nodes.trackList.innerHTML = tracks.map((track) => `
    <article class="track-row ${current?.id === track.id ? "current" : ""}" role="listitem">
      <input class="track-checkbox" type="checkbox" data-select-track="${track.id}" ${state.selectedTrackIds.has(track.id) ? "checked" : ""} aria-label="Select ${escapeHtml(track.title)}">
      <button class="icon-button" type="button" data-play-track="${track.id}" aria-label="Play ${escapeHtml(track.title)}">&gt;</button>
      <div class="track-main">
        <strong title="${escapeHtml(track.title)}">${track.trackNumber ? `${track.trackNumber}. ` : ""}${escapeHtml(track.title)}</strong>
        <span title="${escapeHtml(track.artist)}">${escapeHtml(track.artist)}</span>
      </div>
      <span class="track-album" title="${escapeHtml(track.album)}">${escapeHtml(track.album)}</span>
      <span class="track-genre" title="${escapeHtml(track.genre)}">${escapeHtml(track.genre || track.extension.toUpperCase())}</span>
      <select class="playlist-select" data-playlist-target="${track.id}" aria-label="Add ${escapeHtml(track.title)} to playlist" ${state.playlists.length ? "" : "disabled"}>
        <option value="">Add to playlist</option>
        ${playlistOptions}
      </select>
      <button class="icon-button remove-track-button" type="button" data-remove-track="${track.id}" ${canRemoveFromPlaylist ? "" : "disabled hidden"} aria-label="Remove ${escapeHtml(track.title)} from selected playlist">x</button>
      <button class="icon-button favorite-button ${state.favorites.has(track.id) ? "active" : ""}" type="button" data-favorite-track="${track.id}" aria-label="Favorite ${escapeHtml(track.title)}">*</button>
    </article>
  `).join("");
}

function renderBulkActions(tracks) {
  const selectedVisibleCount = tracks.filter((track) => state.selectedTrackIds.has(track.id)).length;
  const selectedTotal = state.selectedTrackIds.size;
  nodes.selectedCount.textContent = `${number(selectedTotal)} selected`;
  nodes.selectVisible.checked = tracks.length > 0 && selectedVisibleCount === tracks.length;
  nodes.selectVisible.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < tracks.length;
  nodes.selectVisible.disabled = tracks.length === 0;

  nodes.bulkPlaylistSelect.disabled = selectedTotal === 0 || state.playlists.length === 0;
  nodes.bulkPlaylistSelect.innerHTML = `
    <option value="">Add selected to playlist</option>
    ${state.playlists.map((playlist) => `<option value="${playlist.id}">${escapeHtml(playlist.name)}</option>`).join("")}
  `;

  nodes.bulkRemove.hidden = state.activeView !== "playlists";
  nodes.bulkRemove.disabled = selectedTotal === 0 || state.activeView !== "playlists" || !state.selectedPlaylistId;
  nodes.clearSelection.disabled = selectedTotal === 0;
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
  const paused = nodes.audio.paused;
  nodes.playToggle.textContent = paused ? "Play" : "Pause";
  if (nodes.progressPlay) {
    nodes.progressPlay.textContent = paused ? ">" : "||";
  }
  nodes.previous.disabled = state.currentIndex <= 0;
  nodes.next.disabled = state.currentIndex < 0 || state.currentIndex >= state.queue.length - 1;
  if (nodes.progressPlay) nodes.progressPlay.disabled = !track && !state.queue.length;
  if (nodes.seekSlider) nodes.seekSlider.disabled = !track;
  if (nodes.muteToggle) nodes.muteToggle.disabled = !track;
  if (nodes.volumeSlider) nodes.volumeSlider.disabled = !track;
  updateProgress();
  updateVolumeUi();

  if (!track) {
    nodes.playerTitle.textContent = "Nothing playing";
    nodes.playerSubtitle.textContent = state.serverName;
    nodes.playerArt.src = "/api/albums/empty/art";
    return;
  }

  nodes.playerTitle.textContent = track.title;
  nodes.playerSubtitle.textContent = `${track.artist} - ${track.album}`;
  nodes.playerArt.src = track.artUrl;
}

function visibleTracks() {
  return sortedTracks(state.tracks.filter((track) => {
    if (state.activeView === "favorites" && !state.favorites.has(track.id)) return false;
    if (state.activeView === "playlists") {
      const playlist = selectedPlaylist();
      if (!playlist || !playlist.trackIds.includes(track.id)) return false;
    }
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
  if (state.activeView === "playlists") {
    return selectedPlaylist()?.name || "Playlists";
  }
  if (state.activeView === "albums" && state.selectedAlbumId) {
    return state.albums.find((album) => album.id === state.selectedAlbumId)?.title || "Albums";
  }
  if (state.activeView === "artists" && state.selectedArtistId) {
    return state.artists.find((artist) => artist.id === state.selectedArtistId)?.name || "Artists";
  }
  if (state.selectedGenre) return state.selectedGenre;
  return state.activeView[0].toUpperCase() + state.activeView.slice(1);
}

function selectedPlaylist() {
  return state.playlists.find((playlist) => playlist.id === state.selectedPlaylistId) || null;
}

function pruneSelection(visible) {
  const visibleIds = new Set(visible.map((track) => track.id));
  for (const trackId of Array.from(state.selectedTrackIds)) {
    if (!visibleIds.has(trackId)) {
      state.selectedTrackIds.delete(trackId);
    }
  }
}

function toggleTrackSelection(trackId, selected) {
  if (selected) {
    state.selectedTrackIds.add(trackId);
  } else {
    state.selectedTrackIds.delete(trackId);
  }
  renderBulkActions(visibleTracks());
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
  ensureBlobAudio();
  nodes.audio.play().catch(() => {});
  render();
}

function togglePlayback() {
  if (!nodes.audio.src && state.queue.length) {
    playIndex(Math.max(0, state.currentIndex));
    return;
  }
  if (nodes.audio.paused) {
    ensureBlobAudio();
    nodes.audio.play().catch(() => {});
  } else {
    nodes.audio.pause();
  }
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

async function addTrackToPlaylist(trackId, playlistId) {
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist) return;
  const updated = await api(`/api/playlists/${encodeURIComponent(playlist.id)}/tracks`, {
    method: "POST",
    body: { trackId }
  });
  state.playlists = state.playlists.map((item) => item.id === updated.id ? updated : item);
  render();
}

async function addSelectedTracksToPlaylist(playlistId) {
  const trackIds = Array.from(state.selectedTrackIds);
  if (!trackIds.length) return;

  let updated = null;
  for (const trackId of trackIds) {
    updated = await api(`/api/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: "POST",
      body: { trackId }
    });
  }
  if (updated) {
    state.playlists = state.playlists.map((item) => item.id === updated.id ? updated : item);
  }
  state.selectedTrackIds.clear();
  render();
}

async function removeTrackFromSelectedPlaylist(trackId) {
  const playlist = selectedPlaylist();
  if (!playlist) return;
  const updated = await api(`/api/playlists/${encodeURIComponent(playlist.id)}/tracks/${encodeURIComponent(trackId)}`, {
    method: "DELETE"
  });
  state.playlists = state.playlists.map((item) => item.id === updated.id ? updated : item);
  render();
}

async function removeSelectedTracksFromPlaylist() {
  const playlist = selectedPlaylist();
  const trackIds = Array.from(state.selectedTrackIds);
  if (!playlist || !trackIds.length) return;

  let updated = null;
  for (const trackId of trackIds) {
    updated = await api(`/api/playlists/${encodeURIComponent(playlist.id)}/tracks/${encodeURIComponent(trackId)}`, {
      method: "DELETE"
    });
  }
  if (updated) {
    state.playlists = state.playlists.map((item) => item.id === updated.id ? updated : item);
  }
  state.selectedTrackIds.clear();
  render();
}

function currentTrack() {
  return state.queue[state.currentIndex] || null;
}

function on(node, eventName, handler) {
  if (node) {
    node.addEventListener(eventName, handler);
  }
}

function updateProgress() {
  if (!nodes.seekSlider || !nodes.currentTime || !nodes.durationTime) return;
  const duration = safeDuration();
  const current = Number.isFinite(nodes.audio.currentTime) ? nodes.audio.currentTime : 0;
  if (!state.seeking) {
    nodes.seekSlider.value = duration ? Math.round((current / duration) * 1000) : 0;
  }
  nodes.currentTime.textContent = formatTime(current);
  nodes.durationTime.textContent = formatTime(duration);
}

function updateVolumeUi() {
  if (!nodes.volumeSlider || !nodes.muteToggle) return;
  nodes.volumeSlider.value = nodes.audio.muted ? 0 : nodes.audio.volume;
  nodes.muteToggle.textContent = nodes.audio.muted || nodes.audio.volume === 0 ? "Mute" : "Vol";
}

function safeDuration() {
  return Number.isFinite(nodes.audio.duration) ? nodes.audio.duration : 0;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
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

function setupMusicBlob() {
  const canvas = nodes.musicBlob;
  if (!canvas) return;
  const context = canvas.getContext("2d");
  canvas.classList.add("is-live");
  const blob = {
    context,
    audioContext: null,
    analyser: null,
    source: null,
    data: null,
    energy: 0,
    bass: 0,
    mid: 0,
    startedAt: performance.now()
  };
  state.blob = blob;

  const draw = () => {
    drawMusicBlob(canvas, blob);
    requestAnimationFrame(draw);
  };
  draw();
}

function ensureBlobAudio() {
  const blob = state.blob;
  if (!blob || blob.source) {
    if (blob?.audioContext?.state === "suspended") {
      blob.audioContext.resume().catch(() => {});
    }
    return;
  }

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    blob.audioContext = new AudioContext();
    blob.analyser = blob.audioContext.createAnalyser();
    blob.analyser.fftSize = 128;
    blob.analyser.smoothingTimeConstant = 0.86;
    blob.data = new Uint8Array(blob.analyser.frequencyBinCount);
    blob.source = blob.audioContext.createMediaElementSource(nodes.audio);
    blob.source.connect(blob.analyser);
    blob.analyser.connect(blob.audioContext.destination);
    blob.audioContext.resume().catch(() => {});
  } catch {
    blob.source = null;
  }
}

function drawMusicBlob(canvas, blob) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = blob.context;
  const time = (performance.now() - blob.startedAt) / 1000;
  if (blob.analyser && blob.data) {
    blob.analyser.getByteFrequencyData(blob.data);
    blob.bass = smooth(blob.bass, average(blob.data, 0, 7) / 255, 0.12);
    blob.mid = smooth(blob.mid, average(blob.data, 8, 26) / 255, 0.08);
    blob.energy = smooth(blob.energy, average(blob.data, 0, blob.data.length) / 255, 0.1);
  } else {
    blob.bass = smooth(blob.bass, 0.1 + Math.sin(time * 0.7) * 0.04, 0.03);
    blob.mid = smooth(blob.mid, 0.08 + Math.cos(time * 0.5) * 0.03, 0.03);
    blob.energy = smooth(blob.energy, 0.08, 0.04);
  }

  context.clearRect(0, 0, width, height);
  context.save();
  context.scale(ratio, ratio);
  context.translate(rect.width / 2, rect.height / 2);

  const radius = Math.min(rect.width, rect.height) * (0.28 + blob.energy * 0.08);
  const rings = 14;
  const points = 150;
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let ring = 0; ring < rings; ring += 1) {
    const ringScale = 1 - ring * 0.035;
    context.beginPath();
    for (let point = 0; point <= points; point += 1) {
      const angle = (point / points) * Math.PI * 2;
      const slow = time * (0.34 + ring * 0.015);
      const wobble =
        Math.sin(angle * 3 + slow) * (0.16 + blob.bass * 0.22) +
        Math.cos(angle * 5 - slow * 0.8) * (0.09 + blob.mid * 0.14) +
        Math.sin(angle * 2 + slow * 1.7) * 0.07;
      const currentRadius = radius * ringScale * (1 + wobble);
      const x = Math.cos(angle) * currentRadius * (1.22 + blob.mid * 0.12);
      const y = Math.sin(angle) * currentRadius * (0.72 + blob.bass * 0.16);
      if (point === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.closePath();
    context.strokeStyle = ring === 0 ? "#ffffff" : `rgba(255, 255, 255, ${0.82 - ring * 0.044})`;
    context.lineWidth = Math.max(0.8, 1.8 - ring * 0.045);
    context.stroke();
  }
  context.restore();
}

function average(values, start, end) {
  let total = 0;
  const stop = Math.min(values.length, end);
  for (let index = start; index < stop; index += 1) {
    total += values[index];
  }
  return total / Math.max(1, stop - start);
}

function smooth(current, next, amount) {
  return current + (next - current) * amount;
}
