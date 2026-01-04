const AppState = {
    INITIALIZING: 'initializing',
    LIVE: 'live',
    PAUSED: 'paused',
    ERROR: 'error'
};

let state = AppState.INITIALIZING;
let currentFilter = 'none';
let streaming = false;

const video = document.getElementById('video');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const loadingOverlay = document.getElementById('loading-overlay');
const filterBtns = document.querySelectorAll('.filter-btn');
const captureBtn = document.getElementById('capture-btn');
const modal = document.getElementById('capture-modal');
const modalCloseBtn = document.getElementById('modal-close');
const modalDownloadBtn = document.getElementById('modal-download');
const modalDeleteBtn = document.getElementById('modal-delete');
const previewImage = document.getElementById('preview-image');

let src = null;
let dst = null;
let cap = null;
let gray = null;
let edges = null;
let adaptive = null;
let color = null;
let filtered = null;

function onOpenCvReady() {
    console.log('OpenCV.js is ready');
    startCamera();
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: false
        });

        video.srcObject = stream;
        video.play();

        await new Promise((resolve) => {
            if (video.readyState >= 1 && video.videoWidth > 0) return resolve();
            video.onloadedmetadata = () => resolve();
        });

        // Debug: Log to overlay
        loadingOverlay.innerHTML += '<br><small>Video stream started...</small>';

        let attempts = 0;
        while (video.videoWidth === 0 || video.videoHeight === 0) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
            if (attempts > 50) { // 5 seconds timeout
                throw new Error("Video dimensions never loaded. Browser might be blocking autoplay.");
            }
        }

        console.log(`Video dimensions: ${video.videoWidth}x${video.videoHeight}`);
        resizeCanvas();
        try {
            initOpenCVObjects();
        } catch (cvErr) {
            throw new Error("OpenCV Initialization Failed: " + cvErr.message);
        }
        state = AppState.LIVE;

        loadingOverlay.style.opacity = '0';
        setTimeout(() => loadingOverlay.style.display = 'none', 500);

        requestAnimationFrame(processFrame);

    } catch (err) {
        console.error('Error starting camera:', err);
        showError(`Camera Error: ${err.message}`);
        state = AppState.ERROR;
    }
}

function showError(msg) {
    loadingOverlay.innerHTML = `<p style="color:red; text-align:center; padding:20px;">${msg}</p>`;
    loadingOverlay.style.background = 'rgba(0,0,0,0.9)';
}

function initOpenCVObjects() {
    if (src) src.delete();

    const width = video.videoWidth;
    const height = video.videoHeight;

    if (width === 0 || height === 0) {
        throw new Error('Video dimensions are zero during initialization');
    }

    video.width = width;
    video.height = height;

    src = new cv.Mat(height, width, cv.CV_8UC4);
    dst = new cv.Mat(height, width, cv.CV_8UC4);
    gray = new cv.Mat(height, width, cv.CV_8UC1);
    edges = new cv.Mat(height, width, cv.CV_8UC1);
    adaptive = new cv.Mat(height, width, cv.CV_8UC1);
    color = new cv.Mat(height, width, cv.CV_8UC4);
    filtered = new cv.Mat(height, width, cv.CV_8UC4);

    cap = new cv.VideoCapture(video);
    streaming = true;
}

function resizeCanvas() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
}

window.addEventListener('resize', resizeCanvas);

function processFrame() {
    if (state !== AppState.LIVE || !streaming) return;

    try {
        cap.read(src);

        if (currentFilter === 'none') {
            cv.imshow('output-canvas', src);
        } else if (currentFilter === 'edge') {
            applyEdgeDetection();
            cv.imshow('output-canvas', dst);
        } else if (currentFilter === 'cartoon') {
            applyCartoonEffect();
            cv.imshow('output-canvas', dst);
        }

        requestAnimationFrame(processFrame);
    } catch (err) {
        console.error('Error in processing loop:', err);
        showError(`Processing Error: ${err.message || err}`);
        streaming = false;
    }
}

// ============================================================
// DSP FILTER: Edge Detection
// Uses Canny algorithm which applies Gaussian convolution
// kernel for noise reduction before gradient computation
// ============================================================
function applyEdgeDetection() {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    // [CONVOLUTION] GaussianBlur applies a 5x5 Gaussian kernel convolution
    cv.GaussianBlur(gray, edges, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // [DSP] Canny edge detection (uses Sobel convolution kernels internally)
    cv.Canny(edges, edges, 50, 150, 3, false);

    cv.cvtColor(edges, dst, cv.COLOR_GRAY2RGBA, 0);
}

// ============================================================
// DSP FILTER: Cartoon Effect
// Combines adaptive thresholding with color smoothing
// Uses pyramid-based downsampling for performance
// ============================================================
function applyCartoonEffect() {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    // [CONVOLUTION] medianBlur applies a 7x7 median filter kernel
    cv.medianBlur(gray, gray, 7);

    // [DSP] Adaptive thresholding for edge extraction
    cv.adaptiveThreshold(gray, adaptive, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, 9, 2);
    cv.cvtColor(adaptive, edges, cv.COLOR_GRAY2RGBA, 0);

    const small = new cv.Mat();
    const smoothed = new cv.Mat();

    // [DSP] Pyramid downsampling (Gaussian pyramid - uses convolution)
    cv.pyrDown(src, small);
    cv.pyrDown(small, small);

    // [CONVOLUTION] medianBlur on downsampled image for color quantization effect
    cv.medianBlur(small, small, 7);

    // [DSP] Pyramid upsampling
    cv.pyrUp(small, smoothed);
    cv.pyrUp(smoothed, filtered);

    if (filtered.rows !== src.rows || filtered.cols !== src.cols) {
        cv.resize(filtered, filtered, new cv.Size(src.cols, src.rows));
    }

    cv.bitwise_and(filtered, edges, dst);

    small.delete();
    smoothed.delete();
}

// ============================================================
// DSP FILTER: Emboss Effect
// Demonstrates explicit convolution with a custom 3x3 kernel
// The kernel creates a 3D relief/shadow effect
// ============================================================
function applyEmbossEffect() {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    // [CONVOLUTION] Define custom 3x3 emboss kernel matrix
    // This kernel emphasizes edges in one direction to create depth
    // Kernel:  [-2, -1,  0]
    //          [-1,  1,  1]
    //          [ 0,  1,  2]
    const embossKernel = cv.matFromArray(3, 3, cv.CV_32F, [
        -2, -1, 0,
        -1, 1, 1,
        0, 1, 2
    ]);

    const embossed = new cv.Mat();

    // [DSP] Apply 2D convolution using filter2D
    // This slides the kernel across every pixel and computes weighted sum
    cv.filter2D(gray, embossed, cv.CV_8U, embossKernel, new cv.Point(-1, -1), 128);

    cv.cvtColor(embossed, dst, cv.COLOR_GRAY2RGBA, 0);

    embossKernel.delete();
    embossed.delete();
}

// ============================================================
// DSP FILTER: Sharpen Effect
// [CONVOLUTION] Uses a 3x3 Laplacian-based sharpening kernel
// Enhances edges by subtracting blurred version from original
// ============================================================
function applySharpenEffect() {
    // [CONVOLUTION] Define 3x3 sharpening kernel
    // Center = 9, surrounding = -1 (emphasizes center pixel vs neighbors)
    // Kernel:  [ 0, -1,  0]
    //          [-1,  5, -1]
    //          [ 0, -1,  0]
    const sharpenKernel = cv.matFromArray(3, 3, cv.CV_32F, [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
    ]);

    // [DSP] Apply 2D convolution - slides kernel across every pixel
    cv.filter2D(src, dst, cv.CV_8UC4, sharpenKernel, new cv.Point(-1, -1), 0);

    sharpenKernel.delete();
}

// ============================================================
// DSP FILTER: Pencil Sketch Effect
// [SOBEL OPERATOR] Uses Gx and Gy kernels to extract edges
// Creates a pencil-drawing look using gradient magnitude
// ============================================================
function applyPencilSketch() {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    // [CONVOLUTION] Apply Gaussian blur to reduce noise before edge detection
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);

    // [CONVOLUTION] Gx (Horizontal Kernel): Detects vertical lines
    // Kernel: [-1  0  +1] [-2  0  +2] [-1  0  +1]
    const gradX = new cv.Mat();
    cv.Sobel(gray, gradX, cv.CV_16S, 1, 0, 3);
    cv.convertScaleAbs(gradX, gradX);

    // [CONVOLUTION] Gy (Vertical Kernel): Detects horizontal lines
    // Kernel: [-1  -2  -1] [ 0   0   0] [+1  +2  +1]
    const gradY = new cv.Mat();
    cv.Sobel(gray, gradY, cv.CV_16S, 0, 1, 3);
    cv.convertScaleAbs(gradY, gradY);

    // [DSP] G = sqrt(Gx² + Gy²) - Combine gradients (hypotenuse calculation)
    const combined = new cv.Mat();
    cv.addWeighted(gradX, 0.5, gradY, 0.5, 0, combined);

    // Invert for pencil-on-white-paper look
    cv.bitwise_not(combined, combined);
    cv.cvtColor(combined, dst, cv.COLOR_GRAY2RGBA, 0);

    gradX.delete();
    gradY.delete();
    combined.delete();
}

// ============================================================
// DSP FILTER: Posterize Effect
// [QUANTIZATION] Reduces color palette to create flat color regions
// DSP Task: Rounds pixel values to nearest "bin" (e.g., 0, 85, 170, 255)
// ============================================================
function applyPosterize() {
    src.copyTo(dst);

    // [DSP] Color Quantization - reduce 256 levels to 4 levels per channel
    // Formula: output = floor(input / 64) * 64 + 32
    const levels = 4;
    const divisor = 256 / levels;
    const data = dst.data;

    for (let i = 0; i < data.length; i++) {
        // Skip alpha channel (every 4th byte starting at index 3)
        if ((i + 1) % 4 !== 0) {
            data[i] = Math.floor(data[i] / divisor) * divisor + divisor / 2;
        }
    }
}

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
    });
});

captureBtn.addEventListener('click', () => {
    if (state !== AppState.LIVE) return;

    // Draw current video frame to canvas if filter is none, else canvas already has filtered image
    const dataUrl = canvas.toDataURL('image/png');

    // 1. Always save to sessionStorage (default action)
    const currentPhotos = JSON.parse(sessionStorage.getItem("photos")) || [];
    currentPhotos.push(dataUrl);
    sessionStorage.setItem("photos", JSON.stringify(currentPhotos));

    // 2. Show Modal Popup
    previewImage.src = dataUrl;
    modal.hidden = false;
});

// Modal Actions

// IGNORE / CLOSE: Keep in gallery, just close modal
modalCloseBtn.addEventListener('click', () => {
    modal.hidden = true;
});

// DOWNLOAD: Download file, Keep in gallery
modalDownloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `PixiCam_Capture_${Date.now()}.png`;
    link.href = previewImage.src;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Optional: Close modal after download? Or keep it open? 
    // Usually user might want to see it's done. Let's keep it open or let them close it manually.
    // For now, let's just download.
});

// DELETE: Remove from gallery, Close modal
modalDeleteBtn.addEventListener('click', () => {
    const currentPhotos = JSON.parse(sessionStorage.getItem("photos")) || [];
    // Remove the last added photo (the one we just captured)
    if (currentPhotos.length > 0) {
        currentPhotos.pop();
        sessionStorage.setItem("photos", JSON.stringify(currentPhotos));
    }
    modal.hidden = true;
});

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.hidden = true;
    }
});

window.addEventListener('beforeunload', () => {
    if (src) src.delete();
    if (dst) dst.delete();
    if (gray) gray.delete();
    if (edges) edges.delete();
    if (adaptive) adaptive.delete();
    if (color) color.delete();
    if (filtered) filtered.delete();
});
