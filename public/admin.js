const nodes = {
  form: document.querySelector("#settings-form"),
  serverName: document.querySelector("#server-name"),
  libraryPath: document.querySelector("#library-path"),
  scanOnStart: document.querySelector("#scan-on-start"),
  scanButton: document.querySelector("#scan-button"),
  clearLibraryButton: document.querySelector("#clear-library-button"),
  clearPlaylistsButton: document.querySelector("#clear-playlists-button"),
  shutdownButton: document.querySelector("#shutdown-button"),
  message: document.querySelector("#admin-message"),
  scanStatus: document.querySelector("#scan-status"),
  tracks: document.querySelector("#metric-tracks"),
  albums: document.querySelector("#metric-albums"),
  artists: document.querySelector("#metric-artists"),
  storage: document.querySelector("#metric-storage"),
  lastScan: document.querySelector("#last-scan"),
  libraryRoot: document.querySelector("#library-root"),
  albumPreview: document.querySelector("#album-preview"),
  trackPreview: document.querySelector("#track-preview")
};

nodes.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Saving settings");
  try {
    await api("/api/settings", {
      method: "PUT",
      body: {
        serverName: nodes.serverName.value,
        libraryPath: nodes.libraryPath.value,
        scanOnStart: nodes.scanOnStart.checked
      }
    });
    setMessage("Settings saved");
    await load();
  } catch (error) {
    setMessage(error.message, true);
  }
});

nodes.scanButton.addEventListener("click", async () => {
  nodes.scanButton.disabled = true;
  nodes.scanStatus.textContent = "Scanning";
  nodes.scanStatus.classList.add("busy");
  setMessage("Scanning library");
  try {
    await api("/api/scan", { method: "POST" });
    setMessage("Scan complete");
    await load();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    nodes.scanButton.disabled = false;
  }
});

nodes.clearLibraryButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Clear library.json? This removes the current library index until you scan again.");
  if (!confirmed) return;

  nodes.clearLibraryButton.disabled = true;
  setMessage("Clearing library.json");
  try {
    await api("/api/library/clear", { method: "POST" });
    setMessage("library.json cleared");
    await load();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    nodes.clearLibraryButton.disabled = false;
  }
});

nodes.clearPlaylistsButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Clear playlists.json? This deletes all playlists.");
  if (!confirmed) return;

  nodes.clearPlaylistsButton.disabled = true;
  setMessage("Clearing playlists.json");
  try {
    await api("/api/playlists/clear", { method: "POST" });
    setMessage("playlists.json cleared");
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    nodes.clearPlaylistsButton.disabled = false;
  }
});

nodes.shutdownButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Shut down TrackVault now?");
  if (!confirmed) return;

  nodes.shutdownButton.disabled = true;
  setMessage("Shutting down TrackVault");
  try {
    await api("/api/shutdown", { method: "POST" });
    setMessage("TrackVault has stopped. Close this tab or start it again when ready.");
  } catch (error) {
    setMessage(error.message, true);
    nodes.shutdownButton.disabled = false;
  }
});

load();

async function load() {
  const status = await api("/api/status");
  applyStatus(status);

  const library = await api("/api/library");
  renderAlbums(library.albums.slice(0, 8));
  renderTracks(library.tracks.slice(0, 12));
}

function applyStatus(status) {
  const settings = status.settings;
  const library = status.library;
  const stats = library.stats || {};

  document.title = `${settings.serverName} Admin`;
  nodes.serverName.value = settings.serverName || "";
  nodes.libraryPath.value = settings.libraryPath || "";
  nodes.scanOnStart.checked = Boolean(settings.scanOnStart);

  nodes.tracks.textContent = number(stats.tracks);
  nodes.albums.textContent = number(stats.albums);
  nodes.artists.textContent = number(stats.artists);
  nodes.storage.textContent = formatBytes(stats.totalBytes || 0);
  nodes.lastScan.textContent = library.generatedAt ? `Scanned ${formatDate(library.generatedAt)}` : "Never scanned";
  nodes.libraryRoot.textContent = library.root || settings.libraryPath || "";

  nodes.scanStatus.textContent = status.scan.active ? "Scanning" : "Idle";
  nodes.scanStatus.classList.toggle("busy", Boolean(status.scan.active));
}

function renderAlbums(albums) {
  if (!albums.length) {
    nodes.albumPreview.innerHTML = `<div class="empty-state">No albums indexed</div>`;
    return;
  }

  nodes.albumPreview.innerHTML = albums.map((album) => `
    <article class="album-card">
      <img src="${album.artUrl}" alt="">
      <strong title="${escapeHtml(album.title)}">${escapeHtml(album.title)}</strong>
      <span title="${escapeHtml(album.artist)}">${escapeHtml(album.artist)}</span>
      <span>${number(album.trackCount)} tracks</span>
    </article>
  `).join("");
}

function renderTracks(tracks) {
  if (!tracks.length) {
    nodes.trackPreview.innerHTML = `<div class="empty-state">No tracks indexed</div>`;
    return;
  }

  nodes.trackPreview.innerHTML = tracks.map((track) => `
    <div class="admin-track-row">
      <strong title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</strong>
      <span title="${escapeHtml(track.artist)}">${escapeHtml(track.artist)}</span>
      <span title="${escapeHtml(track.album)}">${escapeHtml(track.album)}</span>
    </div>
  `).join("");
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

function setMessage(value, isError = false) {
  nodes.message.textContent = value;
  nodes.message.classList.toggle("error", isError);
}

function number(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatBytes(value) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
