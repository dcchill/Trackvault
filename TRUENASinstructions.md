# TrackVault on TrueNAS SCALE

TrackVault installs on **TrueNAS SCALE 24.10 or newer** as a Docker Compose custom app.

This is not a TrueNAS CORE jail/plugin. The practical SCALE path is **Apps > Install via YAML**.

## Easiest Install

Use `trackvault.yaml` for normal installs. Users do not need to build the image.

1. In TrueNAS, create or choose these paths:
   - `/mnt/POOL/apps/trackvault/data`
   - `/mnt/POOL/media/music`
2. Edit `deploy/truenas/trackvault.yaml`:
   - replace `POOL` with your real pool name
   - change the music path if your music is in a different dataset
   - change port `8096` if needed
3. TrueNAS: **Apps > Discover Apps > more menu > Install via YAML**.
4. Paste the edited `trackvault.yaml` and save.
5. Open `http://TRUENAS-IP:8096/app`.

The admin UI is at `http://TRUENAS-IP:8096/admin`.

## Local Image Install

Use this only if you do not want to publish a Docker image.

From a shell on the TrueNAS host, inside the TrackVault repository:

```sh
docker build -t trackvault:latest .
```

Then install with `deploy/truenas/trackvault-local-image.yaml`.

That YAML has:

```yaml
pull_policy: never
```

so TrueNAS uses the local `trackvault:latest` image instead of trying to pull it from Docker Hub.

## Dataset Helper

If you are using SSH on TrueNAS, this creates the expected folders:

```sh
sh deploy/truenas/prepare-datasets.sh POOL
```

Example:

```sh
sh deploy/truenas/prepare-datasets.sh tank
```

Put your music files in:

```text
/mnt/POOL/media/music
```

TrackVault writes its state here:

```text
/mnt/POOL/apps/trackvault/data
```

## Files

- `trackvault.yaml`: recommended YAML for a published GHCR image.
- `trackvault-local-image.yaml`: fallback YAML for a locally built image.
- `prepare-datasets.sh`: optional helper for creating TrueNAS dataset mount folders.
- `compose.yaml`: older simple compose example.

## Notes

- The music mount is read-only by default.
- In the TrackVault admin UI, the library path inside the container should be `/music`.
- If the app fails to deploy, check `/var/log/app_lifecycle.log` on TrueNAS.
