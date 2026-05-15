# TrackVault on TrueNAS SCALE

This package targets **TrueNAS SCALE** as a Docker-based custom app.

It is not a TrueNAS CORE jail/plugin. CORE plugins are obsolete; SCALE Apps/custom YAML is the practical deployment path.

## Build the Image

From this repository:

```powershell
docker build -t trackvault:latest .
```

For a TrueNAS system, either push that image to a registry and replace `trackvault:latest` in `compose.yaml`, or build/import the image on the TrueNAS host.

## Datasets

Create datasets similar to:

- `/mnt/POOL/apps/trackvault/data` for TrackVault state
- `/mnt/POOL/media/music` for your music library

Edit `deploy/truenas/compose.yaml` and replace `POOL` and paths with your real dataset paths.

## Install as a SCALE Custom App

In TrueNAS SCALE:

1. Go to **Apps**.
2. Use **Install via YAML**.
3. Paste the contents of `deploy/truenas/compose.yaml`.
4. Update dataset paths and image name if needed.
5. Save/deploy.
6. Open `http://TRUENAS-IP:8096/app`.

The container stores `settings.json`, `library.json`, `favorites.json`, and `playlists.json` in `/data`.

## Notes

- The music mount is read-only by default.
- Change the host port if `8096` conflicts with another app.
- In the TrackVault admin UI, the library path inside the container should be `/music`.
- If your SCALE version expects Compose YAML, use `deploy/truenas/compose.yaml` directly.
