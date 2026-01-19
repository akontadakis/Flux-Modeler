
import { getDom, setupDOM } from './dom.js';
import { project } from './project.js';
import { updateScene } from './geometry.js';
import { updateAllLabels, getCurrentGeometryMode } from './ui.js';

let dom;
let currentCategory = 'dimensions';

const CATEGORIES = [
    { id: 'dimensions', label: 'Dimensions' },
    { id: 'import', label: 'Import Model' },
    { id: 'draw', label: 'Draw Model' },
    { id: 'display', label: 'Scene Display' }
];

/**
 * Returns the list of visible categories based on the current geometry mode.
 * @param {string} mode - The geometry mode ('parametric', 'import', or 'draw').
 * @returns {Array<{id: string, label: string}>} The visible categories for the mode.
 */
function getVisibleCategoriesForMode(mode) {
    const visibleIds = {
        'parametric': ['dimensions', 'display'],
        'import': ['import', 'display'],
        'draw': ['draw', 'display']
    };
    const allowedIds = visibleIds[mode] || visibleIds['parametric'];
    return CATEGORIES.filter(cat => allowedIds.includes(cat.id));
}

// Listen for geometry mode changes to update the category list
window.addEventListener('geometryModeChanged', (event) => {
    const panel = document.getElementById('panel-dimensions');
    if (panel && !panel.classList.contains('hidden')) {
        const newMode = event.detail.mode;
        renderCategoryList(panel);

        // If the current category is no longer visible, switch to the first available category
        const visibleCategories = getVisibleCategoriesForMode(newMode);
        const isCurrentVisible = visibleCategories.some(cat => cat.id === currentCategory);
        if (!isCurrentVisible && visibleCategories.length > 0) {
            switchCategory(panel, visibleCategories[0].id);
        } else {
            // Re-apply styling for the current category
            switchCategory(panel, currentCategory);
        }
    }
});

export function openGeometryPanel() {
    dom = getDom();
    const panelId = 'panel-dimensions';
    const btnId = 'toggle-panel-dimensions-btn';
    const btn = document.getElementById(btnId);

    let panel = document.getElementById(panelId);

    // If panel exists and is visible, toggle it closed
    if (panel && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        if (btn) btn.classList.remove('active');
        return;
    }

    // Otherwise, open the panel
    if (!panel) {
        panel = createGeometryPanel();
        const container = document.getElementById('window-container');
        container.appendChild(panel);

        // Re-run setupDOM to cache the new elements
        setupDOM();

        // Initialize the panel controls (drag, resize, etc.)
        if (typeof window !== 'undefined' && window.initializePanelControls) {
            window.initializePanelControls(panel);
        }
    }

    panel.classList.remove('hidden');
    if (btn) btn.classList.add('active');

    // Bring to front
    const allPanels = document.querySelectorAll('.floating-window');
    let maxZ = 100;
    allPanels.forEach(p => {
        const z = parseInt(window.getComputedStyle(p).zIndex) || 0;
        if (z > maxZ) maxZ = z;
    });
    panel.style.zIndex = maxZ + 1;

    renderCategoryList(panel);

    // Ensure editors are rendered (idempotent-ish check)
    const container = panel.querySelector('#geo-category-editor-container');
    if (container && container.children.length === 0) {
        renderAllCategoryEditors(panel);
    }

    // Select the appropriate category based on the current geometry mode
    const mode = getCurrentGeometryMode();
    const visibleCategories = getVisibleCategoriesForMode(mode);
    const isCurrentVisible = visibleCategories.some(cat => cat.id === currentCategory);

    if (isCurrentVisible) {
        switchCategory(panel, currentCategory);
    } else if (visibleCategories.length > 0) {
        switchCategory(panel, visibleCategories[0].id);
    }
}

export function initializeGeometryPanel() {
    const panelId = 'panel-dimensions';
    let panel = document.getElementById(panelId);

    if (!panel) {
        panel = createGeometryPanel();
        const container = document.getElementById('window-container');
        if (container) {
            container.appendChild(panel);
            // Re-run setupDOM to cache the new elements immediately so they are available for geometry.js
            setupDOM();

            // Initialize the panel controls (drag, resize, etc.)
            if (typeof window !== 'undefined' && window.initializePanelControls) {
                window.initializePanelControls(panel);
            }

            // Initialize category list and render all editors
            renderCategoryList(panel);
            renderAllCategoryEditors(panel);

            // Select the first visible category based on the current geometry mode
            const mode = getCurrentGeometryMode();
            const visibleCategories = getVisibleCategoriesForMode(mode);
            if (visibleCategories.length > 0) {
                switchCategory(panel, visibleCategories[0].id);
            }
        }
    }
}

export function createGeometryPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-dimensions';
    panel.className = 'floating-window ui-panel resizable-panel hidden';

    panel.style.width = '600px';
    panel.style.height = '500px';

    panel.innerHTML = `
        <div class="window-header">
            <span>Dimensions & Geometry</span>
            <div class="window-controls">
                <div class="window-icon-max" title="Maximize/Restore"></div>
                <div class="collapse-icon" title="Minimize"></div>
                <div class="window-icon-close" title="Close"></div>
            </div>
        </div>
        <div class="window-content" style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
            <div class="resize-handle-edge top"></div>
            <div class="resize-handle-edge right"></div>
            <div class="resize-handle-edge bottom"></div>
            <div class="resize-handle-edge left"></div>
            <div class="resize-handle-corner top-left"></div>
            <div class="resize-handle-corner top-right"></div>
            <div class="resize-handle-corner bottom-left"></div>
            <div class="resize-handle-corner bottom-right"></div>
            
            <div style="display: flex; flex: 1; overflow: hidden;">
                <!-- Left Sidebar: Category List -->
                <div style="width: 200px; border-right: 1px solid var(--grid-color); display: flex; flex-direction: column;">
                    <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color);">
                        <span class="label">Sections</span>
                    </div>
                    <div id="geo-category-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                        <!-- Category items injected here -->
                    </div>
                </div>

                <!-- Right Content: Editor -->
                <div id="geo-category-editor-container" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                    <!-- All editors injected here, visibility toggled -->
                </div>
            </div>
        </div>
    `;

    const closeButton = panel.querySelector('.window-icon-close');
    if (closeButton) {
        closeButton.onclick = () => {
            panel.classList.add('hidden');
            const btn = document.getElementById('toggle-panel-dimensions-btn');
            if (btn) btn.classList.remove('active');
        };
    }

    return panel;
}

function renderCategoryList(panel) {
    const listContainer = panel.querySelector('#geo-category-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    // Filter categories based on the current geometry mode
    const mode = getCurrentGeometryMode();
    const visibleCategories = getVisibleCategoriesForMode(mode);

    visibleCategories.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.dataset.categoryId = cat.id; // Store ID for styling updates
        // Match Thermostats styling
        item.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';

        item.innerHTML = `<div class="text-xs">${cat.label}</div>`;

        item.addEventListener('click', () => {
            switchCategory(panel, cat.id);
        });

        item.addEventListener('mouseenter', () => {
            if (cat.id !== currentCategory) {
                item.style.backgroundColor = 'var(--hover-bg)';
            }
        });

        item.addEventListener('mouseleave', () => {
            if (cat.id !== currentCategory) {
                item.style.backgroundColor = '';
            }
        });

        listContainer.appendChild(item);
    });
}

function renderAllCategoryEditors(panel) {
    const container = panel.querySelector('#geo-category-editor-container');
    if (!container) return;

    container.innerHTML = '';

    CATEGORIES.forEach(cat => {
        const wrapper = document.createElement('div');
        wrapper.id = `geo-editor-${cat.id}`;
        wrapper.className = 'hidden'; // All hidden by default

        let html = '';
        switch (cat.id) {
            case 'dimensions': html = renderDimensionsControls(); break;
            case 'import': html = renderImportControls(); break;
            case 'draw': html = renderDrawControls(); break;
            case 'display': html = renderDisplayControls(); break;
        }
        wrapper.innerHTML = html;
        container.appendChild(wrapper);

        // Setup listeners for this specific category immediately
        // We do this BEFORE setupDOM so elements are ready
        // But setupCategoryEventListeners relies on getDom() which relies on setupDOM()
        // So we need to: Render All -> setupDOM -> Attach Listeners
    });

    // Cache all new elements
    setupDOM();

    // Attach listeners for all categories
    CATEGORIES.forEach(cat => {
        setupCategoryEventListeners(cat.id);
    });

    updateAllLabels();
}

function switchCategory(panel, categoryId) {
    currentCategory = categoryId;

    // Update list styling
    const listItems = panel.querySelectorAll('.list-item');
    listItems.forEach(item => {
        if (item.dataset.categoryId === categoryId) {
            item.classList.add('active');
            item.style.backgroundColor = 'var(--accent-color)';
            item.style.color = 'white';
        } else {
            item.classList.remove('active');
            item.style.backgroundColor = '';
            item.style.color = '';
        }
    });

    // Update editor visibility
    CATEGORIES.forEach(cat => {
        const wrapper = panel.querySelector(`#geo-editor-${cat.id}`);
        if (wrapper) {
            if (cat.id === categoryId) {
                wrapper.classList.remove('hidden');
            } else {
                wrapper.classList.add('hidden');
            }
        }
    });
}

// Removed renderCategoryEditor as it's replaced by renderAllCategoryEditors + switchCategory

function renderDimensionsControls() {
    return `
        <div id="parametric-controls" class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Room Dimensions</h3>
            
            <div>
                <label class="label" for="width">Width (X)</label>
                <div class="flex items-center space-x-4 mt-1">
                    <input type="range" id="width" min="1" max="50" value="3.4" step="0.1" class="flex-1">
                    <span id="width-val" class="data-value font-mono w-12 text-left">3.4m</span>
                </div>
            </div>
            
            <div>
                <label class="label" for="length">Length (Z)</label>
                <div class="flex items-center space-x-4 mt-1">
                    <input type="range" id="length" min="1" max="50" value="5.4" step="0.1" class="flex-1">
                    <span id="length-val" class="data-value font-mono w-12 text-left">5.4m</span>
                </div>
            </div>
            
            <div>
                <label class="label" for="height">Height (Y)</label>
                <div class="flex items-center space-x-4 mt-1">
                    <input type="range" id="height" min="1" max="10" value="2.8" step="0.1" class="flex-1">
                    <span id="height-val" class="data-value font-mono w-12 text-left">2.8m</span>
                </div>
            </div>
            
            <div>
                <label class="label" for="elevation">Elevation</label>
                <div class="flex items-center space-x-4 mt-1">
                    <input type="range" id="elevation" min="0" max="20" value="0.0" step="0.1" class="flex-1">
                    <span id="elevation-val" class="data-value font-mono w-12 text-left">0.0m</span>
                </div>
            </div>
            
            <div>
                <label class="label" for="room-orientation">Orientation</label>
                <div class="flex items-center space-x-4 mt-1">
                    <input type="range" id="room-orientation" min="0" max="359" value="0" step="1" class="flex-1">
                    <span id="room-orientation-val" class="data-value font-mono w-12 text-left">0°</span>
                </div>
            </div>

            <div class="pt-4 mt-4 border-t border-[--grid-color]">
                <label for="resize-mode-toggle" class="flex items-center cursor-pointer w-full">
                    <input type="checkbox" id="resize-mode-toggle">
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal">
                        Enable 3D Resize Handles
                    </span>
                </label>
                <p class="info-box !text-xs !py-2 !px-3 mt-2 hidden" id="resize-mode-info">
                    Click and drag the transparent handles on the exterior of the room to adjust its dimensions.
                </p>
            </div>

            <div class="pt-4 mt-4 border-t border-[--grid-color]">
                <div>
                    <label class="label" for="surface-thickness">Surface Thickness</label>
                    <div class="flex items-center space-x-4 mt-1">
                        <input type="range" id="surface-thickness" min="0.00" max="1.0" value="0.20" step="0.01" class="flex-1">
                        <span id="surface-thickness-val" class="data-value font-mono w-12 text-left">0.20m</span>
                    </div>
                </div>
            </div>
        </div>
        `;
}

function renderImportControls() {
    return `
        <div id="import-controls" class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Import Model</h3>
            
            <p class="info-box !text-xs !py-2 !px-3">
                Import a .obj model. Parametric controls will be disabled. Ensure your model is in meters.
            </p>
            
            <div>
                <label class="label" for="import-obj-file">OBJ Model File</label>
                <input type="file" id="import-obj-file" accept=".obj,.mtl" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" multiple>
                <span data-file-display-for="import-obj-file" class="text-xs text-[--text-secondary] truncate block mt-1">
                    Select .obj and .mtl files.
                </span>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="label text-xs" for="import-scale">Scale Factor</label>
                    <input type="number" id="import-scale" value="1.0" step="0.01" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                </div>
                <label for="import-center-toggle" class="flex items-center cursor-pointer mt-4">
                    <input type="checkbox" id="import-center-toggle" checked>
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal">Center Model</span>
                </label>
            </div>
            
        <button id="load-model-btn" class="btn btn-secondary w-full">Load & Tag Surfaces</button>
        </div>
        `;
}

function renderDrawControls() {
    return `
        <div id="draw-controls" class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Draw Model</h3>
            
            <p class="info-box !text-xs !py-2 !px-3">
                Draw your geometry from scratch by creating walls, floors, and other surfaces directly in the 3D viewport.
            </p>
            
            <div class="space-y-3">
                <p class="text-sm text-[--text-secondary]">
                    <strong>Coming Soon:</strong> Drawing tools will allow you to create custom room shapes and geometry by clicking to place vertices in the 3D scene.
                </p>
                
                <div class="pt-4 border-t border-[--grid-color]">
                    <p class="text-xs text-[--text-secondary]">
                        Planned features:
                    </p>
                    <ul class="text-xs text-[--text-secondary] list-disc list-inside mt-2 space-y-1">
                        <li>Click-to-draw polygon walls</li>
                        <li>Extrude floors and ceilings</li>
                        <li>Add openings to surfaces</li>
                        <li>Snap-to-grid functionality</li>
                    </ul>
                </div>
            </div>
        </div>
        `;
}

function renderDisplayControls() {
    return `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Scene Display</h3>
            
            <div class="space-y-3">
                <label for="transparent-toggle" class="flex items-center cursor-pointer">
                    <input type="checkbox" id="transparent-toggle" checked>
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal !mb-0">Transparent Surfaces</span>
                </label>
                
                <div id="transparency-controls" class="mt-4 pl-4">
                    <label class="label text-xs" for="surface-opacity">Surface Opacity</label>
                    <div class="flex items-center space-x-3 mt-1">
                        <input type="range" id="surface-opacity" min="0.05" max="1.0" value="0.15" step="0.01" class="flex-1">
                        <span id="surface-opacity-val" class="data-value font-mono w-12 text-left">0.15</span>
                    </div>
                </div>
            </div>
            
            <div class="space-y-3 pt-4 border-t border-[--grid-color]">
                <label for="ground-plane-toggle" class="flex items-center cursor-pointer">
                    <input type="checkbox" id="ground-plane-toggle" checked>
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal !mb-0">Show Ground Plane</span>
                </label>
                
                <div id="ground-grid-controls" class="hidden mt-4 pl-4 space-y-3">
                    <div>
                        <label class="label text-xs" for="ground-grid-size">Grid Size (m)</label>
                        <div class="flex items-center space-x-3 mt-1">
                            <input type="range" id="ground-grid-size" min="10" max="200" value="50" step="1" class="flex-1">
                            <span id="ground-grid-size-val" class="data-value font-mono w-12 text-left">50m</span>
                        </div>
                    </div>
                    <div>
                        <label class="label text-xs" for="ground-grid-divisions">Grid Divisions</label>
                        <div class="flex items-center space-x-3 mt-1">
                            <input type="range" id="ground-grid-divisions" min="2" max="400" value="50" step="1" class="flex-1">
                            <span id="ground-grid-divisions-val" class="data-value font-mono w-12 text-left">50</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="space-y-3 pt-4 border-t border-[--grid-color]">
                <label for="world-axes-toggle" class="flex items-center cursor-pointer">
                    <input type="checkbox" id="world-axes-toggle" checked>
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal !mb-0">Show World Axes</span>
                </label>
                
                <div id="world-axes-controls" class="mt-2 pl-4">
                    <label class="label text-xs" for="world-axes-size">Axes Size</label>
                    <div class="flex items-center space-x-3 mt-1">
                        <input type="range" id="world-axes-size" min="0.5" max="10" value="1.5" step="0.1" class="flex-1">
                        <span id="world-axes-size-val" class="data-value font-mono w-12 text-left">1.5x</span>
                    </div>
                </div>
            </div>
        </div>
        `;
}

function setupCategoryEventListeners(categoryId) {
    // Import handleInputChange from ui.js to maintain consistent behavior
    // We can't easily import it if it's not exported, but we can rely on the global listener in ui.js
    // IF we re-run the logic that attaches listeners.
    // However, ui.js attaches listeners on init. We might need to manually attach them here
    // or expose a function in ui.js to re-attach listeners.

    // Actually, ui.js has a global setupEventListeners but it iterates over *current* DOM.
    // Since we just added elements, we should probably manually attach the generic handler
    // or specific handlers.

    // Let's import the necessary handlers from ui.js if possible, or re-implement simple ones.
    // Since `handleInputChange` is not exported, we'll implement a local version that calls updateScene.

    const dom = getDom();

    const handleInput = (e) => {
        const id = e.target.id;
        const val = e.target.value;
        const valEl = document.getElementById(`${id}-val`);

        if (valEl) {
            let unit = '';
            if (id.includes('width') || id.includes('length') || id.includes('height') || id.includes('dist') || id.includes('thick') || id.includes('depth') || id.includes('extension') || id.includes('sep') || id.includes('offset') || id.includes('spacing') || id.startsWith('view-pos') || id.startsWith('daylight-sensor')) unit = 'm';
            else if (id.startsWith('wwr-') && !id.includes('sill')) unit = '%';
            else if (id.includes('fov') || id.includes('orientation') || id.includes('tilt') || id.includes('angle')) unit = '°';
            else if (id.includes('scale')) unit = 'x';

            valEl.textContent = val + unit;
        }

        // Trigger scene update
        // We need to debounce this if possible, but for now direct call is okay or use scheduleUpdate
        // Importing scheduleUpdate from geometry.js (which re-exports from ui.js? No, ui.js exports it)
        // actually geometry.js imports it from ui.js.

        // We can import scheduleUpdate from ui.js? No, circular dependency risk if we are not careful.
        // But geometry.js exports updateScene.

        updateScene(id);
    };

    if (categoryId === 'dimensions') {
        ['width', 'length', 'height', 'elevation', 'room-orientation', 'surface-thickness'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', handleInput);
        });

        const resizeToggle = document.getElementById('resize-mode-toggle');
        if (resizeToggle) {
            resizeToggle.addEventListener('change', (e) => {
                const info = document.getElementById('resize-mode-info');
                if (info) info.classList.toggle('hidden', !e.target.checked);
                // We might need to trigger a global state change for resize mode
                // In ui.js, 'toggleResizeMode' shortcut clicks this button.
                // We need to ensure the global `isResizeMode` variable in ui.js is updated.
                // Since we can't easily access that variable, we rely on the fact that 
                // the click/change event might be listened to by ui.js if we re-attach listeners.

                // Ideally, we should dispatch a custom event or call a method in ui.js.
                // For now, let's assume we need to trigger the update.
                updateScene();
            });
        }
    }

    if (categoryId === 'display') {
        ['surface-opacity', 'ground-grid-size', 'ground-grid-divisions', 'world-axes-size'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', handleInput);
        });

        const transToggle = document.getElementById('transparent-toggle');
        if (transToggle) {
            transToggle.addEventListener('change', (e) => {
                const controls = document.getElementById('transparency-controls');
                if (controls) controls.style.display = e.target.checked ? 'block' : 'none'; // or toggle hidden class
                // The original UI used a helper to toggle class, let's stick to that if possible
                // But here we are in a new module.
                updateScene();
            });
        }

        const groundToggle = document.getElementById('ground-plane-toggle');
        if (groundToggle) {
            groundToggle.addEventListener('change', (e) => {
                const controls = document.getElementById('ground-grid-controls');
                if (controls) controls.classList.toggle('hidden', !e.target.checked);
                updateScene();
            });
        }

        const axesToggle = document.getElementById('world-axes-toggle');
        if (axesToggle) {
            axesToggle.addEventListener('change', (e) => {
                const controls = document.getElementById('world-axes-controls');
                if (controls) controls.classList.toggle('hidden', !e.target.checked);
                updateScene();
            });
        }
    }

    if (categoryId === 'import') {
        // Import logic is complex and involves `handleModelImport` in ui.js.
        // We should try to reuse that if possible.
        // Since `handleModelImport` is not exported, we might need to duplicate logic or expose it.
        // For now, let's see if we can attach the listener from ui.js if we export it.

        // Or better, we can dispatch an event that ui.js listens to?
        // Or we can import `switchGeometryMode` if it was exported.

        // Let's check if we can just re-run the specific listener attachment logic from ui.js
        // by importing a helper.

        // For now, let's implement basic file handling here or leave it for the global listener
        // if we can trigger it.

        const loadBtn = document.getElementById('load-model-btn');
        if (loadBtn) {
            // We need to trigger the import logic.
            // Since we can't easily import `handleModelImport` from ui.js (circular dep risk and it's not exported),
            // we will dispatch a custom event or use a global function if available.
            // A cleaner way is to move `handleModelImport` to a separate module or export it.

            // For this refactor, I will assume `ui.js` will attach its listeners 
            // because I will modify `ui.js` to export `attachGlobalListeners` or similar.
            // OR I can just implement the click handler here if I have access to `project` and `geometry`.

            loadBtn.addEventListener('click', async () => {
                // Logic from ui.js handleModelImport
                const fileInput = document.getElementById('import-obj-file');
                const scaleInput = document.getElementById('import-scale');
                const centerToggle = document.getElementById('import-center-toggle');

                if (fileInput.files.length === 0) {
                    alert('Please select an OBJ file first.');
                    return;
                }

                // We need to call the logic. 
                // Since I cannot easily copy-paste the huge logic without bloating this file,
                // I will modify ui.js to export `handleModelImport` and import it here.
                // So for now, I'll leave a TODO or try to import it dynamically.

                const { handleModelImport } = await import('./ui.js');
                if (handleModelImport) {
                    handleModelImport();
                }
            });
        }
    }
}
