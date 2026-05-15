const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8096);
const DATA_DIR = path.resolve(process.env.TRACKVAULT_DATA || path.join(ROOT, ".trackvault"));
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const LIBRARY_FILE = path.join(DATA_DIR, "library.json");
const FAVORITES_FILE = path.join(DATA_DIR, "favorites.json");
const PLAYLISTS_FILE = path.join(DATA_DIR, "playlists.json");
const PUBLIC_DIR = path.join(ROOT, "public");

const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".m4a", ".aac", ".wav", ".ogg", ".opus", ".webm"]);
const TEXT_FRAME_IDS = {
  TIT2: "title",
  TPE1: "artist",
  TALB: "album",
  TRCK: "trackNumber",
  TDRC: "year",
  TYER: "year",
  TCON: "genre"
};

let settings = {};
let library = emptyLibrary();
let favorites = { tracks: [] };
let playlists = [];
let scanState = {
  active: false,
  startedAt: null,
  finishedAt: null,
  error: null
};

function emptyLibrary() {
  return {
    generatedAt: null,
    root: null,
    stats: {
      tracks: 0,
      albums: 0,
      artists: 0,
      totalBytes: 0
    },
    tracks: [],
    albums: [],
    artists: [],
    genres: []
  };
}

async function main() {
  await ensureDataFiles();
  settings = await readJson(SETTINGS_FILE, defaultSettings());
  library = await readJson(LIBRARY_FILE, emptyLibrary());
  favorites = await readJson(FAVORITES_FILE, { tracks: [] });
  playlists = await readJson(PLAYLISTS_FILE, []);

  if (process.env.TRACKVAULT_LIBRARY && !settings.libraryPath) {
    settings.libraryPath = resolveUserPath(process.env.TRACKVAULT_LIBRARY);
    await writeJson(SETTINGS_FILE, settings);
  }

  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`TrackVault listening on http://localhost:${PORT}`);
    console.log(`Admin UI: http://localhost:${PORT}/admin`);
    console.log(`Client UI: http://localhost:${PORT}/app`);
  });

  if (settings.scanOnStart) {
    performScan().catch((error) => {
      console.warn(`Startup scan failed: ${error.message}`);
    });
  }
}

function defaultSettings() {
  return {
    serverName: "TrackVault",
    libraryPath: resolveUserPath(process.env.TRACKVAULT_LIBRARY || path.join(ROOT, "library")),
    scanOnStart: false
  };
}

async function ensureDataFiles() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(path.join(ROOT, "library"), { recursive: true });
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not read ${file}: ${error.message}`);
    }
    return fallback;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveUserPath(input) {
  if (!input || typeof input !== "string") {
    return path.join(ROOT, "library");
  }
  const expanded = input.replace(/^~(?=$|[\\/])/, os.homedir());
  return path.resolve(ROOT, expanded);
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      return redirect(res, "/app");
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(req, res, url);
    }

    return serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Internal server error" });
  }
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/status") {
    return sendJson(res, 200, statusPayload());
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    return sendJson(res, 200, publicSettings());
  }

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    const body = await readBody(req);
    if (typeof body.serverName === "string" && body.serverName.trim()) {
      settings.serverName = body.serverName.trim().slice(0, 80);
    }
    if (typeof body.libraryPath === "string" && body.libraryPath.trim()) {
      settings.libraryPath = resolveUserPath(body.libraryPath.trim());
    }
    settings.scanOnStart = Boolean(body.scanOnStart);
    await writeJson(SETTINGS_FILE, settings);
    return sendJson(res, 200, publicSettings());
  }

  if (req.method === "POST" && url.pathname === "/api/scan") {
    return runScan(res);
  }

  if (req.method === "GET" && url.pathname === "/api/library") {
    return sendJson(res, 200, filteredLibrary(url.searchParams));
  }

  if (req.method === "GET" && url.pathname === "/api/favorites") {
    return sendJson(res, 200, { tracks: favorites.tracks });
  }

  const favoriteMatch = url.pathname.match(/^\/api\/favorites\/([^/]+)$/);
  if (favoriteMatch && req.method === "POST") {
    const trackId = decodeURIComponent(favoriteMatch[1]);
    const body = await readBody(req);
    const set = new Set(favorites.tracks);
    const nextValue = typeof body.favorite === "boolean" ? body.favorite : !set.has(trackId);
    if (nextValue) {
      set.add(trackId);
    } else {
      set.delete(trackId);
    }
    favorites.tracks = Array.from(set);
    await writeJson(FAVORITES_FILE, favorites);
    return sendJson(res, 200, { trackId, favorite: nextValue, tracks: favorites.tracks });
  }

  if (req.method === "GET" && url.pathname === "/api/playlists") {
    return sendJson(res, 200, { playlists: playlists.map(publicPlaylist) });
  }

  if (req.method === "POST" && url.pathname === "/api/playlists") {
    const body = await readBody(req);
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) {
      return sendJson(res, 400, { error: "Playlist name is required" });
    }
    const playlist = { id: hash(`${Date.now()}:${name}`), name, trackIds: [], createdAt: new Date().toISOString() };
    playlists.push(playlist);
    await writeJson(PLAYLISTS_FILE, playlists);
    return sendJson(res, 201, publicPlaylist(playlist));
  }

  const playlistTrackMatch = url.pathname.match(/^\/api\/playlists\/([^/]+)\/tracks(?:\/([^/]+))?$/);
  if (playlistTrackMatch) {
    const playlist = playlists.find((item) => item.id === decodeURIComponent(playlistTrackMatch[1]));
    if (!playlist) {
      return sendJson(res, 404, { error: "Playlist not found" });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const trackId = String(body.trackId || "");
      if (!trackById(trackId)) {
        return sendJson(res, 404, { error: "Track not found" });
      }
      if (!playlist.trackIds.includes(trackId)) {
        playlist.trackIds.push(trackId);
      }
      await writeJson(PLAYLISTS_FILE, playlists);
      return sendJson(res, 200, publicPlaylist(playlist));
    }
    if (req.method === "DELETE" && playlistTrackMatch[2]) {
      const trackId = decodeURIComponent(playlistTrackMatch[2]);
      playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
      await writeJson(PLAYLISTS_FILE, playlists);
      return sendJson(res, 200, publicPlaylist(playlist));
    }
  }

  const trackStreamMatch = url.pathname.match(/^\/api\/tracks\/([^/]+)\/stream$/);
  if (trackStreamMatch && req.method === "GET") {
    return streamTrack(req, res, decodeURIComponent(trackStreamMatch[1]));
  }

  const trackMatch = url.pathname.match(/^\/api\/tracks\/([^/]+)$/);
  if (trackMatch && req.method === "GET") {
    const track = trackById(decodeURIComponent(trackMatch[1]));
    if (!track) {
      return sendJson(res, 404, { error: "Track not found" });
    }
    return sendJson(res, 200, publicTrack(track));
  }

  const albumArtMatch = url.pathname.match(/^\/api\/albums\/([^/]+)\/art$/);
  if (albumArtMatch && req.method === "GET") {
    return serveAlbumArt(res, decodeURIComponent(albumArtMatch[1]));
  }

  return sendJson(res, 404, { error: "Not found" });
}

async function runScan(res) {
  if (scanState.active) {
    return sendJson(res, 409, { error: "Scan already running", scan: scanState });
  }

  try {
    const status = await performScan();
    return sendJson(res, 200, status);
  } catch (error) {
    return sendJson(res, 500, { error: error.message, scan: scanState });
  }
}

async function performScan() {
  scanState = { active: true, startedAt: new Date().toISOString(), finishedAt: null, error: null };

  try {
    const nextLibrary = await scanLibrary(settings.libraryPath);
    library = nextLibrary;
    await writeJson(LIBRARY_FILE, library);
    scanState = { ...scanState, active: false, finishedAt: new Date().toISOString() };
    return statusPayload();
  } catch (error) {
    scanState = { ...scanState, active: false, finishedAt: new Date().toISOString(), error: error.message };
    throw error;
  }
}

async function scanLibrary(rootPath) {
  const resolvedRoot = resolveUserPath(rootPath);
  const rootStat = await fsp.stat(resolvedRoot);
  if (!rootStat.isDirectory()) {
    throw new Error("Library path is not a directory");
  }

  const tracks = [];
  await walkAudioFiles(resolvedRoot, async (filePath, stat) => {
    const track = await buildTrack(resolvedRoot, filePath, stat);
    tracks.push(track);
  });

  tracks.sort((a, b) => {
    const albumCompare = compareText(a.album, b.album);
    if (albumCompare) return albumCompare;
    const trackCompare = Number(a.trackNumber || 0) - Number(b.trackNumber || 0);
    if (trackCompare) return trackCompare;
    return compareText(a.title, b.title);
  });

  const albums = buildAlbums(tracks);
  const artists = buildArtists(tracks);
  const genres = Array.from(new Set(tracks.map((track) => track.genre).filter(Boolean))).sort(compareText);

  return {
    generatedAt: new Date().toISOString(),
    root: resolvedRoot,
    stats: {
      tracks: tracks.length,
      albums: albums.length,
      artists: artists.length,
      totalBytes: tracks.reduce((total, track) => total + track.size, 0)
    },
    tracks,
    albums,
    artists,
    genres
  };
}

async function walkAudioFiles(dir, onFile) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAudioFiles(fullPath, onFile);
      continue;
    }
    if (!entry.isFile() || !AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }
    const stat = await fsp.stat(fullPath);
    await onFile(fullPath, stat);
  }
}

async function buildTrack(rootPath, filePath, stat) {
  const relativePath = path.relative(rootPath, filePath);
  const fallback = metadataFromPath(relativePath);
  const embedded = await readEmbeddedMetadata(filePath).catch(() => ({}));
  const artist = firstText(embedded.artist, fallback.artist, "Unknown Artist");
  const album = firstText(embedded.album, fallback.album, "Unknown Album");
  const title = firstText(embedded.title, fallback.title, path.basename(filePath, path.extname(filePath)));
  const trackNumber = parseTrackNumber(embedded.trackNumber || fallback.trackNumber);

  return {
    id: hash(path.resolve(filePath)),
    albumId: hash(`${artist}\0${album}`),
    artistId: hash(artist),
    title,
    artist,
    album,
    trackNumber,
    year: firstText(embedded.year, fallback.year, ""),
    genre: firstText(embedded.genre, ""),
    relativePath,
    fullPath: path.resolve(filePath),
    extension: path.extname(filePath).slice(1).toLowerCase(),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    duration: null
  };
}

function metadataFromPath(relativePath) {
  const parsed = path.parse(relativePath);
  const parts = relativePath.split(path.sep);
  const fileName = parsed.name.replace(/[_]+/g, " ").trim();
  let title = fileName;
  let artist = "";
  let album = "";
  let trackNumber = "";

  if (parts.length >= 2) {
    album = parts[parts.length - 2];
  }
  if (parts.length >= 3) {
    artist = parts[parts.length - 3];
  }

  const trackMatch = title.match(/^(\d{1,3})(?:[.\-_\s]+)(.+)$/);
  if (trackMatch) {
    trackNumber = trackMatch[1];
    title = trackMatch[2].trim();
  }

  const artistTitleMatch = title.match(/^(.+?)\s+-\s+(.+)$/);
  if (!artist && artistTitleMatch) {
    artist = artistTitleMatch[1].trim();
    title = artistTitleMatch[2].trim();
  }

  return {
    title: cleanText(title),
    artist: cleanText(artist),
    album: cleanText(album),
    trackNumber
  };
}

async function readEmbeddedMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp3") {
    return {
      ...(await readId3v1(filePath)),
      ...(await readId3v2(filePath))
    };
  }
  if (ext === ".flac") {
    return readFlacComments(filePath);
  }
  return {};
}

async function readId3v1(filePath) {
  const handle = await fsp.open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (stat.size < 128) {
      return {};
    }
    const buffer = Buffer.alloc(128);
    await handle.read(buffer, 0, 128, stat.size - 128);
    if (buffer.toString("latin1", 0, 3) !== "TAG") {
      return {};
    }
    const metadata = {
      title: decodeLatin1(buffer.subarray(3, 33)),
      artist: decodeLatin1(buffer.subarray(33, 63)),
      album: decodeLatin1(buffer.subarray(63, 93)),
      year: decodeLatin1(buffer.subarray(93, 97))
    };
    if (buffer[125] === 0 && buffer[126] > 0) {
      metadata.trackNumber = String(buffer[126]);
    }
    return compactObject(metadata);
  } finally {
    await handle.close();
  }
}

async function readId3v2(filePath) {
  const handle = await fsp.open(filePath, "r");
  try {
    const header = Buffer.alloc(10);
    const { bytesRead } = await handle.read(header, 0, 10, 0);
    if (bytesRead !== 10 || header.toString("latin1", 0, 3) !== "ID3") {
      return {};
    }
    const version = header[3];
    if (version < 3 || version > 4) {
      return {};
    }
    const tagSize = synchsafeToInt(header.subarray(6, 10));
    const readSize = Math.min(tagSize, 1024 * 1024);
    const tag = Buffer.alloc(readSize);
    await handle.read(tag, 0, readSize, 10);

    const metadata = {};
    let offset = 0;
    while (offset + 10 <= tag.length) {
      const frameId = tag.toString("latin1", offset, offset + 4);
      if (!/^[A-Z0-9]{4}$/.test(frameId)) {
        break;
      }
      const frameSize = version === 4 ? synchsafeToInt(tag.subarray(offset + 4, offset + 8)) : tag.readUInt32BE(offset + 4);
      offset += 10;
      if (frameSize <= 0 || offset + frameSize > tag.length) {
        break;
      }
      const frameData = tag.subarray(offset, offset + frameSize);
      if (TEXT_FRAME_IDS[frameId]) {
        metadata[TEXT_FRAME_IDS[frameId]] = decodeTextFrame(frameData);
      }
      offset += frameSize;
    }
    return compactObject(metadata);
  } finally {
    await handle.close();
  }
}

function decodeTextFrame(buffer) {
  if (!buffer.length) {
    return "";
  }
  const encoding = buffer[0];
  const data = buffer.subarray(1);
  if (encoding === 1) {
    return cleanText(data.toString("utf16le"));
  }
  if (encoding === 2) {
    return cleanText(swap16(data).toString("utf16le"));
  }
  if (encoding === 3) {
    return cleanText(data.toString("utf8"));
  }
  return decodeLatin1(data);
}

function swap16(buffer) {
  const output = Buffer.from(buffer);
  for (let index = 0; index + 1 < output.length; index += 2) {
    const byte = output[index];
    output[index] = output[index + 1];
    output[index + 1] = byte;
  }
  return output;
}

async function readFlacComments(filePath) {
  const handle = await fsp.open(filePath, "r");
  try {
    const header = Buffer.alloc(4);
    await handle.read(header, 0, 4, 0);
    if (header.toString("latin1") !== "fLaC") {
      return {};
    }
    let offset = 4;
    let last = false;
    while (!last && offset < 1024 * 1024) {
      const blockHeader = Buffer.alloc(4);
      await handle.read(blockHeader, 0, 4, offset);
      last = Boolean(blockHeader[0] & 0x80);
      const type = blockHeader[0] & 0x7f;
      const length = blockHeader.readUIntBE(1, 3);
      offset += 4;
      if (type === 4) {
        const block = Buffer.alloc(length);
        await handle.read(block, 0, length, offset);
        return parseVorbisCommentBlock(block);
      }
      offset += length;
    }
    return {};
  } finally {
    await handle.close();
  }
}

function parseVorbisCommentBlock(buffer) {
  let offset = 0;
  if (offset + 4 > buffer.length) return {};
  const vendorLength = buffer.readUInt32LE(offset);
  offset += 4 + vendorLength;
  if (offset + 4 > buffer.length) return {};
  const count = buffer.readUInt32LE(offset);
  offset += 4;
  const metadata = {};
  const keyMap = {
    TITLE: "title",
    ARTIST: "artist",
    ALBUM: "album",
    TRACKNUMBER: "trackNumber",
    DATE: "year",
    YEAR: "year",
    GENRE: "genre"
  };
  for (let index = 0; index < count && offset + 4 <= buffer.length; index += 1) {
    const length = buffer.readUInt32LE(offset);
    offset += 4;
    if (offset + length > buffer.length) break;
    const comment = buffer.toString("utf8", offset, offset + length);
    offset += length;
    const equalsIndex = comment.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = comment.slice(0, equalsIndex).toUpperCase();
    const value = comment.slice(equalsIndex + 1);
    if (keyMap[key] && !metadata[keyMap[key]]) {
      metadata[keyMap[key]] = value;
    }
  }
  return compactObject(metadata);
}

function buildAlbums(tracks) {
  const map = new Map();
  for (const track of tracks) {
    if (!map.has(track.albumId)) {
      map.set(track.albumId, {
        id: track.albumId,
        title: track.album,
        artist: track.artist,
        artistId: track.artistId,
        year: track.year,
        genre: track.genre,
        trackIds: [],
        trackCount: 0,
        size: 0
      });
    }
    const album = map.get(track.albumId);
    album.trackIds.push(track.id);
    album.trackCount += 1;
    album.size += track.size;
    if (!album.year && track.year) album.year = track.year;
    if (!album.genre && track.genre) album.genre = track.genre;
  }
  return Array.from(map.values()).sort((a, b) => compareText(a.artist, b.artist) || compareText(a.title, b.title));
}

function buildArtists(tracks) {
  const map = new Map();
  for (const track of tracks) {
    if (!map.has(track.artistId)) {
      map.set(track.artistId, {
        id: track.artistId,
        name: track.artist,
        albumIds: new Set(),
        trackCount: 0,
        size: 0
      });
    }
    const artist = map.get(track.artistId);
    artist.albumIds.add(track.albumId);
    artist.trackCount += 1;
    artist.size += track.size;
  }
  return Array.from(map.values())
    .map((artist) => ({ ...artist, albumIds: Array.from(artist.albumIds), albumCount: artist.albumIds.size }))
    .sort((a, b) => compareText(a.name, b.name));
}

function filteredLibrary(searchParams) {
  const query = normalize(searchParams.get("q") || "");
  const artistId = searchParams.get("artistId");
  const albumId = searchParams.get("albumId");
  const genre = normalize(searchParams.get("genre") || "");
  const favoriteOnly = searchParams.get("favorite") === "true";
  const favoriteSet = new Set(favorites.tracks);

  const tracks = library.tracks.filter((track) => {
    if (artistId && track.artistId !== artistId) return false;
    if (albumId && track.albumId !== albumId) return false;
    if (genre && normalize(track.genre) !== genre) return false;
    if (favoriteOnly && !favoriteSet.has(track.id)) return false;
    if (!query) return true;
    return [track.title, track.artist, track.album, track.genre].some((value) => normalize(value).includes(query));
  });

  const trackAlbumIds = new Set(tracks.map((track) => track.albumId));
  const trackArtistIds = new Set(tracks.map((track) => track.artistId));

  return {
    ...statusPayload(),
    tracks: tracks.map(publicTrack),
    albums: library.albums.filter((album) => trackAlbumIds.has(album.id)).map(publicAlbum),
    artists: library.artists.filter((artist) => trackArtistIds.has(artist.id)).map(publicArtist),
    genres: library.genres
  };
}

function statusPayload() {
  return {
    settings: publicSettings(),
    library: {
      generatedAt: library.generatedAt,
      root: library.root,
      stats: library.stats,
      genres: library.genres
    },
    scan: scanState,
    favorites: {
      count: favorites.tracks.length
    },
    playlists: {
      count: playlists.length
    }
  };
}

function publicSettings() {
  return {
    serverName: settings.serverName || "TrackVault",
    libraryPath: settings.libraryPath || path.join(ROOT, "library"),
    scanOnStart: Boolean(settings.scanOnStart)
  };
}

function publicTrack(track) {
  return {
    id: track.id,
    albumId: track.albumId,
    artistId: track.artistId,
    title: track.title,
    artist: track.artist,
    album: track.album,
    trackNumber: track.trackNumber,
    year: track.year,
    genre: track.genre,
    relativePath: track.relativePath,
    extension: track.extension,
    size: track.size,
    duration: track.duration,
    streamUrl: `/api/tracks/${encodeURIComponent(track.id)}/stream`,
    artUrl: `/api/albums/${encodeURIComponent(track.albumId)}/art`
  };
}

function publicAlbum(album) {
  return {
    id: album.id,
    title: album.title,
    artist: album.artist,
    artistId: album.artistId,
    year: album.year,
    genre: album.genre,
    trackIds: album.trackIds,
    trackCount: album.trackCount,
    size: album.size,
    artUrl: `/api/albums/${encodeURIComponent(album.id)}/art`
  };
}

function publicArtist(artist) {
  return {
    id: artist.id,
    name: artist.name,
    albumIds: artist.albumIds,
    albumCount: artist.albumCount,
    trackCount: artist.trackCount,
    size: artist.size
  };
}

function publicPlaylist(playlist) {
  return {
    id: playlist.id,
    name: playlist.name,
    trackIds: playlist.trackIds,
    createdAt: playlist.createdAt,
    trackCount: playlist.trackIds.length
  };
}

function trackById(id) {
  return library.tracks.find((track) => track.id === id);
}

async function streamTrack(req, res, trackId) {
  const track = trackById(trackId);
  if (!track) {
    return sendJson(res, 404, { error: "Track not found" });
  }

  let stat;
  try {
    stat = await fsp.stat(track.fullPath);
  } catch {
    return sendJson(res, 404, { error: "Audio file missing from disk" });
  }

  const contentType = audioContentType(track.extension);
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600"
    });
    fs.createReadStream(track.fullPath).pipe(res);
    return;
  }

  const match = range.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
    res.end();
    return;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : stat.size - 1;
  if (start >= stat.size || end >= stat.size || start > end) {
    res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
    res.end();
    return;
  }

  res.writeHead(206, {
    "Content-Type": contentType,
    "Content-Length": end - start + 1,
    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600"
  });
  fs.createReadStream(track.fullPath, { start, end }).pipe(res);
}

async function serveAlbumArt(res, albumId) {
  const album = library.albums.find((item) => item.id === albumId);
  const firstTrack = album ? trackById(album.trackIds[0]) : null;
  if (firstTrack) {
    const embedded = await readEmbeddedArt(firstTrack.fullPath).catch(() => null);
    if (embedded) {
      res.writeHead(200, {
        "Content-Type": embedded.mime,
        "Content-Length": embedded.data.length,
        "Cache-Control": "private, max-age=86400"
      });
      res.end(embedded.data);
      return;
    }
  }

  const svg = generatedAlbumSvg(albumId, album ? album.title : "TrackVault", album ? album.artist : "Music");
  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Content-Length": Buffer.byteLength(svg),
    "Cache-Control": "private, max-age=86400"
  });
  res.end(svg);
}

async function readEmbeddedArt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp3") {
    return readId3Art(filePath);
  }
  if (ext === ".flac") {
    return readFlacPicture(filePath);
  }
  return null;
}

async function readId3Art(filePath) {
  const handle = await fsp.open(filePath, "r");
  try {
    const header = Buffer.alloc(10);
    const { bytesRead } = await handle.read(header, 0, 10, 0);
    if (bytesRead !== 10 || header.toString("latin1", 0, 3) !== "ID3") {
      return null;
    }
    const version = header[3];
    if (version < 3 || version > 4) {
      return null;
    }
    const tagSize = synchsafeToInt(header.subarray(6, 10));
    const readSize = Math.min(tagSize, 4 * 1024 * 1024);
    const tag = Buffer.alloc(readSize);
    await handle.read(tag, 0, readSize, 10);
    let offset = 0;
    while (offset + 10 <= tag.length) {
      const frameId = tag.toString("latin1", offset, offset + 4);
      const frameSize = version === 4 ? synchsafeToInt(tag.subarray(offset + 4, offset + 8)) : tag.readUInt32BE(offset + 4);
      offset += 10;
      if (frameId === "APIC" && frameSize > 0 && offset + frameSize <= tag.length) {
        return parseApic(tag.subarray(offset, offset + frameSize));
      }
      if (frameSize <= 0 || offset + frameSize > tag.length) {
        break;
      }
      offset += frameSize;
    }
    return null;
  } finally {
    await handle.close();
  }
}

function parseApic(buffer) {
  if (buffer.length < 5) {
    return null;
  }
  const encoding = buffer[0];
  let offset = 1;
  const mimeEnd = buffer.indexOf(0, offset);
  if (mimeEnd === -1) return null;
  const mime = buffer.toString("latin1", offset, mimeEnd) || "image/jpeg";
  offset = mimeEnd + 2;
  if (encoding === 1 || encoding === 2) {
    while (offset + 1 < buffer.length) {
      if (buffer[offset] === 0 && buffer[offset + 1] === 0) {
        offset += 2;
        break;
      }
      offset += 2;
    }
  } else {
    const descriptionEnd = buffer.indexOf(0, offset);
    if (descriptionEnd === -1) return null;
    offset = descriptionEnd + 1;
  }
  if (offset >= buffer.length) return null;
  return { mime, data: buffer.subarray(offset) };
}

async function readFlacPicture(filePath) {
  const handle = await fsp.open(filePath, "r");
  try {
    const header = Buffer.alloc(4);
    await handle.read(header, 0, 4, 0);
    if (header.toString("latin1") !== "fLaC") {
      return null;
    }
    let offset = 4;
    let last = false;
    while (!last && offset < 8 * 1024 * 1024) {
      const blockHeader = Buffer.alloc(4);
      await handle.read(blockHeader, 0, 4, offset);
      last = Boolean(blockHeader[0] & 0x80);
      const type = blockHeader[0] & 0x7f;
      const length = blockHeader.readUIntBE(1, 3);
      offset += 4;
      if (type === 6) {
        const block = Buffer.alloc(length);
        await handle.read(block, 0, length, offset);
        return parseFlacPicture(block);
      }
      offset += length;
    }
    return null;
  } finally {
    await handle.close();
  }
}

function parseFlacPicture(buffer) {
  let offset = 0;
  if (buffer.length < 32) return null;
  offset += 4;
  const mimeLength = buffer.readUInt32BE(offset);
  offset += 4;
  const mime = buffer.toString("utf8", offset, offset + mimeLength);
  offset += mimeLength;
  const descriptionLength = buffer.readUInt32BE(offset);
  offset += 4 + descriptionLength + 16;
  if (offset + 4 > buffer.length) return null;
  const dataLength = buffer.readUInt32BE(offset);
  offset += 4;
  if (offset + dataLength > buffer.length) return null;
  return { mime: mime || "image/jpeg", data: buffer.subarray(offset, offset + dataLength) };
}

function generatedAlbumSvg(seed, title, artist) {
  const palette = colorPalette(seed);
  const initials = initialsFrom(title);
  const escapedTitle = escapeXml(title);
  const escapedArtist = escapeXml(artist);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${escapedTitle}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${palette[0]}"/>
      <stop offset="0.58" stop-color="${palette[1]}"/>
      <stop offset="1" stop-color="${palette[2]}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="34" fill="url(#g)"/>
  <circle cx="372" cy="138" r="84" fill="rgba(255,255,255,.22)"/>
  <circle cx="150" cy="374" r="128" fill="rgba(0,0,0,.16)"/>
  <text x="48" y="238" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="106" font-weight="800">${escapeXml(initials)}</text>
  <text x="52" y="392" fill="rgba(255,255,255,.92)" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700">${truncateXml(escapedTitle, 18)}</text>
  <text x="52" y="435" fill="rgba(255,255,255,.72)" font-family="Arial, Helvetica, sans-serif" font-size="24">${truncateXml(escapedArtist, 24)}</text>
</svg>`;
}

function colorPalette(seed) {
  const palettes = [
    ["#0f766e", "#d97706", "#111827"],
    ["#be123c", "#f59e0b", "#1f2937"],
    ["#2563eb", "#16a34a", "#18181b"],
    ["#7c2d12", "#0891b2", "#27272a"],
    ["#4338ca", "#dc2626", "#0f172a"],
    ["#047857", "#c2410c", "#1f2937"]
  ];
  return palettes[parseInt(seed.slice(0, 2), 16) % palettes.length];
}

function initialsFrom(value) {
  const words = String(value || "TV").match(/[a-z0-9]+/gi) || ["TV"];
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join("");
}

function audioContentType(extension) {
  return {
    mp3: "audio/mpeg",
    flac: "audio/flac",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    webm: "audio/webm"
  }[extension] || "application/octet-stream";
}

async function serveStatic(req, res, pathname) {
  const routes = {
    "/app": "app.html",
    "/admin": "admin.html"
  };
  const normalized = routes[pathname] || pathname.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, normalized);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendText(res, 403, "Forbidden");
  }
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      return sendText(res, 404, "Not found");
    }
    res.writeHead(200, {
      "Content-Type": staticContentType(path.extname(filePath)),
      "Content-Length": stat.size,
      "Cache-Control": filePath.endsWith(".html") ? "no-cache" : "private, max-age=3600"
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error.code === "ENOENT") {
      return sendText(res, 404, "Not found");
    }
    throw error;
  }
}

function staticContentType(ext) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webmanifest": "application/manifest+json; charset=utf-8"
  }[ext.toLowerCase()] || "application/octet-stream";
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function hash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 16);
}

function synchsafeToInt(buffer) {
  return ((buffer[0] & 0x7f) << 21) | ((buffer[1] & 0x7f) << 14) | ((buffer[2] & 0x7f) << 7) | (buffer[3] & 0x7f);
}

function decodeLatin1(buffer) {
  return cleanText(buffer.toString("latin1"));
}

function cleanText(value) {
  return String(value || "").replace(/\0/g, "").replace(/\s+/g, " ").trim();
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function parseTrackNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => cleanText(item)));
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateXml(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
