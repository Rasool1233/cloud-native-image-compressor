// PRODUCTION READY - Image Optimization Pipeline
console.log('🚀 Production Image Processor Loaded');

// ================= CONFIGURATION =================
const CONFIG = {
    // API Gateway Endpoint
    API_BASE_URL: 'https://ke3a91dqwe.execute-api.ap-south-1.amazonaws.com/prod',

    // S3 (used by backend Lambda)
    INPUT_BUCKET: 'input-bucket-image-compressor',
    OUTPUT_BUCKET: 'output-bucket-image-compressor',
    S3_REGION: 'ap-south-1',
    OUTPUT_BASE_URL: 'https://output-bucket-image-compressor.s3.ap-south-1.amazonaws.com', 
    OUTPUT_PREFIX: 'processed', // root prefix for optimized files

    // File Limits
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_FILES: 10,

    // Processing Options (Defaults)
    DEFAULT_OPTIONS: {
        resize1080p: true,
        resize720p: true,
        resize480p: true,
        compressImage: true,
        convertWebP: false
    }
};

// ================= STATE MANAGEMENT =================
const state = {
    selectedFiles: [],
    processing: false,
    apiStatus: 'unknown',
    currentJobId: null
};

// ================= DOM ELEMENTS =================
const elements = {
    dropArea: document.getElementById('dropArea'),
    fileInput: document.getElementById('fileInput'),
    processButton: document.getElementById('processButton'),
    progressSection: document.getElementById('progressSection'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    progressStatus: document.getElementById('progressStatus'),
    resultsSection: document.getElementById('resultsSection'),
    resultsContainer: document.getElementById('resultsContainer'),
    previewSection: document.getElementById('previewSection'),
    previewContainer: document.getElementById('previewContainer'),
    previewCount: document.getElementById('previewCount'),
    processMoreBtn: document.getElementById('processMoreBtn'),
    uploadSection: document.querySelector('.upload-section')
};

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', async() => {
    console.log('🔧 Initializing Production Pipeline...');
    console.log('API URL:', CONFIG.API_BASE_URL);

    initializeUI();
    await checkApiHealth();
    setDefaultOptions();
});

// ================= API HEALTH CHECK =================
async function checkApiHealth() {
    console.log('🔍 Checking API Health...');

    try {
        const res = await fetch(CONFIG.API_BASE_URL + '/optimize', {
            method: 'OPTIONS',
            headers: {
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type'
            }
        });

        const allowOrigin = res.headers.get('Access-Control-Allow-Origin');
        console.log('CORS Status:', res.status, 'Origin:', allowOrigin);

        if (res.status === 200 || res.status === 204) {
            state.apiStatus = 'healthy';
            showNotification('API reachable – production mode enabled', 'success');
        } else {
            state.apiStatus = 'partial';
            showNotification(`API reachable but returned status ${res.status}`, 'warning');
        }
    } catch (error) {
        state.apiStatus = 'offline';
        console.error('❌ API health check failed:', error);
        showNotification('API not reachable – running in demo mode', 'error');
    }

    updateProcessButton();
}

// ================= UI INITIALIZATION =================
function initializeUI() {
    if (elements.dropArea && elements.fileInput) {
        elements.dropArea.addEventListener('click', () => elements.fileInput.click());
        elements.fileInput.addEventListener('change', handleFileSelect);

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            elements.dropArea.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            elements.dropArea.addEventListener(eventName, () => {
                elements.dropArea.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            elements.dropArea.addEventListener(eventName, () => {
                elements.dropArea.classList.remove('dragover');
            });
        });

        elements.dropArea.addEventListener('drop', handleDrop);
    }

    if (elements.processButton) {
        elements.processButton.addEventListener('click', processImages);
        updateProcessButton();
    }

    if (elements.processMoreBtn) {
        elements.processMoreBtn.addEventListener('click', resetUI);
    }
}

function setDefaultOptions() {
    Object.keys(CONFIG.DEFAULT_OPTIONS).forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = CONFIG.DEFAULT_OPTIONS[id];
        }
    });
}

// ================= FILE HANDLING =================
function handleFileSelect(e) {
    handleFiles(e.target.files);
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleFiles(files) {
    const validFiles = Array.from(files)
        .filter(validateFile)
        .slice(0, CONFIG.MAX_FILES - state.selectedFiles.length);

    if (validFiles.length > 0) {
        state.selectedFiles = [...state.selectedFiles, ...validFiles];
        updatePreview();
        updateProcessButton();

        if (files.length > validFiles.length) {
            showNotification(`Some files were filtered. Max ${CONFIG.MAX_FILES} files allowed.`, 'warning');
        }
    }
}

function validateFile(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        showNotification(`"${file.name}" is not a supported image type.`, 'error');
        return false;
    }

    if (file.size > CONFIG.MAX_FILE_SIZE) {
        showNotification(`"${file.name}" exceeds ${formatFileSize(CONFIG.MAX_FILE_SIZE)} limit.`, 'error');
        return false;
    }

    return true;
}

// ================= PREVIEW =================
function updatePreview() {
    if (!elements.previewContainer || !elements.previewCount) return;

    elements.previewContainer.innerHTML = '';

    state.selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewItem = createPreviewItem(file, e.target.result, index);
            elements.previewContainer.appendChild(previewItem);
        };
        reader.readAsDataURL(file);
    });

    elements.previewCount.textContent =
        `${state.selectedFiles.length} image${state.selectedFiles.length !== 1 ? 's' : ''} selected`;
    elements.previewSection.classList.toggle('hidden', state.selectedFiles.length === 0);
}

function createPreviewItem(file, dataUrl, index) {
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.innerHTML = `
        <img src="${dataUrl}" class="preview-image" alt="${file.name}">
        <div class="preview-info">
            <div class="preview-name">${file.name}</div>
            <div class="preview-size">${formatFileSize(file.size)}</div>
        </div>
        <button class="preview-remove" data-index="${index}" title="Remove">
            <i class="fas fa-times"></i>
        </button>
    `;

    div.querySelector('.preview-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(e.target.closest('.preview-remove').getAttribute('data-index'));
        state.selectedFiles.splice(idx, 1);
        updatePreview();
        updateProcessButton();
    });

    return div;
}

// ================= PROCESSING =================
async function processImages() {
    if (state.selectedFiles.length === 0 || state.processing) return;

    state.processing = true;
    updateProcessButton();
    const options = getProcessingOptions();
    showSection('progress');

    try {
        if (state.apiStatus === 'healthy') {
            await processWithProductionAPI(options);
        } else {
            await processWithFallback(options);
        }
    } catch (error) {
        console.error('Processing failed:', error);
        showNotification(`Processing failed: ${error.message}`, 'error');
        resetUI();
    }

    state.processing = false;
    updateProcessButton();
}

async function processWithProductionAPI(options) {
    console.log('🛰️ Processing with Production API (presigned S3 uploads)');

    const totalFiles = state.selectedFiles.length;
    const results = [];

    for (let i = 0; i < totalFiles; i++) {
        const file = state.selectedFiles[i];
        const pct = Math.floor((i / totalFiles) * 70);

        updateProgress(pct, `Uploading ${file.name} (${i + 1}/${totalFiles})...`);

        try {
            // 1. Get presigned upload URL + fields
            const uploadData = await getPresignedUrl(file);
            console.log('Presigned data for', file.name, uploadData);

            // 2. Upload to S3
            await uploadToS3(file, uploadData);

            // 3. Use the safe file name that backend actually stores
            const storedFileName = uploadData.fileName || file.name;

            // 4. Build expected output URLs for display
            const outputVariants = buildOutputVariants(storedFileName, options, uploadData);

            results.push({
                fileName: file.name, // original name for display
                storedFileName, // safe name used in S3
                status: 'success',
                outputs: outputVariants
            });

            showNotification(`Uploaded: ${file.name}`, 'success');
        } catch (err) {
            console.error(`Failed to process ${file.name}:`, err);
            results.push({
                fileName: file.name,
                status: 'failed',
                error: err.message,
                outputs: []
            });
            showNotification(`Failed: ${file.name}`, 'error');
        }
    }

    updateProgress(90, 'Processing images with AWS Lambda...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    updateProgress(100, 'Processing complete!');
    setTimeout(() => showProductionResults(results, options), 800);
}

// Ask /optimize Lambda for a presigned upload URL
async function getPresignedUrl(file) {
    const response = await fetch(CONFIG.API_BASE_URL + '/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'getPresignedUploadUrl',
            fileName: file.name,
            fileType: file.type
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `API returned ${response.status}`);
    }

    // Expected shape:
    // {
    //   uploadUrl: "...",
    //   fields: { key: "uploads/<jobId>/original/<safeFileName>", ... },
    //   fileName: "<safeFileName>",
    //   jobId: "<jobId>",
    //   optimizedBasePath: "processed/<jobId>",
    //   ...
    // }
    return data;
}

// Upload the file to S3 using the form fields from the presigned URL
async function uploadToS3(file, uploadData) {
    const formData = new FormData();

    Object.keys(uploadData.fields || {}).forEach(key => {
        formData.append(key, uploadData.fields[key]);
    });

    formData.append('file', file);

    const response = await fetch(uploadData.uploadUrl, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`S3 upload failed: ${response.status}`);
    }
}

// Build expected S3 URLs for optimized outputs
function buildOutputVariants(storedFileName, options, uploadData) {
    const baseUrl = CONFIG.OUTPUT_BASE_URL.replace(/\/+$/, ''); // ensure no trailing slash

    // 1) Prefer explicit optimizedBasePath from Lambda:
    //    e.g. "processed/4bb46700"
    let baseKeyPrefix = uploadData && uploadData.optimizedBasePath;

    // 2) Otherwise build from jobId: "processed/<jobId>"
    if (!baseKeyPrefix) {
        let jobId = uploadData && uploadData.jobId;
        if (jobId) {
            baseKeyPrefix = `${CONFIG.OUTPUT_PREFIX}/${jobId}`;
        }
    }

    // 3) As a last resort, try to derive jobId from fields.key: "uploads/<jobId>/original/<file>"
    if (!baseKeyPrefix && uploadData && uploadData.fields && uploadData.fields.key) {
        const parts = uploadData.fields.key.split('/');
        if (parts.length >= 2) {
            const jobIdFromKey = parts[1];
            baseKeyPrefix = `${CONFIG.OUTPUT_PREFIX}/${jobIdFromKey}`;
        }
    }

    // 4) If still nothing, just use "processed"
    if (!baseKeyPrefix) {
        baseKeyPrefix = CONFIG.OUTPUT_PREFIX;
    }

    const variants = [];

    const addVariant = (label, folder) => {
        // processed/<jobId>/1080p/<storedFileName>
        const key = `${baseKeyPrefix}/${folder}/${storedFileName}`;
        const url = `${baseUrl}/${encodeURI(key)}`;
        variants.push({ label, key, url });
    };

    if (options.resize1080p) addVariant('1080p', '1080p');
    if (options.resize720p) addVariant('720p', '720p');
    if (options.resize480p) addVariant('480p', '480p');

    return variants;
}

async function processWithFallback(options) {
    console.log('🔧 Processing with Fallback (Demo)');

    let progress = 10;
    const interval = setInterval(() => {
        progress += 2;

        if (progress < 40) {
            updateProgress(progress, 'Simulating upload to S3...');
        } else if (progress < 80) {
            updateProgress(progress, 'Simulating AWS Lambda processing...');
        } else {
            updateProgress(progress, 'Finalizing...');
        }

        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                showDemoResults(options);
            }, 1000);
        }
    }, 100);
}

// ================= RESULTS =================
function showProductionResults(results, options) {
    showSection('results');

    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');

    let html = `
        <div class="result-item">
            <div class="original-image">
                <div class="result-icon success">
                    <i class="fas fa-cloud-upload-alt"></i>
                </div>
                <div class="original-info">
                    <h4>Processing Complete!</h4>
                    <p>${successful.length} of ${results.length} images uploaded successfully</p>
                    ${failed.length > 0 ? `<p class="error-text">${failed.length} failed</p>` : ''}
                    <p><small>Images are uploaded to S3. Optimized versions are shown below (if available).</small></p>
                </div>
            </div>
        </div>
    `;

    results.forEach(result => {
        html += `
            <div class="result-item">
                <div class="original-image">
                    <div class="original-info">
                        <h4>${result.fileName}</h4>
                        <p>Status: ${
                            result.status === 'success'
                                ? '<span class="status-success">Success</span>'
                                : `<span class="status-failed">Failed - ${result.error || 'Unknown error'}</span>`
                        }</p>
                    </div>
                </div>
                ${
                    result.outputs && result.outputs.length > 0 && result.status === 'success'
                        ? `
                    <div class="optimized-variants">
                        ${result.outputs
                            .map(
                                o => `
                            <div class="optimized-card">
                                <div class="optimized-label">${o.label}</div>
                                <a href="${o.url}" target="_blank" class="optimized-link">
                                    <img src="${o.url}" alt="${o.label} - ${result.fileName}"
                                         class="optimized-thumb"
                                         onerror="this.style.display='none'; this.parentElement.querySelector('.optimized-missing').style.display='block';">
                                    <div class="optimized-missing" style="display:none;">
                                        Not available yet
                                    </div>
                                </a>
                                <a href="${o.url}" target="_blank" class="download-btn">
                                    <i class="fas fa-download"></i> Open
                                </a>
                            </div>
                        `
                            )
                            .join('')}
                    </div>
                `
                        : `<div class="optimized-variants"><p>No optimized outputs detected yet.</p></div>`
                }
            </div>
        `;
    });

    elements.resultsContainer.innerHTML = html;
}

function showDemoResults(options) {
    showSection('results');

    let html = `
        <div class="result-item">
            <div class="original-image">
                <div class="result-icon demo">
                    <i class="fas fa-info-circle"></i>
                </div>
                <div class="original-info">
                    <h4>Demo Mode Active</h4>
                    <p>${state.selectedFiles.length} images simulated for processing</p>
                    <p class="warning-text">API is not fully configured for production</p>
                    <p><small>API Status: ${state.apiStatus}</small></p>
                </div>
            </div>
            <div class="demo-notice">
                <h5>To enable production mode:</h5>
                <ol>
                    <li>Ensure CORS is enabled on API Gateway</li>
                    <li>Verify Lambda has S3 permissions</li>
                    <li>Confirm S3 bucket paths in Lambda env variables</li>
                    <li>Test the /optimize endpoint with a sample image</li>
                </ol>
                <button class="test-api-btn" onclick="testApiManually()">
                    <i class="fas fa-bolt"></i> Test API Now
                </button>
            </div>
        </div>
    `;

    elements.resultsContainer.innerHTML = html;
}

// ================= UI HELPERS =================
function updateProcessButton() {
    if (!elements.processButton) return;

    if (state.processing) {
        elements.processButton.disabled = true;
        elements.processButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`;
    } else if (state.selectedFiles.length > 0) {
        elements.processButton.disabled = false;
        elements.processButton.innerHTML = `
            <i class="fas fa-cogs"></i> 
            Process ${state.selectedFiles.length} Image${state.selectedFiles.length !== 1 ? 's' : ''}
            ${state.apiStatus !== 'healthy' ? ' (Demo)' : ''}
        `;
    } else {
        elements.processButton.disabled = true;
        elements.processButton.innerHTML = `<i class="fas fa-cogs"></i> Process Images`;
    }
}

function updateProgress(percent, message) {
    if (elements.progressBar) elements.progressBar.style.width = `${percent}%`;
    if (elements.progressText) elements.progressText.textContent = `${percent}%`;
    if (elements.progressStatus) elements.progressStatus.textContent = message;
}

function showSection(sectionName) {
    if (elements.uploadSection) elements.uploadSection.classList.add('hidden');
    if (elements.previewSection) elements.previewSection.classList.add('hidden');
    if (elements.progressSection) elements.progressSection.classList.add('hidden');
    if (elements.resultsSection) elements.resultsSection.classList.add('hidden');

    switch (sectionName) {
        case 'upload':
            if (elements.uploadSection) elements.uploadSection.classList.remove('hidden');
            break;
        case 'progress':
            if (elements.progressSection) elements.progressSection.classList.remove('hidden');
            break;
        case 'results':
            if (elements.resultsSection) elements.resultsSection.classList.remove('hidden');
            break;
    }
}

function resetUI() {
    state.selectedFiles = [];
    state.processing = false;

    if (elements.fileInput) elements.fileInput.value = '';
    if (elements.previewContainer) elements.previewContainer.innerHTML = '';
    if (elements.previewCount) elements.previewCount.textContent = '0 images selected';

    showSection('upload');
    updateProcessButton();
}

// ================= UTILITIES =================
function getProcessingOptions() {
    return {
        resize1080p: document.getElementById('resize1080p')?.checked ?? CONFIG.DEFAULT_OPTIONS.resize1080p,
        resize720p: document.getElementById('resize720p')?.checked ?? CONFIG.DEFAULT_OPTIONS.resize720p,
        resize480p: document.getElementById('resize480p')?.checked ?? CONFIG.DEFAULT_OPTIONS.resize480p,
        compressImage: document.getElementById('compressImage')?.checked ?? CONFIG.DEFAULT_OPTIONS.compressImage,
        convertWebP: document.getElementById('convertWebP')?.checked ?? CONFIG.DEFAULT_OPTIONS.convertWebP
    };
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
        <button class="notification-close"><i class="fas fa-times"></i></button>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 5000);

    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.remove();
    });
}

// ================= GLOBAL FUNCTIONS (for testing) =================
window.testApiManually = async function () {
    console.log('🧪 Testing /optimize endpoint (OPTIONS)...');

    try {
        const res = await fetch(CONFIG.API_BASE_URL + '/optimize', {
            method: 'OPTIONS',
            headers: {
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type'
            }
        });

        console.log('OPTIONS status:', res.status);
        console.log('CORS headers:', {
            'Access-Control-Allow-Origin': res.headers.get('Access-Control-Allow-Origin'),
            'Access-Control-Allow-Methods': res.headers.get('Access-Control-Allow-Methods'),
            'Access-Control-Allow-Headers': res.headers.get('Access-Control-Allow-Headers')
        });

        if (res.status === 200 || res.status === 204) {
            showNotification('OPTIONS /optimize looks good – CORS enabled', 'success');
            state.apiStatus = 'healthy';
            updateProcessButton();
            return true;
        } else {
            showNotification(`OPTIONS /optimize returned status ${res.status}`, 'warning');
            return false;
        }
    } catch (error) {
        console.error('Manual OPTIONS test failed:', error);
        showNotification(`API connection failed: ${error.message}`, 'error');
        return false;
    }
};

window.checkCorsHeaders = function () {
    console.log('🔍 Checking CORS headers on /optimize...');

    fetch(CONFIG.API_BASE_URL + '/optimize', {
        method: 'OPTIONS',
        headers: {
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type'
        }
    })
        .then(r => {
            console.log('OPTIONS Response Status:', r.status);
            console.log('CORS Headers:', {
                'Access-Control-Allow-Origin': r.headers.get('Access-Control-Allow-Origin'),
                'Access-Control-Allow-Methods': r.headers.get('Access-Control-Allow-Methods'),
                'Access-Control-Allow-Headers': r.headers.get('Access-Control-Allow-Headers')
            });

            const allowOrigin = r.headers.get('Access-Control-Allow-Origin');
            if (allowOrigin === '*' || allowOrigin === window.location.origin) {
                console.log('✅ CORS is properly configured');
                showNotification('CORS is configured correctly on /optimize', 'success');
            } else {
                console.log('❌ CORS may not be configured as expected');
                showNotification('CORS configuration looks unusual on /optimize', 'warning');
            }
        })
        .catch(e => {
            console.error('CORS Check failed:', e);
            showNotification('CORS preflight failed for /optimize', 'error');
        });
};
