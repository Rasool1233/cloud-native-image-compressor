// Configuration
const config = {
    region: 'ap-south-1', 
    uploadsBucket: 'input-bucket-image-compressor',
    apiEndpoint: 'https://mmduo1gln9.execute-api.ap-south-1.amazonaws.com/prod' // We'll add this later when we create API Gateway
};

// DOM Elements
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const progressBar = document.getElementById('progressBar');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');
const imageLinksDiv = document.getElementById('imageLinks');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

// AWS SDK Configuration
let s3;
let currentSessionId = null;
let pollInterval = null;

// Initialize AWS SDK
async function initAWS() {
    try {
        showStatus('Initializing...', 'success');
        
        // For now, use anonymous credentials (no authentication)
        // We'll add Cognito later
        AWS.config.update({
            region: config.region,
            credentials: new AWS.CognitoIdentityCredentials({
                IdentityPoolId: `us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` // We'll fix this later
            })
        });
        
        // Override with temporary access (for development only)
        // This allows uploads without authentication
        AWS.config.credentials = {
            accessKeyId: 'temporary',
            secretAccessKey: 'temporary',
            get: function(callback) {
                callback();
            }
        };
        
        // Create S3 instance
        s3 = new AWS.S3({
            apiVersion: '2006-03-01',
            params: { Bucket: config.uploadsBucket },
            // Important: Don't validate credentials for now
            signatureVersion: 'v4'
        });
        
        console.log('AWS S3 initialized successfully');
        
        // Test if S3 is working
        await testS3Connection();
        
    } catch (error) {
        console.error('AWS initialization failed:', error);
        showStatus('Warning: Running in demo mode. Uploads will be simulated.', 'error');
        
        // Fallback: Create a mock S3 object for testing
        s3 = createMockS3();
    }
}

// Upload image to S3
async function uploadImage() {
    const file = fileInput.files[0];
    if (!file) {
        showStatus('Please select an image file first.', 'error');
        return;
    }

    // Validate file type
    if (!file.type.match('image.*')) {
        showStatus('Please select an image file (JPEG, PNG, etc.)', 'error');
        return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showStatus('File size must be less than 10MB', 'error');
        return;
    }

    // Generate unique session ID and filename
    const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const fileName = `${sessionId}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    
    // Show progress bar
    progressBar.style.display = 'block';
    progressBar.value = 0;
    currentSessionId = sessionId;
    
    try {
        // Upload to S3
        const params = {
            Key: `uploads/${fileName}`,
            Body: file,
            ContentType: file.type,
            ACL: 'private'
        };

        await s3.upload(params)
            .on('httpUploadProgress', (evt) => {
                const progress = Math.round((evt.loaded / evt.total) * 100);
                progressBar.value = progress;
            })
            .promise();

        showStatus('✅ Upload successful! Processing image...', 'success');
        
        // Start polling for processed images
        startPollingForResults(sessionId);
        
        // Clear file input
        fileInput.value = '';

    } catch (error) {
        console.error('Upload error:', error);
        showStatus(`Upload failed: ${error.message}`, 'error');
    }
}

// Poll API for processed images
function startPollingForResults(sessionId) {
    let attempts = 0;
    const maxAttempts = 30; // 30 * 2 seconds = 1 minute timeout
    
    pollInterval = setInterval(async () => {
        attempts++;
        
        if (attempts > maxAttempts) {
            clearInterval(pollInterval);
            showStatus('Processing timeout. Please check back later.', 'error');
            return;
        }
        
        try {
            const response = await fetch(`${config.apiEndpoint}/images/${sessionId}`);
            
            if (response.ok) {
                const data = await response.json();
                
                // Check if we have all resolutions
                if (data.resolutions && Object.keys(data.resolutions).length >= 3) {
                    clearInterval(pollInterval);
                    
                    // Display results
                    displayProcessedImages(data.resolutions);
                    showStatus('✅ Image processing completed!', 'success');
                    
                    // Add to recent images list
                    loadRecentImages();
                } else {
                    showStatus(`Processing... (${attempts}/${maxAttempts})`, 'success');
                }
            }
        } catch (error) {
            console.log('Polling attempt failed:', error);
        }
    }, 2000); // Poll every 2 seconds
}

// Display processed image links
function displayProcessedImages(resolutions) {
    resultsDiv.style.display = 'block';
    imageLinksDiv.innerHTML = '';
    
    Object.entries(resolutions).forEach(([size, data]) => {
        if (!data.url) return;
        
        const div = document.createElement('div');
        div.className = 'image-result';
        div.style.margin = '15px 0';
        div.style.padding = '10px';
        div.style.border = '1px solid #ddd';
        div.style.borderRadius = '5px';
        
        div.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <strong style="min-width: 100px;">${size.toUpperCase()}:</strong>
                <span style="margin-left: 10px; font-size: 12px; color: #666;">${data.size || ''}</span>
            </div>
            <div style="display: flex; align-items: center;">
                <a href="${data.url}" target="_blank" style="flex: 1; word-break: break-all;">
                    ${data.url}
                </a>
                <button onclick="copyToClipboard('${data.url}')" style="margin-left: 10px; padding: 5px 10px;">
                    Copy
                </button>
            </div>
            <img src="${data.url}" 
                 style="max-width: 300px; margin-top: 10px; border: 1px solid #eee; border-radius: 3px;"
                 onerror="this.style.display='none'">
        `;
        imageLinksDiv.appendChild(div);
    });
}

// Load recent images from API
async function loadRecentImages() {
    try {
        const response = await fetch(`${config.apiEndpoint}/images`);
        
        if (response.ok) {
            const data = await response.json();
            
            // Optional: Display recent images section
            if (data.images && data.images.length > 0) {
                console.log('Recent images loaded:', data.images.length);
            }
        }
    } catch (error) {
        console.error('Error loading recent images:', error);
    }
}

// Copy URL to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showStatus('URL copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// Display status messages
function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status-${type}`;
    statusDiv.style.display = 'block';
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            if (statusDiv.textContent === message) {
                statusDiv.style.display = 'none';
            }
        }, 5000);
    }
}

// Cognito functions (to be implemented in Phase 4)
function login() {
    showStatus('Cognito login will be implemented in Phase 4', 'success');
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
}

function logout() {
    showStatus('Logged out successfully', 'success');
    loginBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';
    resultsDiv.style.display = 'none';
    imageLinksDiv.innerHTML = '';
}

// Initialize when page loads
window.onload = function() {
    initAWS();
    
    // Add event listener for file input changes
    fileInput.addEventListener('change', function() {
        if (this.files[0]) {
            const fileName = this.files[0].name;
            showStatus(`Selected: ${fileName}`, 'success');
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 2000);
        }
    });
};