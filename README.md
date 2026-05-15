# TrackVault

## Support your artists

TrackVault does not support pirating music, acquire your music legally and support artists.

To acquire music files check out

- https://bandcamp.com/
- https://www.qobuz.com/us-en/discover

If you are going to pirate music, at least support the artist and buy their albums first.

TrackVault is a self-hosted music server with two browser UIs:

- `http://localhost:8096/admin` for server settings, scans, and library health
- `http://localhost:8096/app` for browsing and playing the music library

It runs on built-in Node.js APIs and stores local state in `.trackvault/`.

## Run

On Windows, double-click `Start TrackVault.bat`. It starts the server and opens the player UI.

Or run it from PowerShell:

```powershell
npm start
```

By default TrackVault scans `./library`. You can change the library path in the admin UI or set it before launch:

```powershell
$env:TRACKVAULT_LIBRARY="D:\Music"
npm start
```

Optional environment variables:

- `PORT`: server port, defaults to `8096`
- `TRACKVAULT_LIBRARY`: initial music library path
- `TRACKVAULT_DATA`: state directory, defaults to `.trackvault`

Supported scan extensions include `.mp3`, `.flac`, `.m4a`, `.aac`, `.wav`, `.ogg`, `.opus`, and `.webm`.
