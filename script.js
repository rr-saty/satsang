(function () {
  const LS_VIDEOS = 'satsang_videos';
  const LS_VISITS = 'satsang_visits';
  const LS_INDEX = 'satsang_index';

  let player = null;
  let selectedVideos = [];

  if (!CONFIG.YOUTUBE_API_KEY) {
    document.getElementById('api-key-missing').classList.remove('hidden');
    return;
  }

  document.getElementById('app').classList.remove('hidden');

  function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function parseISO8601(dur) {
    const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + (parseInt(m[3] || 0));
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function selectVideos(videos) {
    const pool = shuffle([...videos]);
    let best = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const shuffled = attempt === 0 ? pool : shuffle([...videos]);
      const picked = [];
      let total = 0;
      for (const v of shuffled) {
        picked.push(v);
        total += v.duration;
        if (picked.length >= CONFIG.MIN_VIDEOS && total >= CONFIG.MIN_DURATION) break;
      }
      if (total >= CONFIG.MIN_DURATION && picked.length >= CONFIG.MIN_VIDEOS) {
        best = picked;
        break;
      }
      if (!best || total > best.reduce((s, v) => s + v.duration, 0)) {
        best = picked;
      }
    }
    return best || pool.slice(0, CONFIG.MIN_VIDEOS);
  }

  async function fetchAllVideos() {
    const all = [];
    for (const ch of CONFIG.CHANNELS) {
      try {
        const items = await fetchChannelVideos(ch.id);
        items.forEach(v => v.channelName = ch.name);
        all.push(...items);
      } catch (e) {
        console.warn('Failed fetching channel', ch.name, e);
      }
    }
    return all;
  }

  async function fetchChannelVideos(channelId) {
    const playlistId = 'UU' + channelId.slice(2);
    let nextPage = '';
    const items = [];

    while (items.length < CONFIG.MAX_VIDEOS_PER_CHANNEL) {
      let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${CONFIG.YOUTUBE_API_KEY}`;
      if (nextPage) url += `&pageToken=${nextPage}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('API error: ' + res.status);
      const data = await res.json();

      for (const item of data.items || []) {
        items.push({
          id: item.contentDetails.videoId,
          title: item.snippet.title,
          publishedAt: item.snippet.publishedAt
        });
      }

      nextPage = data.nextPageToken;
      if (!nextPage) break;
    }

    const durations = await fetchDurations(items.map(v => v.id));
    for (const v of items) {
      v.duration = durations[v.id] || 0;
    }

    return items.filter(v => v.duration > 10);
  }

  async function fetchDurations(ids) {
    const result = {};
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batch.join(',')}&key=${CONFIG.YOUTUBE_API_KEY}`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        for (const item of data.items || []) {
          result[item.id] = parseISO8601(item.contentDetails.duration);
        }
      } catch (e) {
        console.warn('Failed fetching durations batch', e);
        for (const id of batch) result[id] = 0;
      }
    }
    return result;
  }

  function getVisitCount() {
    return parseInt(localStorage.getItem(LS_VISITS) || '0');
  }

  function incrementVisit() {
    const count = getVisitCount() + 1;
    localStorage.setItem(LS_VISITS, count);
    return count;
  }

  function getCachedVideos() {
    try {
      const raw = localStorage.getItem(LS_VIDEOS);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function cacheVideos(videos) {
    localStorage.setItem(LS_VIDEOS, JSON.stringify(videos));
  }

  function shouldRefresh() {
    const cached = getCachedVideos();
    if (!cached || cached.length === 0) return true;
    const visits = getVisitCount();
    return visits % CONFIG.VISIT_RESET === 0;
  }

  function renderVideoGrid(videos) {
    const grid = document.getElementById('video-grid');
    grid.innerHTML = '';

    document.getElementById('video-count').textContent = `${videos.length} videos  ·  ${formatDuration(videos.reduce((s, v) => s + v.duration, 0))} total`;

    videos.forEach((v, i) => {
      const thumb = `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`;
      const card = document.createElement('div');
      card.className = 'video-card' + (i === 0 ? ' active' : '');
      card.dataset.index = i;
      card.innerHTML = `
        <div class="video-thumb-wrap">
          <img src="${thumb}" alt="${v.title}" loading="lazy">
          <span class="duration-badge">${formatDuration(v.duration)}</span>
        </div>
        <div class="video-card-body">
          <div class="video-title">${v.title}</div>
          <div class="video-channel">${v.channelName || ''}</div>
        </div>
      `;
      card.addEventListener('click', () => playVideo(i));
      grid.appendChild(card);
    });
  }

  function playVideo(index) {
    if (!player || !selectedVideos[index]) return;
    currentIndex = index;
    player.loadVideoById(selectedVideos[index].id);
    document.getElementById('current-video-title').textContent = selectedVideos[index].title;
    document.querySelectorAll('.video-card').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
    localStorage.setItem(LS_INDEX, index);
  }

  let currentIndex = 0;

  function initPlayer(videos, startIndex) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(tag, first);

    window.onYouTubeIframeAPIReady = function () {
      player = new YT.Player('player', {
        videoId: videos[startIndex].id,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3
        },
        events: {
          onReady: function () {
            document.getElementById('current-video-title').textContent = videos[startIndex].title;
          },
          onStateChange: function (e) {
            if (e.data === YT.PlayerState.ENDED) {
              const next = (startIndex + 1) % videos.length;
              playVideo(next);
            }
          }
        }
      });
    };
  }

  async function init() {
    const visits = incrementVisit();
    const refresh = shouldRefresh();

    let videos = refresh ? null : getCachedVideos();

    if (!videos || videos.length === 0) {
      document.getElementById('loading').classList.remove('hidden');
      try {
        const allVideos = await fetchAllVideos();
        if (allVideos.length === 0) throw new Error('No videos found');
        videos = selectVideos(allVideos);
        cacheVideos(videos);
      } catch (e) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('error-message').textContent = 'Failed to load videos. Check your API key and internet connection.';
        console.error(e);
        return;
      }
      document.getElementById('loading').classList.add('hidden');
    }

    selectedVideos = videos;
    const savedIndex = parseInt(localStorage.getItem(LS_INDEX) || '0');
    const startIndex = savedIndex < videos.length ? savedIndex : 0;
    currentIndex = startIndex;

    renderVideoGrid(videos);
    document.getElementById('content').classList.remove('hidden');
    initPlayer(videos, startIndex);
  }

  init();
})();
