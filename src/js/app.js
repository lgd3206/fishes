// Drawing logic
const canvas = document.getElementById('draw-canvas');
const ctx = canvas.getContext('2d');
ctx.lineWidth = 6; // Make lines thicker for better visibility
let drawing = false;

// Helper function to escape HTML (needed for security)
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Mouse events - Made async to handle checkFishAfterStroke
canvas.addEventListener('mousedown', (e) => {
    drawing = true;
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
});
canvas.addEventListener('mousemove', (e) => {
    if (drawing) {
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
    }
});
canvas.addEventListener('mouseup', async () => {
    drawing = false;
    await checkFishAfterStroke();
});
canvas.addEventListener('mouseleave', () => {
    drawing = false;
});

// Touch events for mobile - Made async to handle checkFishAfterStroke
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    ctx.beginPath();
    ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
});
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (drawing) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
        ctx.stroke();
    }
});
canvas.addEventListener('touchend', async () => {
    drawing = false;
    await checkFishAfterStroke();
});
canvas.addEventListener('touchcancel', () => {
    drawing = false;
});

// Ctrl + Z to undo - Made async
document.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        await undo();
    }
});

// Swim logic (submission only)
const swimBtn = document.getElementById('swim-btn');

// Modal helpers
function showModal(html, onClose) {
    let modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(192,192,192,0.8)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '9999';
    modal.innerHTML = `<div style="background:#c0c0c0;padding:15px;border: 2px outset #808080;min-width:300px;max-width:90vw;max-height:90vh;overflow:auto;font-family:'MS Sans Serif',sans-serif;font-size:11px;">${html}</div>`;
    function close() {
        document.body.removeChild(modal);
        if (onClose) onClose();
    }
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });
    document.body.appendChild(modal);
    return { close, modal };
}

// --- Fish submission modal handler ---
async function submitFish(artist, needsModeration = false) {
    function dataURLtoBlob(dataurl) {
        const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
        return new Blob([u8arr], { type: mime });
    }
    const fishImgData = canvas.toDataURL('image/png');
    const imageBlob = dataURLtoBlob(fishImgData);
    const formData = new FormData();
    formData.append('image', imageBlob, 'fish.png');
    formData.append('artist', artist);
    formData.append('needsModeration', needsModeration.toString());
    if(localStorage.getItem('userId')) {
        formData.append('userId', localStorage.getItem('userId'));
    }
    // Retro loading indicator
    let submitBtn = document.getElementById('submit-fish');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class='spinner' style='display:inline-block;width:18px;height:18px;border:3px solid #3498db;border-top:3px solid #fff;border-radius:50%;animation:spin 1s linear infinite;vertical-align:middle;'></span>`;
    }
    // Add spinner CSS
    if (!document.getElementById('spinner-style')) {
        const style = document.createElement('style');
        style.id = 'spinner-style';
        style.textContent = `@keyframes spin { 0% { transform: rotate(0deg);} 100% { transform: rotate(360deg);} }`;
        document.head.appendChild(style);
    }
    try {
        // Prepare headers with auth data if user is logged in
        const headers = {};
        const userToken = localStorage.getItem('userToken');
        if (userToken) {
            headers['Authorization'] = `Bearer ${userToken}`;
        }
        
        // Check if BACKEND_URL is defined
        if (typeof BACKEND_URL === 'undefined') {
            throw new Error('Backend URL not configured');
        }
        
        // Await server response
        const resp = await fetch(`${BACKEND_URL}/uploadfish`, {
            method: 'POST',
            headers: headers,
            body: formData
        });
        const result = await resp.json();
        // Remove spinner and re-enable button
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit';
        }
        if (result && result.data && result.data.Image) {
            // Save today's date to track fish submission
            const today = new Date().toDateString();
            localStorage.setItem('lastFishDate', today);
            localStorage.setItem('userId', result.data.userId);
            
            // Show success message based on moderation status
            if (needsModeration) {
                showModal(`<div style='text-align:center;'>
                    <h1>Fish Submitted for Review</div>
                    <div>Your fish has been submitted and will appear in the tank once it passes moderator review.</div>
                    <button onclick="window.location.href='tank.html'">View Tank</button>
                </div>`, () => {});
            } else {
                // Regular fish - go directly to tank
                window.location.href = 'tank.html';
            }
        } else {
            alert('Sorry, there was a problem uploading your fish. Please try again.');
        }
    } catch (err) {
        alert('Failed to submit fish: ' + err.message);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit';
        }
    }
}

swimBtn.addEventListener('click', async () => {
    try {
        // Check fish validity for warning purposes
        const isFish = await verifyFishDoodle(canvas);
        lastFishCheck = isFish;
        showFishWarning(!isFish);
        
        // Get saved artist name or use Anonymous
        const savedArtist = localStorage.getItem('artistName');
        const defaultName = (savedArtist && savedArtist !== 'Anonymous') ? savedArtist : 'Anonymous';
        
        // Show different modal based on fish validity
        if (!isFish) {
            // Show moderation warning modal for low-scoring fish
            showModal(`<div style='text-align:center;'>
                <div style='color:#ff6b35;font-weight:bold;margin-bottom:12px;'>Low Fish Score</div>
                <div style='margin-bottom:16px;line-height:1.4;'>i dont think this is a fish but you can submit it anyway and ill review it</div>
                <div style='margin-bottom:16px;'>Sign your art:<br><input id='artist-name' value='${escapeHtml(defaultName)}' style='margin:10px 0 16px 0;padding:6px;width:80%;max-width:180px;'></div>
                <button id='submit-fish' >Submit for Review</button>
                <button id='cancel-fish' >Cancel</button>
            </div>`, () => { });
        } else {
            // Show normal submission modal for good fish
            showModal(`<div style='text-align:center;'>
                <div style='color:#27ae60;font-weight:bold;margin-bottom:12px;'>Great Fish!</div>
                <div style='margin-bottom:16px;'>Sign your art:<br><input id='artist-name' value='${escapeHtml(defaultName)}' style='margin:10px 0 16px 0;padding:6px;width:80%;max-width:180px;'></div>
                <button id='submit-fish' style='padding:6px 18px;background:#27ae60;color:white;border:none;border-radius:4px;'>Submit</button>
                <button id='cancel-fish' style='padding:6px 18px;margin-left:10px;background:#ccc;border:none;border-radius:4px;'>Cancel</button>
            </div>`, () => { });
        }
        
        document.getElementById('submit-fish').onclick = async () => {
            const artist = document.getElementById('artist-name').value.trim() || 'Anonymous';
            // Save artist name to localStorage for future use
            localStorage.setItem('artistName', artist);
            await submitFish(artist, !isFish); // Pass moderation flag
        };
        document.getElementById('cancel-fish').onclick = () => {
            document.querySelector('div[style*="z-index: 9999"]')?.remove();
        };
    } catch (error) {
        console.error('Error in swim button click:', error);
        alert('Sorry, there was an error processing your fish. Please try again.');
    }
});

// Paint options UI
const colors = ['#000000', '#ff0000', '#00cc00', '#0000ff', '#ffff00', '#ff8800', '#ffffff'];
let currentColor = colors[0];
let currentLineWidth = 6;
let undoStack = [];

function createPaintOptions() {
    let paintBar = document.getElementById('paint-bar');
    if (!paintBar) {
        paintBar = document.createElement('div');
        paintBar.id = 'paint-bar';
        paintBar.style.display = 'flex';
        paintBar.style.flexWrap = 'wrap';
        paintBar.style.gap = '8px';
        paintBar.style.margin = '8px auto';
        paintBar.style.alignItems = 'center';
        paintBar.style.justifyContent = 'center';
        paintBar.style.padding = '6px 10px';
        paintBar.style.maxWidth = '100%';
        paintBar.style.overflowX = 'auto';
        // Insert at the top of draw-ui
        const drawUI = document.getElementById('draw-ui');
        if (drawUI) drawUI.insertBefore(paintBar, drawUI.firstChild);
    } else {
        paintBar.innerHTML = '';
    }
    
    // Create a container for colors to make them wrap better on mobile
    const colorContainer = document.createElement('div');
    colorContainer.style.display = 'flex';
    colorContainer.style.flexWrap = 'wrap';
    colorContainer.style.gap = '4px';
    colorContainer.style.alignItems = 'center';
    
    // Color buttons
    colors.forEach(color => {
        const btn = document.createElement('button');
        btn.style.background = color;
        btn.style.width = '24px';
        btn.style.height = '24px';
        btn.style.minWidth = '24px';
        btn.style.minHeight = '24px';
        btn.style.border = '1px solid #000';
        btn.style.cursor = 'pointer';
        btn.style.borderRadius = '50%';
        btn.title = color;
        btn.onclick = () => {
            ctx.globalCompositeOperation = 'source-over';
            currentColor = color;
            ctx.strokeStyle = color;
        };
        colorContainer.appendChild(btn); 
    });
    paintBar.appendChild(colorContainer);

    // Create a controls container for better mobile layout
    const controlsContainer = document.createElement('div');
    controlsContainer.style.display = 'flex';
    controlsContainer.style.flexWrap = 'wrap';
    controlsContainer.style.gap = '8px';
    controlsContainer.style.alignItems = 'center';
    controlsContainer.style.justifyContent = 'center';
    controlsContainer.style.marginTop = '8px';

    // Eraser
    const eraserBtn = document.createElement('button');
    eraserBtn.textContent = 'Eraser';
    eraserBtn.style.padding = '4px 8px';
    eraserBtn.style.height = '24px';
    eraserBtn.style.fontSize = '12px';
    eraserBtn.style.borderRadius = '4px';
    eraserBtn.style.cursor = 'pointer';
    eraserBtn.onclick = () => {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = currentLineWidth;
    };
    controlsContainer.appendChild(eraserBtn);

    // Line width container
    const widthContainer = document.createElement('div');
    widthContainer.style.display = 'flex';
    widthContainer.style.alignItems = 'center';
    widthContainer.style.gap = '4px';
    
    const widthLabel = document.createElement('span');
    widthLabel.textContent = 'Size:';
    widthLabel.style.fontSize = '12px';
    widthContainer.appendChild(widthLabel);
    
    const widthSlider = document.createElement('input');
    widthSlider.type = 'range';
    widthSlider.min = 1;
    widthSlider.max = 20;
    widthSlider.value = currentLineWidth;
    widthSlider.style.width = '80px';
    widthSlider.oninput = () => {
        currentLineWidth = widthSlider.value;
    };
    widthContainer.appendChild(widthSlider);
    controlsContainer.appendChild(widthContainer);
    
    paintBar.appendChild(controlsContainer);
}
createPaintOptions();

function pushUndo() {
    // Save current canvas state as image data
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    // Limit stack size
    if (undoStack.length > 30) undoStack.shift();
}

// Made async to handle checkFishAfterStroke
async function undo() {
    if (undoStack.length > 0) {
        const imgData = undoStack.pop();
        ctx.putImageData(imgData, 0, 0);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    // Recalculate fish probability after undo
    await checkFishAfterStroke();
}

// Made async to handle checkFishAfterStroke
async function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await checkFishAfterStroke();
}

// Made async to handle checkFishAfterStroke
async function flipCanvas() {
    // Save current state to undo stack before flipping
    pushUndo();
    
    // Get current canvas content
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Create a temporary canvas to perform the flip
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    
    // Put the current image data on the temp canvas
    tempCtx.putImageData(imageData, 0, 0);
    
    // Clear the main canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save the context state
    ctx.save();
    
    // Flip horizontally by scaling x by -1 and translating
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    
    // Draw the flipped image
    ctx.drawImage(tempCanvas, 0, 0);
    
    // Restore the context state
    ctx.restore();
    
    // Recompute fish score after flipping
    await checkFishAfterStroke();
}

function createUndoButton() {
    let paintBar = document.getElementById('paint-bar');
    if (paintBar) {
        // Find the controls container
        let controlsContainer = paintBar.querySelector('div:last-child');
        if (controlsContainer) {
            const undoBtn = document.createElement('button');
            undoBtn.textContent = 'Undo';
            undoBtn.style.padding = '4px 8px';
            undoBtn.style.height = '24px';
            undoBtn.style.fontSize = '12px';
            undoBtn.style.borderRadius = '4px';
            undoBtn.style.cursor = 'pointer';
            // Made async to handle undo
            undoBtn.onclick = async () => await undo();
            controlsContainer.appendChild(undoBtn);
        }
    }
}

function createClearButton() {
    let paintBar = document.getElementById('paint-bar');
    if (paintBar) {
        // Find the controls container
        let controlsContainer = paintBar.querySelector('div:last-child');
        if (controlsContainer) {
            const clearBtn = document.createElement('button');
            clearBtn.textContent = 'Clear';
            clearBtn.style.padding = '4px 8px';
            clearBtn.style.height = '24px';
            clearBtn.style.fontSize = '12px';
            clearBtn.style.borderRadius = '4px';
            clearBtn.style.cursor = 'pointer';
            // Made async to handle clearCanvas
            clearBtn.onclick = async () => await clearCanvas();
            controlsContainer.appendChild(clearBtn);
        }
    }
}

function createFlipButton() {
    let paintBar = document.getElementById('paint-bar');
    if (paintBar) {
        // Find the controls container
        let controlsContainer = paintBar.querySelector('div:last-child');
        if (controlsContainer) {
            const flipBtn = document.createElement('button');
            flipBtn.textContent = 'Flip';
            flipBtn.style.padding = '4px 8px';
            flipBtn.style.height = '24px';
            flipBtn.style.fontSize = '12px';
            flipBtn.style.borderRadius = '4px';
            flipBtn.style.cursor = 'pointer';
            // Made async to handle flipCanvas
            flipBtn.onclick = async () => await flipCanvas();
            controlsContainer.appendChild(flipBtn);
        }
    }
}

// Push to undo stack before every new stroke
canvas.addEventListener('mousedown', pushUndo);
canvas.addEventListener('touchstart', pushUndo);

// Add undo button to paint bar
createUndoButton();

// Add clear button to paint bar
createClearButton();

// Add flip button to paint bar
createFlipButton();

// Update drawing color and line width
canvas.addEventListener('mousedown', () => {
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentLineWidth;
});
canvas.addEventListener('touchstart', () => {
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentLineWidth;
});

// Helper to crop whitespace (transparent or white) from a canvas
function cropCanvasToContent(srcCanvas) {
    const ctx = srcCanvas.getContext('2d');
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    let minX = w, minY = h, maxX = 0, maxY = 0;
    let found = false;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const r = imgData.data[i];
            const g = imgData.data[i + 1];
            const b = imgData.data[i + 2];
            const a = imgData.data[i + 3];
            // Consider non-transparent and not white as content
            if (a > 16 && !(r > 240 && g > 240 && b > 240)) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }
    if (!found) return srcCanvas; // No content found
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const cropped = document.createElement('canvas');
    cropped.width = cropW;
    cropped.height = cropH;
    cropped.getContext('2d').drawImage(srcCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return cropped;
}

// Helper to crop, scale, and center a fish image into a display canvas
function makeDisplayFishCanvas(img, width = 80, height = 48) {
    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = width;
    displayCanvas.height = height;
    const displayCtx = displayCanvas.getContext('2d');
    // Draw image to temp canvas at its natural size
    const temp = document.createElement('canvas');
    temp.width = img.width;
    temp.height = img.height;
    temp.getContext('2d').drawImage(img, 0, 0);
    const cropped = cropCanvasToContent(temp);
    displayCtx.clearRect(0, 0, width, height);
    const scale = Math.min(width / cropped.width, height / cropped.height);
    const drawW = cropped.width * scale;
    const drawH = cropped.height * scale;
    const dx = (width - drawW) / 2;
    const dy = (height - drawH) / 2;
    displayCtx.drawImage(cropped, 0, 0, cropped.width, cropped.height, dx, dy, drawW, drawH);
    return displayCanvas;
}

// ONNX fish doodle classifier integration
let ortSession = null;
let lastFishCheck = true;
let isModelLoading = false;
let modelLoadPromise = null;

// Load ONNX model (make sure fish_doodle_classifier.onnx is in your public folder)
async function loadFishModel() {
    // If already loaded, return immediately
    if (ortSession) {
        return ortSession;
    }
    
    // If already loading, return the existing promise
    if (isModelLoading && modelLoadPromise) {
        return modelLoadPromise;
    }
    
    // Start loading
    isModelLoading = true;
    console.log('Loading fish model...');
    
    modelLoadPromise = (async () => {
        try {
            ortSession = await window.ort.InferenceSession.create('fish_doodle_classifier.onnx');
            console.log('Fish model loaded successfully');
            return ortSession;
        } catch (error) {
            console.error('Failed to load fish model:', error);
            throw error;
        } finally {
            isModelLoading = false;
        }
    })();
    
    return modelLoadPromise;
}

// Updated preprocessing to match new grayscale model (3-channel) with ImageNet normalization
function preprocessCanvasForONNX(canvas) {
    const SIZE = 224; // Standard ImageNet input size
    
    // Create a temporary canvas for resizing
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = SIZE;
    tempCanvas.height = SIZE;
    
    // Fill with white background (matching WhiteBgLoader in Python)
    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, SIZE, SIZE);
    
    // Draw the original canvas onto the temp canvas (resized)
    tempCtx.drawImage(canvas, 0, 0, SIZE, SIZE);
    
    // Get image data
    const imageData = tempCtx.getImageData(0, 0, SIZE, SIZE);
    const data = imageData.data;
    
    // Create input tensor array [1, 3, 224, 224] - CHW format
    const input = new Float32Array(1 * 3 * SIZE * SIZE);
    
    // ImageNet normalization values (same as in Python code)
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    
    // Convert RGBA to RGB and normalize
    for (let i = 0; i < SIZE * SIZE; i++) {
        const pixelIndex = i * 4; // RGBA format
        
        // Extract RGB values (0-255)
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        
        // Convert to [0, 1] range
        const rNorm = r / 255.0;
        const gNorm = g / 255.0;
        const bNorm = b / 255.0;
        
        // Apply ImageNet normalization: (pixel - mean) / std
        const rStandardized = (rNorm - mean[0]) / std[0];
        const gStandardized = (gNorm - mean[1]) / std[1];
        const bStandardized = (bNorm - mean[2]) / std[2];
        
        // Store in CHW format (Channel-Height-Width)
        // R channel: indices 0 to SIZE*SIZE-1
        // G channel: indices SIZE*SIZE to 2*SIZE*SIZE-1  
        // B channel: indices 2*SIZE*SIZE to 3*SIZE*SIZE-1
        input[i] = rStandardized;                    // R channel
        input[i + SIZE * SIZE] = gStandardized;      // G channel
        input[i + 2 * SIZE * SIZE] = bStandardized;  // B channel
    }
    
    return new window.ort.Tensor('float32', input, [1, 3, SIZE, SIZE]);
}

// Updated verifyFishDoodle function to match new model output format
async function verifyFishDoodle(canvas) {
    try {
        // Model should already be loaded, but check just in case
        if (!ortSession) {
            throw new Error('Fish model not loaded');
        }
        
        // Use updated preprocessing
        const inputTensor = preprocessCanvasForONNX(canvas);
        
        // Run inference
        let feeds = {};
        if (ortSession && ortSession.inputNames && ortSession.inputNames.length > 0) {
            feeds[ortSession.inputNames[0]] = inputTensor;
        } else {
            feeds['input'] = inputTensor;
        }
        const results = await ortSession.run(feeds);
        const outputKey = Object.keys(results)[0];
        const output = results[outputKey].data;
        
        // The model outputs a single logit value
        // During training: labels = 1 - labels, so fish = 0, not_fish = 1
        // Model output > 0.5 means "not_fish", < 0.5 means "fish"
        const logit = output[0];
        const prob = 1 / (1 + Math.exp(-logit));  // Sigmoid activation
        
        // Since the model was trained with inverted labels (fish=0, not_fish=1)
        // A low probability means it's more likely to be a fish
        const fishProbability = 1 - prob;
        const isFish = fishProbability >= 0.60;  // Threshold for fish classification
            
        // Update UI with fish probability
        let probDiv = document.getElementById('fish-probability');
        if (!probDiv) {
            probDiv = document.createElement('div');
            probDiv.id = 'fish-probability';
            probDiv.style.textAlign = 'center';
            probDiv.style.margin = '10px 0 0 0';
            probDiv.style.fontWeight = 'bold';
            probDiv.style.fontSize = '1.1em';
            probDiv.style.color = isFish ? '#218838' : '#c0392b';
            const drawCanvas = document.getElementById('draw-canvas');
            if (drawCanvas && drawCanvas.parentNode) {
                if (drawCanvas.nextSibling) {
                    drawCanvas.parentNode.insertBefore(probDiv, drawCanvas.nextSibling);
                } else {
                    drawCanvas.parentNode.appendChild(probDiv);
                }
            } else {
                const drawUI = document.getElementById('draw-ui');
                if (drawUI) drawUI.appendChild(probDiv);
            }
        }
        probDiv.textContent = `Fish probability: ${(fishProbability * 100).toFixed(1)}%`;
        probDiv.style.color = isFish ? '#218838' : '#c0392b';
        return isFish;
    } catch (error) {
        console.error('Error in verifyFishDoodle:', error);
        // Return true as fallback to avoid blocking user interaction
        return true;
    }
}

// Show/hide fish warning and update background color
function showFishWarning(show) {
    const drawUI = document.getElementById('draw-ui');
    if (drawUI) {
        drawUI.style.background = show ? '#ffeaea' : '#eaffea'; // red for invalid, green for valid
        drawUI.style.transition = 'background 0.3s';
    }
}

// After each stroke, check if it's a fish
async function checkFishAfterStroke() {
    try {
        if (!window.ort) return; // ONNX runtime not loaded
        
        // Wait for model to be loaded if it's not ready yet
        if (!ortSession) {
            try {
                await loadFishModel();
            } catch (error) {
                console.error('Model not available for fish checking:', error);
                return;
            }
        }
        
        const isFish = await verifyFishDoodle(canvas);
        lastFishCheck = isFish;
        showFishWarning(!isFish);
    } catch (error) {
        console.error('Error in checkFishAfterStroke:', error);
        // Silently fail and assume it's a fish to avoid disrupting user experience
        lastFishCheck = true;
        showFishWarning(false);
    }
}

// Load ONNX Runtime Web from CDN if not present
(function ensureONNXRuntime() {
    if (!window.ort) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js';
        script.onload = () => { 
            console.log('ONNX Runtime loaded, starting model load...');
            loadFishModel().catch(error => {
                console.error('Failed to load model on startup:', error);
            });
        };
        script.onerror = () => {
            console.error('Failed to load ONNX Runtime from CDN');
        };
        document.head.appendChild(script);
    } else {
        console.log('ONNX Runtime already available, starting model load...');
        loadFishModel().catch(error => {
            console.error('Failed to load model on startup:', error);
        });
    }
})();

// Check if user already drew a fish today when page loads
// Function to show welcome back message for returning users
function showWelcomeBackMessage() {
    const userId = localStorage.getItem('userId');
    const artistName = localStorage.getItem('artistName');
    const userToken = localStorage.getItem('userToken');
    const userData = localStorage.getItem('userData');
    const welcomeElement = document.getElementById('welcome-back-message');
    
    if (!welcomeElement) return; // Element doesn't exist
    
    // Only show for users who have interacted before but haven't created an account
    if (userId && artistName && artistName !== 'Anonymous' && !userToken) {
        welcomeElement.innerHTML = `
            Welcome back, <strong>${escapeHtml(artistName)}</strong>! 
            <a href="login.html" style="color: #0066cc; text-decoration: underline;">Create an account</a> 
            to build custom tanks and share with friends.
        `;
        welcomeElement.style.display = 'block';
    } else if (userToken && userData) {
        // For authenticated users, show a simple welcome with their display name
        try {
            const user = JSON.parse(userData);
            const displayName = user.displayName || 'Artist';
            welcomeElement.innerHTML = `Welcome back, <strong>${escapeHtml(displayName)}</strong>! 🎨`;
            welcomeElement.style.background = '#e8f5e8';
            welcomeElement.style.borderColor = '#b3d9b3';
            welcomeElement.style.display = 'block';
        } catch (e) {
            // If userData is malformed, don't show anything
            console.warn('Malformed userData in localStorage');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Show welcome back message for returning users
    showWelcomeBackMessage();
    
    const today = new Date().toDateString();
    const lastFishDate = localStorage.getItem('lastFishDate');
    console.log(`Last fish date: ${lastFishDate}, Today: ${today}`);
    if (lastFishDate === today) {
        showModal(`<div style='text-align:center;'>You already drew a fish today!<br><br>
            <button id='go-to-tank' style='padding:8px 16px; margin: 0 5px;'>Take me to fishtank</button>
            <button id='draw-another' style='padding:8px 16px; margin: 0 5px;'>I want to draw another fish</button></div>`, () => { });
        
        document.getElementById('go-to-tank').onclick = () => {
            window.location.href = 'tank.html';
        };
        
        document.getElementById('draw-another').onclick = () => {
            document.querySelector('div[style*="z-index: 9999"]')?.remove();
        };
    }
});
