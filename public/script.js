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

// Modal elements
const downloadModal = document.getElementById('downloadModal');
const downloadSpinner = document.getElementById('downloadSpinner');
const downloadModalTitle = document.getElementById('downloadModalTitle');
const downloadModalText = document.getElementById('downloadModalText');
const downloadModalClose = document.getElementById('downloadModalClose');

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
        const platform = e.target.value;
        if (platform === 'youtube') {
            urlInput.placeholder = 'Pega el enlace de YouTube aquí...';
        } else if (platform === 'instagram') {
            urlInput.placeholder = 'Pega el enlace de Instagram aquí...';
        } else if (platform === 'facebook') {
            urlInput.placeholder = 'Pega el enlace de Facebook aquí...';
        } else if (platform === 'tiktok') {
            urlInput.placeholder = 'Pega el enlace de TikTok aquí...';
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

    // Reset UI
    videoInfo.classList.add('hidden');
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

        // Update UI
        videoTitle.textContent = data.title;
        thumbnail.src = data.thumbnail;
        duration.textContent = data.duration;
        
        loader.classList.add('hidden');
        videoInfo.classList.remove('hidden');
    } catch (error) {
        loader.classList.add('hidden');
        showMessage(error.message, 'error');
    }
}

async function startDownload() {
    const url = urlInput.value.trim();
    if (!url) return showMessage('Por favor ingresa un enlace', 'error');

    const format = document.querySelector('input[name="format"]:checked').value;
    
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando en servidor...';

    const platform = document.querySelector('input[name="platform"]:checked').value;

    // Show modal
    downloadModal.classList.remove('hidden');
    downloadSpinner.classList.remove('hidden');
    downloadModalClose.classList.add('hidden');
    downloadModalTitle.textContent = 'Descargando...';
    downloadModalTitle.style.color = 'var(--text-primary)';
    downloadModalText.textContent = 'Procesando video en el servidor. Esto puede tomar unos minutos dependiendo de la duración.';

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, type: format, platform })
        });
        
        const data = await response.json();
        
        if (response.status === 401) {
            downloadModal.classList.add('hidden');
            showLogin();
            return;
        }
        
        if (!response.ok) throw new Error(data.error || 'Error en la descarga');
        
        // Success state
        downloadSpinner.classList.add('hidden');
        downloadModalTitle.textContent = '¡Descarga Lista!';
        downloadModalTitle.style.color = 'var(--success)';
        downloadModalText.textContent = 'El video ha sido procesado y la descarga a tu dispositivo comenzará en un instante.';
        downloadModalClose.classList.remove('hidden');
        
        // Trigger browser download
        if (data.downloadUrl) {
            window.location.href = data.downloadUrl;
        }
        
    } catch (error) {
        // Error state
        downloadSpinner.classList.add('hidden');
        downloadModalTitle.textContent = 'Error';
        downloadModalTitle.style.color = 'var(--danger)';
        downloadModalText.textContent = error.message;
        downloadModalClose.classList.remove('hidden');
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i> Iniciar Descarga';
        statusMessage.classList.add('hidden');
    }
}

function showMessage(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = `alert ${type}`;
    statusMessage.classList.remove('hidden');
}
