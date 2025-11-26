// scripts/energyplusProjectSetup.js

import { getDom } from './dom.js';
import { project } from './project.js';
import { getConfig, updateConfig } from './energyplusConfigService.js';

let dom;
let currentCategory = 'building';

const CATEGORIES = [
    { id: 'building', label: 'Building Settings' },
    { id: 'convection', label: 'Surface Convection' },
    { id: 'simulation', label: 'Simulation Control' },
    { id: 'timestep', label: 'Timestep' },
    { id: 'shadow', label: 'Shadow Calculation' },
    { id: 'sizing', label: 'Sizing Period' },
    { id: 'weather', label: 'Weather & Location' }
];

export function openProjectSetupPanel() {
    dom = getDom();
    const panelId = 'panel-project-setup';
    const btnId = 'toggle-panel-project-btn';
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
        panel = createProjectSetupPanel();
        const container = document.getElementById('window-container');
        container.appendChild(panel);

        // Initialize the panel after creation
        if (typeof window !== 'undefined' && window.initializeProjectSetupPanel) {
            window.initializeProjectSetupPanel();
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
    renderCategoryEditor(panel, currentCategory);
}

function createProjectSetupPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-project-setup';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.style.width = '600px';
    panel.style.height = '500px';

    panel.innerHTML = `
        <div class="window-header">
            <span>Project Setup</span>
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
                        <span class="label">Configuration</span>
                    </div>
                    <div id="category-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                        <!-- Category items injected here -->
                    </div>
                </div>

                <!-- Right Content: Editor -->
                <div id="category-editor" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                    <div class="text-[--text-secondary] text-sm text-center mt-10">Select a category to configure.</div>
                </div>
            </div>
        </div>
    `;

    if (typeof window !== 'undefined' && window.initializePanelControls) {
        window.initializePanelControls(panel);
    } else {
        const closeButton = panel.querySelector('.window-icon-close');
        if (closeButton) {
            closeButton.onclick = () => panel.classList.add('hidden');
        }
    }

    return panel;
}

function renderCategoryList(panel) {
    const listContainer = panel.querySelector('#category-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    CATEGORIES.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'list-item';
        // Match Thermostats styling
        item.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';

        if (cat.id === currentCategory) {
            item.classList.add('active');
            item.style.backgroundColor = 'var(--accent-color)';
            item.style.color = 'white';
        }

        item.innerHTML = `<div class="text-xs">${cat.label}</div>`;

        item.addEventListener('click', () => {
            currentCategory = cat.id;
            renderCategoryList(panel);
            renderCategoryEditor(panel, cat.id);
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

function renderCategoryEditor(panel, categoryId) {
    const editorContainer = panel.querySelector('#category-editor');
    if (!editorContainer) return;

    const { config } = getConfig(project);
    let html = '';

    switch (categoryId) {
        case 'building':
            html = renderBuildingSettings(config);
            break;
        case 'convection':
            html = renderConvectionSettings(config);
            break;
        case 'simulation':
            html = renderSimulationControl(config);
            break;
        case 'timestep':
            html = renderTimestepSettings(config);
            break;
        case 'shadow':
            html = renderShadowCalculation(config);
            break;
        case 'sizing':
            html = renderSizingPeriod(config);
            break;
        case 'weather':
            html = renderWeatherLocation(config);
            break;
        default:
            html = '<div class="text-[--text-secondary] text-sm text-center mt-10">Category not found.</div>';
    }

    editorContainer.innerHTML = html;

    // Set up event listeners after rendering
    setupCategoryEventListeners(categoryId);
}

function setupCategoryEventListeners(categoryId) {
    const dom = getDom();

    if (categoryId === 'simulation') {
        const updateSimFlags = (key, value) => {
            updateConfig(project, (ep) => {
                const sc = ep.simulationControl || {};
                const flags = sc.simulationControlFlags || {};
                return {
                    ...ep,
                    simulationControl: {
                        ...sc,
                        simulationControlFlags: {
                            ...flags,
                            [key]: value
                        }
                    }
                };
            });
        };

        const map = {
            'sc-doZone': 'doZoneSizing',
            'sc-doSystem': 'doSystemSizing',
            'sc-doPlant': 'doPlantSizing',
            'sc-runSizing': 'runSizingPeriods',
            'sc-runWeather': 'runWeatherRunPeriods'
        };

        Object.keys(map).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', (e) => {
                    updateSimFlags(map[id], e.target.checked);
                });
            }
        });
    }

    if (categoryId === 'weather') {
        // Initialize Leaflet map
        const mapElement = document.getElementById('map');
        if (mapElement && typeof L !== 'undefined') {
            // Fix for Leaflet's default icon paths
            delete L.Icon.Default.prototype._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            });

            // Initialize map
            const projectMap = L.map(mapElement, { zoomControl: false }).setView([40.7128, -74.0060], 4);

            const lightTiles = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
            const darkTiles = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

            // Set initial tiles based on current theme
            const initialTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const initialTiles = initialTheme === 'dark' ? darkTiles : lightTiles;

            L.tileLayer(initialTiles, {
                attribution: '&copy; OpenStreetMap &copy; CARTO',
                maxZoom: 20
            }).addTo(projectMap);

            L.control.zoom({ position: 'bottomright' }).addTo(projectMap);

            // Add marker
            const projectMarker = L.marker(projectMap.getCenter(), { draggable: true }).addTo(projectMap);

            // Update custom location fields when marker is dragged
            projectMarker.on('dragend', (e) => {
                const latlng = e.target.getLatLng();
                const latInput = document.getElementById('cl-lat');
                const lonInput = document.getElementById('cl-lon');
                if (latInput) latInput.value = latlng.lat.toFixed(4);
                if (lonInput) lonInput.value = latlng.lng.toFixed(4);
            });

            // Update marker when custom location changes
            const updateMapFromCustomLocation = () => {
                const latInput = document.getElementById('cl-lat');
                const lonInput = document.getElementById('cl-lon');
                const lat = parseFloat(latInput?.value || 0);
                const lon = parseFloat(lonInput?.value || 0);
                if (!isNaN(lat) && !isNaN(lon)) {
                    const newLatLng = L.latLng(lat, lon);
                    projectMap.setView(newLatLng, 10);
                    projectMarker.setLatLng(newLatLng);
                }
            };

            // Listen to custom location field changes
            const latInput = document.getElementById('cl-lat');
            const lonInput = document.getElementById('cl-lon');
            latInput?.addEventListener('change', updateMapFromCustomLocation);
            lonInput?.addEventListener('change', updateMapFromCustomLocation);

            // Fix map tile rendering
            setTimeout(() => {
                projectMap.invalidateSize();
            }, 100);
        }

        // Location source radio buttons
        const locRadios = document.querySelectorAll('input[name="loc-source"]');
        locRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const customFields = document.getElementById('custom-location-fields');
                if (customFields) {
                    customFields.style.display = e.target.value === 'Custom' ? 'block' : 'none';
                }
            });
        });

        // EPW upload button
        const uploadBtn = document.getElementById('upload-epw-btn');
        const fileInput = document.getElementById('epw-file-input');
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => {
                fileInput.click();
            });

            fileInput.addEventListener('change', async (e) => {
                if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            const epwContent = event.target.result;
                            // Update EPW path display
                            const epwPath = document.getElementById('epw-path');
                            if (epwPath) epwPath.value = file.name;

                            // Store in project
                            if (project && project.setEpwData) {
                                await project.setEpwData(epwContent);
                            }

                            console.log('EPW file loaded:', file.name);
                        } catch (error) {
                            console.error('Error loading EPW file:', error);
                        }
                    };
                    reader.readAsText(file);
                }
            });
        }

        // Clear EPW button
        const clearBtn = document.getElementById('clear-epw-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const epwPath = document.getElementById('epw-path');
                const fileInput = document.getElementById('epw-file-input');
                if (epwPath) epwPath.value = '';
                if (fileInput) fileInput.value = '';
                if (project && project.clearEpwData) {
                    project.clearEpwData();
                }
            });
        }
    }

    if (categoryId === 'building') {
        // North axis slider
        const northSlider = document.getElementById('sc-b-north');
        if (northSlider) {
            northSlider.addEventListener('input', (e) => {
                const valSpan = document.getElementById('sc-b-north-val');
                if (valSpan) valSpan.textContent = e.target.value + '°';
            });
        }
    }
}

function renderBuildingSettings() {
    return `
        <div class="space-y-3">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Building Settings</h3>

            <div>
                <label class="label text-xs">Building Name</label>
                <input type="text" id="sc-b-name" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" placeholder="Enter building name">
            </div>

            <div>
                <label class="label text-xs">North Axis
                    <span class="info-icon">i
                        <span class="info-popover">The Building North Axis is specified relative to true North.
                            Buildings frequently do not line up with true north. For convenience, one may enter
                            surfaces in a "regular" coordinate system and then shift them via the use of the
                            North Axis. The value is specified in degrees from "true north" (clockwise is
                            positive).</span>
                    </span>
                </label>
                <div class="flex items-center space-x-3 mt-1">
                    <input type="range" id="sc-b-north" min="0" max="360" value="0" step="1">
                    <span id="sc-b-north-val" class="data-value font-mono w-12 text-left">0°</span>
                </div>
            </div>

            <div>
                <label class="label text-xs">Terrain
                    <span class="info-icon">i
                        <span class="info-popover"><strong>Terrain Types:</strong><br><strong>Country</strong> -
                            Flat, Open Country<br><strong>Suburbs</strong> - Rough, Wooded Country,
                            Suburbs<br><strong>City</strong> - Towns, city outskirts, center of large
                            cities<br><strong>Ocean</strong> - Ocean, Bayou flat
                            country<br><strong>Urban</strong> - Urban, Industrial, Forest<br><br>The site's
                            terrain affects how the wind hits the building and the building height. The external
                            conduction method usually has its own parameters for the calculation.</span>
                    </span>
                </label>
                <select id="sc-b-terrain" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Country">Country</option>
                    <option value="Suburbs">Suburbs</option>
                    <option value="City" selected>City</option>
                    <option value="Ocean">Ocean</option>
                    <option value="Urban">Urban</option>
                </select>
            </div>

            <div>
                <label class="label text-xs">Solar Distribution
                    <span class="info-icon">i
                        <span class="info-popover">Determines how EnergyPlus treats beam solar radiation and
                            reflectances:<br><br><strong>MinimalShadowing</strong> - No exterior shadowing
                            except window/door reveals. All beam solar falls on the
                            floor.<br><br><strong>FullExterior</strong> - Includes exterior shadowing from
                            detached shading, wings, overhangs. Beam solar still falls on
                            floor.<br><br><strong>FullInteriorAndExterior</strong> - Calculates beam radiation
                            on each surface (floor, walls, windows) including interior
                            distribution.<br><br><strong>*WithReflections</strong> - Same as above but includes
                            solar reflections from exterior surfaces.</span>
                    </span>
                </label>
                <select id="sc-b-solar" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="MinimalShadowing">MinimalShadowing</option>
                    <option value="FullExterior">FullExterior</option>
                    <option value="FullInteriorAndExterior">FullInteriorAndExterior</option>
                    <option value="FullExteriorWithReflections">FullExteriorWithReflections</option>
                    <option value="FullInteriorAndExteriorWithReflections" selected>
                        FullInteriorAndExteriorWithReflections</option>
                </select>
            </div>
        </div>
    `;
}

function renderConvectionSettings() {
    return `
        <div class="space-y-3">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Surface Convection Algorithms</h3>

            <div>
                <label class="label text-xs">Inside Algorithm
                    <span class="info-icon">i
                        <span class="info-popover"><strong>Simple</strong> - Constant heat transfer coefficients
                            by orientation<br><br><strong>TARP</strong> (Default) - Correlates to temperature
                            difference for various orientations. Based on flat plate
                            experiments.<br><br><strong>CeilingDiffuser</strong> - For ceiling diffuser
                            configurations, correlates to air change
                            rate.<br><br><strong>AdaptiveConvectionAlgorithm</strong> - Dynamic algorithm that
                            auto-selects best model.<br><br><strong>ASTMC1340</strong> - Mixed convection model
                            based on ASTM C1340 standard.</span>
                    </span>
                </label>
                <select id="sc-conv-in" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Simple">Simple</option>
                    <option value="TARP" selected>TARP</option>
                    <option value="CeilingDiffuser">CeilingDiffuser</option>
                    <option value="AdaptiveConvectionAlgorithm">AdaptiveConvectionAlgorithm</option>
                    <option value="ASTMC1340">ASTMC1340</option>
                </select>
            </div>

            <div>
                <label class="label text-xs">Outside Algorithm
                    <span class="info-icon">i
                        <span class="info-popover"><strong>SimpleCombined</strong> - Combined heat transfer
                            (includes radiation to sky/ground/air) based on roughness and
                            windspeed.<br><br><strong>TARP</strong> - Natural and wind-driven convection from
                            flat plate lab measurements.<br><br><strong>DOE-2</strong> (Default) - Field
                            measurements by Klems & Yazdanian for rough surfaces.<br><br><strong>MoWiTT</strong>
                            - For smooth surfaces, most appropriate for
                            windows.<br><br><strong>AdaptiveConvectionAlgorithm</strong> - Dynamic algorithm
                            that auto-selects best model.</span>
                    </span>
                </label>
                <select id="sc-conv-out" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Simple">Simple</option>
                    <option value="TARP">TARP</option>
                    <option value="CeilingDiffuser">CeilingDiffuser</option>
                    <option value="AdaptiveConvectionAlgorithm">AdaptiveConvectionAlgorithm</option>
                    <option value="ASTMC1340">ASTMC1340</option>
                    <option value="DOE-2" selected>DOE-2</option>
                </select>
            </div>
        </div>
    `;
}

function renderSimulationControl(config) {
    const sc = config.simulationControl || {};
    const flags = sc.simulationControlFlags || {};
    // Note: HVAC Sizing Simulation is not a standard EP field in SimulationControl, 
    // but we can support it if it's a custom workflow. 
    // For now assuming it maps to something or is just a UI state we want to persist if possible, 
    // but the task specifically asked for the standard flags.

    return `
        <div class="space-y-3">
            <h3 class="font-semibold text-sm uppercase flex items-center border-b border-[--grid-color] pb-2">
                Simulation Control
                <span class="info-icon">i
                    <span class="info-popover"><strong>Zone Sizing</strong> - Calculates zone design
                        heating/cooling flow rates using an ideal zonal system.<br><br><strong>System
                            Sizing</strong> - Sums zone sizing results for component sizing requirements.
                        Requires Zone Sizing.<br><br><strong>Plant Sizing</strong> - Uses component flow rates
                        to size plant equipment. Independent of Zone/System sizing.<br><br><strong>Sizing
                            Periods</strong> - Runs simulation on all SizingPeriod objects (design
                        days).<br><br><strong>Weather File Periods</strong> - Runs simulation on all RunPeriod
                        objects.</span>
                </span>
            </h3>

            <div class="space-y-2">
                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="sc-doZone" ${flags.doZoneSizing ? 'checked' : ''}>
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal !mb-0">Do Zone Sizing
                        Calculation</span>
                </label>

                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="sc-doSystem" ${flags.doSystemSizing ? 'checked' : ''}>
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal !mb-0">Do System Sizing
                        Calculation</span>
                </label>

                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="sc-doPlant" ${flags.doPlantSizing ? 'checked' : ''}>
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal !mb-0">Do Plant Sizing
                        Calculation</span>
                </label>

                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="sc-runSizing" ${flags.runSizingPeriods ? 'checked' : ''}>
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal !mb-0">Run Simulation
                        for Sizing Periods</span>
                </label>

                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="sc-runWeather" ${flags.runWeatherRunPeriods ? 'checked' : ''}>
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal !mb-0">Run Simulation
                        for Weather File Run Periods</span>
                </label>
            </div>
        </div>
    `;
}

function renderTimestepSettings() {
    return `
        <div class="space-y-3">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Timestep</h3>

            <div>
                <label class="label text-xs">Timesteps per Hour
                    <span class="info-icon">i
                        <span class="info-popover">Number of timesteps in an hour. Default is 6 (10-minute timesteps).
                            Higher values increase accuracy but also simulation time. Common values: 4 (15 min),
                            6 (10 min), 12 (5 min), 60 (1 min).</span>
                    </span>
                </label>
                <select id="sc-timestep" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="1">1 (60 minutes)</option>
                    <option value="2">2 (30 minutes)</option>
                    <option value="3">3 (20 minutes)</option>
                    <option value="4">4 (15 minutes)</option>
                    <option value="6" selected>6 (10 minutes)</option>
                    <option value="10">10 (6 minutes)</option>
                    <option value="12">12 (5 minutes)</option>
                    <option value="15">15 (4 minutes)</option>
                    <option value="20">20 (3 minutes)</option>
                    <option value="30">30 (2 minutes)</option>
                    <option value="60">60 (1 minute)</option>
                </select>
            </div>
        </div>
    `;
}

function renderShadowCalculation() {
    return `
        <div class="space-y-3">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
                Shadow Calculation
                <span class="info-icon">i
                    <span class="info-popover">Controls EnergyPlus's solar, shadowing and daylighting models.
                        Determines sun position and shadow patterns for surfaces. Default Periodic method
                        calculates every 20 days; Timestep method is required for dynamic fenestration.</span>
                </span>
            </h3>

            <div>
                <label class="label text-xs">Shading Calculation Method
                    <span class="info-icon">i
                        <span class="info-popover"><strong>PolygonClipping</strong> (default): CPU-based method
                            suitable for most cases<br><br><strong>PixelCounting</strong>: GPU-based, scales
                            better with many shading surfaces (200+)<br><br><strong>Scheduled/Imported</strong>:
                            Use pre-calculated shading data</span>
                    </span>
                </label>
                <select id="sc-shadow-method" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="PolygonClipping" selected>PolygonClipping (default)</option>
                    <option value="PixelCounting">PixelCounting</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Imported">Imported</option>
                </select>
            </div>

            <div>
                <label class="label text-xs">Update Frequency Method</label>
                <select id="sc-shadow-freq-method" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Periodic" selected>Periodic (faster, default)</option>
                    <option value="Timestep">Timestep (required for dynamic shading)</option>
                </select>
            </div>

            <div id="shadow-calc-freq-container">
                <label class="label text-xs">Update Frequency (days)
                    <span class="info-icon">i
                        <span class="info-popover">Number of days between shadow calculations when using
                            Periodic method. Default is 20 days (average between significant solar position
                            changes). Use 1 for daily calculations or if you have scheduled shading
                            devices.</span>
                    </span>
                </label>
                <input type="number" id="sc-shadow-freq" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" min="1" max="365" value="20"
                    step="1">
            </div>

            <div>
                <label class="label text-xs">Sky Diffuse Modeling Algorithm
                    <span class="info-icon">i
                        <span class="info-popover"><strong>SimpleSkyDiffuseModeling</strong> (default): One-time
                            calculation, faster<br><br><strong>DetailedSkyDiffuseModeling</strong>: Required
                            when shading surfaces have changing transmittance during the year</span>
                    </span>
                </label>
                <select id="sc-sky-diffuse" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="SimpleSkyDiffuseModeling" selected>SimpleSkyDiffuseModeling (default)
                    </option>
                    <option value="DetailedSkyDiffuseModeling">DetailedSkyDiffuseModeling</option>
                </select>
            </div>
        </div>
    `;
}

function renderSizingPeriod() {
    return `
        <div class="space-y-3">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
                Sizing Period: Weather File Days
                <span class="info-icon">i
                    <span class="info-popover">Select a period from the weather file for load calculations or
                        equipment sizing. Can be a single day or longer period. Consider using design days for
                        long-term extremes.</span>
                </span>
            </h3>

            <div>
                <label class="label text-xs">Period Name</label>
                <input type="text" id="sc-sizing-name" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" placeholder="e.g., Summer Week">
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="label text-xs">Begin Month</label>
                    <select id="sc-sizing-begin-month" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                        <option value="1">January</option>
                        <option value="2">February</option>
                        <option value="3">March</option>
                        <option value="4">April</option>
                        <option value="5">May</option>
                        <option value="6">June</option>
                        <option value="7" selected>July</option>
                        <option value="8">August</option>
                        <option value="9">September</option>
                        <option value="10">October</option>
                        <option value="11">November</option>
                        <option value="12">December</option>
                    </select>
                </div>
                <div>
                    <label class="label text-xs">Begin Day</label>
                    <input type="number" id="sc-sizing-begin-day" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" min="1" max="31"
                        value="1">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="label text-xs">End Month</label>
                    <select id="sc-sizing-end-month" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                        <option value="1">January</option>
                        <option value="2">February</option>
                        <option value="3">March</option>
                        <option value="4">April</option>
                        <option value="5">May</option>
                        <option value="6">June</option>
                        <option value="7" selected>July</option>
                        <option value="8">August</option>
                        <option value="9">September</option>
                        <option value="10">October</option>
                        <option value="11">November</option>
                        <option value="12">December</option>
                    </select>
                </div>
                <div>
                    <label class="label text-xs">End Day</label>
                    <input type="number" id="sc-sizing-end-day" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" min="1" max="31" value="7">
                </div>
            </div>

            <div>
                <label class="label text-xs">Day of Week for Start Day</label>
                <select id="sc-sizing-start-day" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Sunday">Sunday</option>
                    <option value="Monday" selected>Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="SummerDesignDay">SummerDesignDay</option>
                    <option value="WinterDesignDay">WinterDesignDay</option>
                    <option value="CustomDay1">CustomDay1</option>
                    <option value="CustomDay2">CustomDay2</option>
                </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="sc-sizing-use-dst" checked>
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal !mb-0">Use Daylight
                        Saving Period</span>
                </label>
                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="sc-sizing-use-rain-snow" checked>
                    <span class="ml-3 label !text-gray-600 !uppercase-none !font-normal !mb-0">Use Rain/Snow
                        Indicators</span>
                </label>
            </div>
        </div>
    `;
}

function renderWeatherLocation() {
    return `
        <div class="space-y-3">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Weather & Location</h3>

            <!-- Project EPW selection -->
            <div class="panel-subtle space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">
                        Project Weather File (EPW)
                    </span>
                </div>
                <div class="flex items-center gap-2">
                    <input type="text" class="w-full text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" id="epw-path" placeholder="No EPW selected"
                        readonly>
                    <button class="btn btn-xxs btn-secondary" id="upload-epw-btn">
                        Select EPW
                    </button>
                    <button class="btn btn-xxs btn-secondary" id="clear-epw-btn">
                        Clear
                    </button>
                </div>
                <input type="file" id="epw-file-input" class="hidden" accept=".epw" style="display: none;">
            </div>

            <!-- Location source -->
            <div class="panel-subtle space-y-2">
                <div class="font-semibold text-xs uppercase text-[--text-secondary]">
                    Location Source
                </div>
                <div class="flex flex-col gap-1">
                    <label class="inline-flex items-center gap-1">
                        <input type="radio" name="loc-source" value="FromEPW" id="loc-from-epw" checked>
                        <span class="text-xs">From EPW (recommended)</span>
                    </label>
                    <label class="inline-flex items-center gap-1">
                        <input type="radio" name="loc-source" value="Custom" id="loc-custom">
                        <span class="text-xs">Custom Location</span>
                    </label>
                </div>
            </div>

            <!-- Custom Location Fields -->
            <div id="custom-location-fields" style="display: none;" class="panel-subtle space-y-2">
                <div class="font-semibold text-xs uppercase text-[--text-secondary] mb-2">
                    Custom Location Details
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="col-span-2">
                        <label class="label text-xs">Location Name</label>
                        <input type="text" id="cl-name" class="w-full mt-1" placeholder="e.g., New York City">
                    </div>
                    <div>
                        <label class="label text-xs">Latitude (°)</label>
                        <input type="number" id="cl-lat" class="w-full mt-1" step="0.0001" min="-90" max="90"
                            placeholder="40.7128">
                    </div>
                    <div>
                        <label class="label text-xs">Longitude (°)</label>
                        <input type="number" id="cl-lon" class="w-full mt-1" step="0.0001" min="-180" max="180"
                            placeholder="-74.0060">
                    </div>
                    <div>
                        <label class="label text-xs">Time Zone (UTC offset)</label>
                        <input type="number" id="cl-tz" class="w-full mt-1" step="0.5" min="-12" max="14"
                            placeholder="-5">
                    </div>
                    <div>
                        <label class="label text-xs">Elevation (m)</label>
                        <input type="number" id="cl-elev" class="w-full mt-1" step="0.1"
                            placeholder="10">
                    </div>
                </div>
            </div>

            <!-- Map Container -->
            <div class="panel-subtle">
                <div id="map" style="height: 300px; width: 100%; border-radius: 4px;"></div>
            </div>

            <!-- Save Button -->
            <div class="flex justify-end pt-3 border-t border-[--grid-color]">
                <button class="btn btn-sm btn-primary" id="save-sim-control-btn">Save All Settings</button>
            </div>
        </div>
    `;
}
