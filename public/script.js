const urlInput = document.getElementById('urlInput');
const searchBtn = document.getElementById('searchBtn');
const loader = document.getElementById('loader');
const videoInfo = document.getElementById('videoInfo');
const statusMessage = document.getElementById('statusMessage');

// Auth elements
const loginScreen = document.getElementById('loginScreen');
const appContent = document.getElementById('appContent');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

// Info elements
const videoTitle = document.getElementById('videoTitle');
const thumbnail = document.getElementById('thumbnail');
const duration = document.getElementById('duration');
const downloadBtn = document.getElementById('downloadBtn');
const newVideoBtn = document.getElementById('newVideoBtn');
const platformRadios = document.querySelectorAll('input[name="platform"]');
const qualitySelect = document.getElementById('qualitySelect');

// Modal elements
const downloadModal = document.getElementById('downloadModal');
const downloadSpinner = document.getElementById('downloadSpinner');
const downloadModalTitle = document.getElementById('downloadModalTitle');
const downloadModalText = document.getElementById('downloadModalText');
const downloadModalClose = document.getElementById('downloadModalClose');

// Progress elements
const progressContainer = document.getElementById('progressContainer');
const progressBarFill = document.getElementById('progressBarFill');
const progressPercent = document.getElementById('progressPercent');
const progressSpeed = document.getElementById('progressSpeed');
const progressETA = document.getElementById('progressETA');

searchBtn.addEventListener('click', fetchVideoInfo);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchVideoInfo();
});
downloadBtn.addEventListener('click', startDownload);

downloadModalClose.addEventListener('click', () => {
    downloadModal.classList.add('hidden');
});

newVideoBtn.addEventListener('click', () => {
    videoInfo.classList.add('hidden');
    urlInput.value = '';
    urlInput.focus();
    statusMessage.classList.add('hidden');
});

// Update placeholder based on selected platform
platformRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        // Clear input and hide previous video info when switching platforms
        urlInput.value = '';
        videoInfo.classList.add('hidden');
        statusMessage.classList.add('hidden');
        
        const platform = e.target.value;
        if (platform === 'youtube') {
            urlInput.placeholder = 'Pega el enlace de YouTube aquí...';
        } else if (platform === 'instagram') {
            urlInput.placeholder = 'Pega el enlace de Instagram aquí...';
        } else if (platform === 'facebook') {
            urlInput.placeholder = 'Pega el enlace de Facebook aquí...';
        } else if (platform === 'tiktok') {
            urlInput.placeholder = 'Pega el enlace de TikTok aquí...';
        } else if (platform === 'x') {
            urlInput.placeholder = 'Pega el enlace de X (Twitter) aquí...';
        } else if (platform === 'reddit') {
            urlInput.placeholder = 'Pega el enlace de Reddit aquí...';
        } else if (platform === 'twitch') {
            urlInput.placeholder = 'Pega el enlace de Twitch aquí...';
        }
    });
});

// Auth listeners
loginBtn.addEventListener('click', attemptLogin);
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptLogin();
});

// Check auth on load
checkAuth();
renderHistory(); // Render history on load

async function checkAuth() {
    try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();
        if (data.authenticated) {
            showApp();
        } else {
            showLogin();
        }
    } catch (e) {
        showLogin();
    }
}

async function attemptLogin() {
    const password = passwordInput.value;
    if (!password) return;
    
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...';
    loginError.classList.add('hidden');
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            showApp();
            passwordInput.value = '';
        } else {
            loginError.textContent = data.error || 'Contraseña incorrecta';
            loginError.classList.remove('hidden');
        }
    } catch (e) {
        loginError.textContent = 'Error de conexión';
        loginError.classList.remove('hidden');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Entrar';
    }
}

function showLogin() {
    loginScreen.classList.remove('hidden');
    appContent.classList.add('hidden');
}

function showApp() {
    loginScreen.classList.add('hidden');
    appContent.classList.remove('hidden');
}

async function fetchVideoInfo() {
    const url = urlInput.value.trim();
    if (!url) return showMessage('Por favor, ingresa un enlace válido.', 'error');

    videoInfo.classList.add('hidden');
    playlistInfo.classList.add('hidden');
    statusMessage.classList.add('hidden');
    loader.classList.remove('hidden');

    try {
        const platform = document.querySelector('input[name="platform"]:checked').value;
        const response = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, platform })
        });

        const data = await response.json();

        if (response.status === 401) {
            showLogin();
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || 'Error al obtener información.');
        }

        if (data.isPlaylist) {
            currentPlaylistEntries = data.entries;
            playlistTitle.textContent = data.title;
            playlistThumbnail.src = data.thumbnail || 'https://via.placeholder.com/100?text=Playlist';
            playlistCount.textContent = `${data.entries.length} videos`;
            
            renderPlaylistItems(data.entries);
            
            loader.classList.add('hidden');
            playlistInfo.classList.remove('hidden');
            return;
        }

        videoTitle.textContent = data.title;
        thumbnail.src = data.thumbnail;
        duration.textContent = data.duration;
        
        qualitySelect.innerHTML = '<option value="best">Mejor Calidad (Automático)</option><option value="audio">Solo Audio (MP3)</option>';
        if (data.formats && data.formats.length > 0) {
            data.formats.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.label;
                qualitySelect.appendChild(opt);
            });
        }
        
        loader.classList.add('hidden');
        videoInfo.classList.remove('hidden');
    } catch (error) {
        loader.classList.add('hidden');
        showMessage(error.message, 'error');
    }
}

function renderPlaylistItems(entries) {
    playlistItems.innerHTML = '';
    entries.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.innerHTML = `
            <input type="checkbox" class="playlist-item-checkbox" data-index="${index}" checked>
            <div class="playlist-item-info">
                <div class="playlist-item-title" title="${entry.title}">${entry.title}</div>
                <div class="playlist-item-duration"><i class="fa-regular fa-clock"></i> ${entry.duration}</div>
            </div>
            <div class="playlist-item-status status-pending" id="playlist-status-${index}">Pendiente</div>
        `;
        playlistItems.appendChild(item);
    });
}

selectAllCheckbox.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.playlist-item-checkbox');
    checkboxes.forEach(cb => {
        if (!cb.disabled) cb.checked = e.target.checked;
    });
});

downloadSelectedBtn.addEventListener('click', async () => {
    if (isDownloadingPlaylist) return;
    
    const checkboxes = document.querySelectorAll('.playlist-item-checkbox:checked:not(:disabled)');
    if (checkboxes.length === 0) {
        showMessage('Selecciona al menos un video para descargar.', 'error');
        return;
    }
    
    isDownloadingPlaylist = true;
    downloadSelectedBtn.disabled = true;
    downloadSelectedBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Descargando...';
    
    const quality = playlistQualitySelect.value;
    const platform = document.querySelector('input[name="platform"]:checked').value;
    
    for (let cb of checkboxes) {
        const index = cb.getAttribute('data-index');
        const entry = currentPlaylistEntries[index];
        const statusEl = document.getElementById(`playlist-status-${index}`);
        
        statusEl.className = 'playlist-item-status status-downloading';
        statusEl.textContent = 'Procesando...';
        cb.disabled = true;
        
        try {
            await processSingleDownload(entry.url, platform, quality, entry.title, null, null, statusEl);
        } catch (error) {
            statusEl.className = 'playlist-item-status status-error';
            statusEl.textContent = 'Error';
            cb.disabled = false; 
        }
    }
    
    isDownloadingPlaylist = false;
    downloadSelectedBtn.disabled = false;
    downloadSelectedBtn.innerHTML = '<i class="fa-solid fa-download"></i> Descargar Seleccionados';
});

async function processSingleDownload(url, platform, quality, title, trimStart = null, trimEnd = null, statusElement = null) {
    const fileId = Date.now().toString() + '-' + Math.floor(Math.random() * 1000);
    
    if (!statusElement) {
        downloadModal.classList.remove('hidden');
        downloadModalClose.classList.add('hidden');
        downloadSpinner.classList.remove('hidden');
        downloadModalTitle.textContent = 'Procesando...';
        downloadModalText.textContent = 'Por favor espera mientras el servidor prepara tu archivo.';
        progressContainer.classList.add('hidden');
    }

    let progressEventSource = null;
    
    try {
        if (!statusElement) {
            progressEventSource = new EventSource(`/api/progress?fileId=${fileId}`);
            progressEventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.status === 'downloading') {
                        progressContainer.classList.remove('hidden');
                        progressBarFill.style.width = data.percent;
                        progressPercent.textContent = data.percent;
                        progressSpeed.textContent = data.speed || '';
                        progressETA.textContent = data.eta ? `Faltan: ${data.eta}` : 'Procesando...';
                        downloadModalTitle.textContent = 'Descargando...';
                    }
                } catch(err) {}
            };
        }

        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, platform, type: quality, trimStart, trimEnd, fileId })
        });

        const data = await response.json();
        if (progressEventSource) progressEventSource.close();

        if (response.ok && data.downloadUrl) {
            saveToHistory(title, platform, url);
            
            if (statusElement) {
                statusElement.className = 'playlist-item-status status-success';
                statusElement.innerHTML = '<i class="fa-solid fa-check"></i> Listo';
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = data.downloadUrl;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                downloadSpinner.classList.add('hidden');
                progressContainer.classList.add('hidden');
                downloadModalTitle.textContent = '¡Listo!';
                downloadModalTitle.style.color = 'var(--success)';
                downloadModalText.textContent = 'El video ha sido procesado.';
                downloadModalClose.classList.remove('hidden');
                window.location.href = data.downloadUrl;
            }
        } else {
            throw new Error(data.error || 'Error desconocido');
        }
    } catch (error) {
        if (progressEventSource) progressEventSource.close();
        if (!statusElement) {
            downloadSpinner.classList.add('hidden');
            progressContainer.classList.add('hidden');
            downloadModalTitle.textContent = 'Error';
            downloadModalTitle.style.color = 'var(--danger)';
            downloadModalText.textContent = error.message;
            downloadModalClose.classList.remove('hidden');
        }
        throw error;
    }
}

downloadBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const platform = document.querySelector('input[name="platform"]:checked').value;
    const quality = qualitySelect.value;
    const currentTitle = videoTitle.textContent;
    const trimStartVal = document.getElementById('trimStart').value.trim();
    const trimEndVal = document.getElementById('trimEnd').value.trim();
    await processSingleDownload(url, platform, quality, currentTitle, trimStartVal, trimEndVal);
});

function showMessage(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = `alert ${type}`;
    statusMessage.classList.remove('hidden');
}

function saveToHistory(title, platform, url) {
    let history = JSON.parse(localStorage.getItem('novaHistory') || '[]');
    history = history.filter(h => h.url !== url);
    history.unshift({ title, platform, url, date: new Date().toLocaleDateString() });
    if(history.length > 10) history = history.slice(0, 10);
    localStorage.setItem('novaHistory', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    let history = JSON.parse(localStorage.getItem('novaHistory') || '[]');
    if(history.length === 0) {
        list.innerHTML = '<p class="empty-history" style="color: var(--text-secondary); text-align: center; padding: 1rem 0;">Aún no hay descargas recientes.</p>';
        return;
    }
    list.innerHTML = '';
    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div class="history-item-title" title="${item.title}">${item.title}</div>
            <div class="history-item-platform"><i class="fa-brands fa-${item.platform === 'x' ? 'x-twitter' : item.platform}"></i></div>
        `;
        div.onclick = () => {
            document.getElementById('urlInput').value = item.url;
            const radio = document.querySelector(`input[name="platform"][value="${item.platform}"]`);
            if(radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change'));
            }
            fetchVideoInfo();
        };
        list.appendChild(div);
    });
}
