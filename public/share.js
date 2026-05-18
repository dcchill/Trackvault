(async function() {
  const token = window.location.pathname.split("/").pop();
  let tracks = [];
  let currentIndex = 0;

  const nodes = {
    loading: document.querySelector("#loading"),
    error: document.querySelector("#error"),
    content: document.querySelector("#content"),
    art: document.querySelector("#art"),
    title: document.querySelector("#title"),
    subtitle: document.querySelector("#subtitle"),
    audio: document.querySelector("#audio"),
    playToggle: document.querySelector("#play-toggle"),
    seekSlider: document.querySelector("#seek-slider"),
    currentTime: document.querySelector("#current-time"),
    durationTime: document.querySelector("#duration-time"),
    trackList: document.querySelector("#track-list"),
    prevBtn: document.querySelector("#prev-btn"),
    nextBtn: document.querySelector("#next-btn")
  };

  try {
    const response = await fetch(`/api/public/shares/${token}`);
    if (!response.ok) throw new Error(await response.text() || "Share not found or expired");
    
    const data = await response.json();
    
    if (data.type === "track") {
      tracks = [data.track];
    } else if (data.type === "playlist" || data.type === "album") {
      tracks = data.tracks;
      if (tracks.length === 0) throw new Error("Empty collection");
      
      const contextName = data.type === "playlist" ? data.playlist.name : data.album.title;
      nodes.subtitle.textContent = `From ${data.type}: ${contextName}`;
      
      nodes.trackList.style.display = "block";
      nodes.prevBtn.style.display = "block";
      nodes.nextBtn.style.display = "block";
      
      renderTrackList();
    }

    loadTrack(0);
    
    nodes.loading.style.display = "none";
    nodes.content.style.display = "block";

    nodes.playToggle.addEventListener("click", () => {
      if (nodes.audio.paused) {
        nodes.audio.play();
      } else {
        nodes.audio.pause();
      }
    });

    nodes.prevBtn.addEventListener("click", () => playIndex(currentIndex - 1));
    nodes.nextBtn.addEventListener("click", () => playIndex(currentIndex + 1));

    nodes.audio.addEventListener("play", () => nodes.playToggle.textContent = "Pause");
    nodes.audio.addEventListener("pause", () => nodes.playToggle.textContent = "Play");
    nodes.audio.addEventListener("ended", () => {
      if (currentIndex < tracks.length - 1) {
        playIndex(currentIndex + 1);
      }
    });

    nodes.audio.addEventListener("timeupdate", () => {
      const current = nodes.audio.currentTime;
      const duration = nodes.audio.duration || 0;
      nodes.currentTime.textContent = formatTime(current);
      nodes.durationTime.textContent = formatTime(duration);
      if (duration > 0) {
        nodes.seekSlider.value = Math.floor((current / duration) * 1000);
      }
    });

    nodes.seekSlider.addEventListener("input", () => {
      const duration = nodes.audio.duration || 0;
      if (duration > 0) {
        nodes.audio.currentTime = (nodes.seekSlider.value / 1000) * duration;
      }
    });

  } catch (err) {
    nodes.loading.style.display = "none";
    nodes.error.textContent = err.message;
    nodes.error.style.display = "block";
  }

  function loadTrack(index) {
    if (index < 0 || index >= tracks.length) return;
    currentIndex = index;
    const track = tracks[currentIndex];
    
    nodes.title.textContent = track.title;
    if (tracks.length === 1) {
      nodes.subtitle.textContent = `${track.artist} — ${track.album}`;
    }
    nodes.art.src = track.artUrl;
    nodes.audio.src = `/api/public/stream/${token}?trackId=${encodeURIComponent(track.id)}`;
    
    updateActiveItem();
    nodes.prevBtn.disabled = currentIndex === 0;
    nodes.nextBtn.disabled = currentIndex === tracks.length - 1;
  }

  function playIndex(index) {
    if (index < 0 || index >= tracks.length) return;
    loadTrack(index);
    nodes.audio.play().catch(() => {});
  }

  function renderTrackList() {
    nodes.trackList.innerHTML = tracks.map((track, i) => `
      <div class="share-item" data-index="${i}">
        <strong>${i + 1}. ${track.title}</strong>
        <span class="muted" style="margin-left: auto;">${track.artist}</span>
      </div>
    `).join("");

    nodes.trackList.querySelectorAll(".share-item").forEach(item => {
      item.addEventListener("click", () => playIndex(parseInt(item.dataset.index)));
    });
  }

  function updateActiveItem() {
    nodes.trackList.querySelectorAll(".share-item").forEach((item, i) => {
      item.classList.toggle("active", i === currentIndex);
    });
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
})();
