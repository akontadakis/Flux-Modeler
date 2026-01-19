
import { getDom } from './dom.js';
import { project } from './project.js';
import { getConfig, setDaylighting } from './energyplusConfigService.js';
import { getNewZIndex } from './ui.js';

let dom;

// Helper to get zones
function getZones() {
    if (project && typeof project.getZones === 'function') {
        return project.getZones() || [];
    }
    return [];
}

const TOOLTIPS = {
    // Daylighting:Controls
    zoneName: "The name of the zone where daylighting control is applied.",
    totalDaylightingReferencePoints: "Number of reference points used for daylighting control (1 or 2).",
    controlType: "Type of control: Continuous, Stepped, or ContinuousOff.",
    minInputPowerFraction: "Minimum fraction of input power when fully dimmed.",
    minLightOutputFraction: "Minimum fraction of light output when fully dimmed.",
    numberSteppedControlSteps: "Number of steps for stepped control (excluding off).",
    probabilityLightingWillBeResetWhenNeeded: "Probability that lighting will be reset to optimal level (manual stepped control).",
    glareCalculationDaylightingReferencePointName: "Reference point used for glare calculation (SplitFlux only).",
    glareCalculationAzimuthAngleOfViewDirection: "Azimuth angle of view direction for glare calculation (SplitFlux only).",
    maximumAllowableDiscomfortGlareIndex: "Maximum allowable Discomfort Glare Index (DGI).",
    availabilityScheduleName: "Schedule defining when daylighting control is available.",
    lightingControlType: "Type of lighting control system.",
    deLightGriddingResolution: "Maximum surface area for nodes in gridding (DElight only).",

    // Reference Points
    refPoint1: "Coordinates (X, Y, Z) of the first reference point.",
    refPoint2: "Coordinates (X, Y, Z) of the second reference point.",
    fractionZoneControlled1: "Fraction of the zone controlled by the first reference point.",
    fractionZoneControlled2: "Fraction of the zone controlled by the second reference point.",
    illuminanceSetpoint1: "Illuminance setpoint (lux) for the first reference point.",
    illuminanceSetpoint2: "Illuminance setpoint (lux) for the second reference point.",

    // Illuminance Maps
    mapName: "Unique name for this illuminance map.",
    mapZone: "Zone where the map is located.",
    mapOrigin: "Origin coordinates (X, Y, Z) of the map grid.",
    mapGrid: "Grid definition: X-axis length, Number of X points, Y-axis length, Number of Y points.",

    // Output Variables
    variableName: "Name of the EnergyPlus output variable to report.",

    // Complex Fenestration
    cfsName: "User name of the DElight daylighting Complex Fenestration.",
    cfsType: "Type name of the DElight daylighting Complex Fenestration system.",
    cfsHostSurface: "Name of the heat transfer surface object instance hosting this Complex Fenestration.",
    cfsWindowName: "Name of the Window instance used for geometry and solar/thermal gains.",
    cfsRotation: "In-plane counter-clockwise rotation angle.",

    // Daylighting Devices
    deviceName: "Name of the daylighting device.",
    deviceType: "Type of daylighting device (Tubular, Shelf, LightWell).",
    // Tubular
    tubularDome: "Reference to a FenestrationSurface:Detailed object with Surface Type TubularDaylightDome.",
    tubularDiffuser: "Reference to a FenestrationSurface:Detailed object with Surface Type TubularDaylightDiffuser.",
    tubularConstruction: "Construction of the TDD pipe.",
    tubularDiameter: "Diameter of the TDD pipe.",
    tubularLength: "Total length of the TDD pipe.",
    tubularRValue: "Effective thermal resistance (R-value) of the TDD.",
    // Shelf
    shelfWindow: "Reference to the upper window associated with the shelf.",
    shelfInside: "Reference to the inside shelf surface (optional).",
    shelfOutside: "Reference to the outside shelf shading surface (optional).",
    shelfConstruction: "Construction of the outside shelf (required if outside shelf specified).",
    shelfViewFactor: "View factor from window to outside shelf (optional).",
    // LightWell
    wellWindow: "Name of the exterior window (skylight) this Light Well is associated with.",
    wellHeight: "Distance from bottom of skylight to bottom of well.",
    wellPerimeter: "Perimeter of the bottom opening of the well.",
    wellArea: "Area of the bottom opening of the well.",
    wellReflectance: "Visible reflectance of the side walls of the well."
};

export function openDaylightingManagerPanel() {
    dom = getDom();
    const panelId = 'panel-energyplus-daylighting';
    const btnId = 'toggle-panel-daylighting-btn';
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
        panel = createDaylightingPanel();
        const container = document.getElementById('window-container');
        container.appendChild(panel);
    }

    panel.classList.remove('hidden');
    if (btn) btn.classList.add('active');

    // Bring to front
    panel.style.zIndex = getNewZIndex();

    // Default view
    if (!panel.dataset.currentView) {
        panel.dataset.currentView = 'controls';
    }

    renderSidebarList(panel);
}

function createDaylightingPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-daylighting';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.style.width = '800px';
    panel.style.height = '600px';

    panel.innerHTML = `
        <div class="window-header">
            <span>Daylighting & Lighting Outputs</span>
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
                <!-- Left Sidebar: List -->
                <div style="width: 200px; border-right: 1px solid var(--grid-color); display: flex; flex-direction: column;">
                    <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color); display: flex; justify-content: space-between; align-items: center;">
                        <span class="label">Configuration</span>
                        <button class="btn btn-xs btn-secondary" id="add-item-btn" title="Add Item" style="display: none;">+</button>
                    </div>
                    <div id="daylighting-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                        <!-- List items injected here -->
                    </div>
                </div>

                <!-- Right Content: Editor -->
                <div id="daylighting-editor" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                    <div class="text-[--text-secondary] text-sm text-center mt-10">Select an item to edit.</div>
                </div>
            </div>
        </div>
    `;

    if (typeof window !== 'undefined' && window.initializePanelControls) {
        window.initializePanelControls(panel);
    } else {
        const closeButton = panel.querySelector('.window-icon-close');
        if (closeButton) {
            closeButton.onclick = () => {
                panel.classList.add('hidden');
                const btn = document.getElementById('toggle-panel-daylighting-btn');
                if (btn) btn.classList.remove('active');
            };
        }
    }

    // Add button logic
    const addBtn = panel.querySelector('#add-item-btn');
    addBtn.addEventListener('click', () => {
        const context = addBtn.dataset.context;
        if (context === 'maps') {
            renderMapEditor(panel, null, true);
        } else if (context === 'cfs') {
            renderComplexFenestrationEditor(panel, null, true);
        } else if (context === 'devices') {
            renderDaylightingDeviceEditor(panel, null, true);
        }
    });

    return panel;
}

function renderSidebarList(panel) {
    const listContainer = panel.querySelector('#daylighting-list');
    const { config } = getConfig(project);
    const addBtn = panel.querySelector('#add-item-btn');
    const zones = getZones();

    listContainer.innerHTML = '';

    const createHeader = (label) => {
        const header = document.createElement('div');
        header.style.cssText = 'padding: 0.5rem 0.75rem; margin-top: 0.5rem;';
        header.innerHTML = `<span class="label" style="font-size: 0.75rem; color: var(--text-secondary);">${label}</span>`;
        return header;
    };

    const createItem = (label, dataAttributes) => {
        const item = document.createElement('div');
        item.className = 'daylighting-item';
        item.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';

        // Add data attributes
        Object.entries(dataAttributes).forEach(([key, value]) => {
            item.dataset[key] = value;
        });

        // Use standard text-xs
        item.innerHTML = `<div class="text-xs">${label}</div>`;

        // Hover effects
        item.addEventListener('mouseenter', () => {
            if (!item.classList.contains('active')) {
                item.style.backgroundColor = 'var(--hover-bg)';
            }
        });
        item.addEventListener('mouseleave', () => {
            if (!item.classList.contains('active')) {
                item.style.backgroundColor = '';
            }
        });

        // Click handler
        item.addEventListener('click', () => {
            // Reset all items
            listContainer.querySelectorAll('.daylighting-item').forEach(el => {
                el.classList.remove('active');
                el.style.backgroundColor = '';
                el.style.color = '';
            });

            // Set active state
            item.classList.add('active');
            item.style.backgroundColor = 'var(--accent-color)';
            item.style.color = 'white';

            // Show/Hide Add Button based on context
            if (['maps', 'cfs', 'devices'].includes(dataAttributes.context)) {
                addBtn.style.display = 'block';
                addBtn.dataset.context = dataAttributes.context;
            } else {
                addBtn.style.display = 'none';
            }

            // Trigger action
            if (dataAttributes.context === 'controls') {
                renderControlsEditor(panel, dataAttributes.zone);
            } else if (dataAttributes.context === 'maps') {
                const map = (config.daylighting?.illuminanceMaps || []).find(m => m.name === dataAttributes.name);
                renderMapEditor(panel, map, false);
            } else if (dataAttributes.context === 'variables') {
                renderVariablesEditor(panel);
            } else if (dataAttributes.context === 'cfs') {
                const cfs = (config.daylighting?.complexFenestrations || []).find(c => c.name === dataAttributes.name);
                renderComplexFenestrationEditor(panel, cfs, false);
            } else if (dataAttributes.context === 'devices') {
                const dev = (config.daylighting?.devices || []).find(d => d.name === dataAttributes.name);
                renderDaylightingDeviceEditor(panel, dev, false);
            }
        });

        return item;
    };

    // --- DAYLIGHTING CONTROLS SECTION ---
    listContainer.appendChild(createHeader('Daylighting Controls'));
    if (zones.length > 0) {
        zones.forEach(z => {
            listContainer.appendChild(createItem(z.name, { zone: z.name, context: 'controls' }));
        });
    } else {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'text-xs text-[--text-secondary] italic px-3 py-2';
        emptyItem.textContent = 'No zones found';
        listContainer.appendChild(emptyItem);
    }

    // --- ILLUMINANCE MAPS SECTION ---
    listContainer.appendChild(createHeader('Illuminance Maps'));
    const maps = config.daylighting?.illuminanceMaps || [];
    if (maps.length > 0) {
        maps.forEach(m => {
            listContainer.appendChild(createItem(m.name, { name: m.name, context: 'maps' }));
        });
    } else {
        // Add a generic item if list is empty so user can click it to see add button
        const manageItem = createItem('Manage Maps', { context: 'maps' });
        listContainer.appendChild(manageItem);
    }

    // --- COMPLEX FENESTRATION SECTION ---
    listContainer.appendChild(createHeader('Complex Fenestration'));
    const cfsList = config.daylighting?.complexFenestrations || [];
    if (cfsList.length > 0) {
        cfsList.forEach(c => {
            listContainer.appendChild(createItem(c.name, { name: c.name, context: 'cfs' }));
        });
    } else {
        const manageItem = createItem('Manage CFS', { context: 'cfs' });
        listContainer.appendChild(manageItem);
    }

    // --- DAYLIGHTING DEVICES SECTION ---
    listContainer.appendChild(createHeader('Daylighting Devices'));
    const devices = config.daylighting?.devices || [];
    if (devices.length > 0) {
        devices.forEach(d => {
            listContainer.appendChild(createItem(d.name, { name: d.name, context: 'devices' }));
        });
    } else {
        const manageItem = createItem('Manage Devices', { context: 'devices' });
        listContainer.appendChild(manageItem);
    }

    // --- OUTPUT VARIABLES SECTION ---
    listContainer.appendChild(createHeader('Outputs'));
    listContainer.appendChild(createItem('Output Variables', { context: 'variables' }));

    // Auto-select first clickable item if nothing selected
    // const firstItem = listContainer.querySelector('.daylighting-item');
    // if (firstItem) {
    //     firstItem.click();
    // }
}

// ==========================================
// EDITORS
// ==========================================

function renderLabel(text, key) {
    const tooltip = TOOLTIPS[key];
    const infoIcon = tooltip ? `
        <span class="info-icon">i
            <span class="info-popover">${tooltip}</span>
        </span>
    ` : '';
    return `<label class="label">${text}${infoIcon}</label>`;
}

function renderControlsEditor(panel, zoneName) {
    const container = panel.querySelector('#daylighting-editor');
    const { config } = getConfig(project);
    const controls = config.daylighting?.controls || [];
    const zoneControl = controls.find(c => c.zoneName === zoneName) || {};
    const isEnabled = !!zoneControl.zoneName;

    // Helper to get value safely
    const val = (v, def) => (v !== undefined && v !== null ? v : def);

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
                Daylighting Controls: <span class="text-[--accent-color]">${zoneName}</span>
            </h3>

            <div class="flex items-center gap-2 mb-4">
                <input type="checkbox" id="dc-enabled" ${isEnabled ? 'checked' : ''}>
                <label for="dc-enabled" class="text-sm font-medium">Enable Daylighting Control</label>
            </div>

            <div id="dc-settings" class="${isEnabled ? '' : 'hidden opacity-50 pointer-events-none'} space-y-4">
                
                <!-- General Settings -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        ${renderLabel('Availability Schedule', 'availabilityScheduleName')}
                        <input type="text" id="dc-avail-sched" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.availabilityScheduleName, '')}" placeholder="Schedule Name">
                    </div>
                    <div>
                        ${renderLabel('DElight Grid Res [m2]', 'deLightGriddingResolution')}
                        <input type="number" id="dc-delight-res" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.deLightGriddingResolution, '')}" step="0.1">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        ${renderLabel('Control Type', 'controlType')}
                        <select id="dc-type" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                            <option value="Continuous" ${zoneControl.controlType === 'Continuous' ? 'selected' : ''}>Continuous</option>
                            <option value="Stepped" ${zoneControl.controlType === 'Stepped' ? 'selected' : ''}>Stepped</option>
                            <option value="ContinuousOff" ${zoneControl.controlType === 'ContinuousOff' ? 'selected' : ''}>ContinuousOff</option>
                        </select>
                    </div>
                    <div>
                        ${renderLabel('Ref Points Count', 'totalDaylightingReferencePoints')}
                        <select id="dc-ref-count" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                            <option value="1" ${zoneControl.totalDaylightingReferencePoints === 1 ? 'selected' : ''}>1</option>
                            <option value="2" ${zoneControl.totalDaylightingReferencePoints === 2 ? 'selected' : ''}>2</option>
                        </select>
                    </div>
                </div>

                <!-- Continuous Control Settings -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        ${renderLabel('Min Input Power Frac', 'minInputPowerFraction')}
                        <input type="number" id="dc-min-power" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.minInputPowerFraction, 0.3)}" step="0.1" min="0" max="1">
                    </div>
                    <div>
                        ${renderLabel('Min Light Output Frac', 'minLightOutputFraction')}
                        <input type="number" id="dc-min-light" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.minLightOutputFraction, 0.2)}" step="0.1" min="0" max="1">
                    </div>
                </div>

                <!-- Stepped Control Settings (Conditional) -->
                <div id="dc-stepped-settings" class="${zoneControl.controlType === 'Stepped' ? '' : 'hidden'} grid grid-cols-2 gap-4 bg-black/20 p-2 rounded">
                    <div>
                        ${renderLabel('Num Steps', 'numberSteppedControlSteps')}
                        <input type="number" id="dc-steps" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.numberSteppedControlSteps, 1)}" step="1" min="1">
                    </div>
                    <div>
                        ${renderLabel('Reset Probability', 'probabilityLightingWillBeResetWhenNeeded')}
                        <input type="number" id="dc-prob" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.probabilityLightingWillBeResetWhenNeeded, 1.0)}" step="0.1" min="0" max="1">
                    </div>
                </div>

                <!-- Glare Settings -->
                <div class="border-t border-[--grid-color] pt-2">
                    <span class="text-xs font-bold text-[--text-secondary] uppercase">Glare Calculation (SplitFlux)</span>
                    <div class="grid grid-cols-3 gap-2 mt-2">
                        <div>
                            ${renderLabel('Ref Point', 'glareCalculationDaylightingReferencePointName')}
                            <select id="dc-glare-ref" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                                <option value="">None</option>
                                <option value="1" ${zoneControl.glareCalculationDaylightingReferencePointName === 'ReferencePoint1' ? 'selected' : ''}>Ref Point 1</option>
                                <option value="2" ${zoneControl.glareCalculationDaylightingReferencePointName === 'ReferencePoint2' ? 'selected' : ''}>Ref Point 2</option>
                            </select>
                        </div>
                        <div>
                            ${renderLabel('Azimuth [deg]', 'glareCalculationAzimuthAngleOfViewDirection')}
                            <input type="number" id="dc-glare-az" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.glareCalculationAzimuthAngleOfViewDirection, 0)}" step="1">
                        </div>
                        <div>
                            ${renderLabel('Max DGI', 'maximumAllowableDiscomfortGlareIndex')}
                            <input type="number" id="dc-glare-max" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.maximumAllowableDiscomfortGlareIndex, 22)}" step="1">
                        </div>
                    </div>
                </div>

                <!-- Reference Points -->
                <div class="border-t border-[--grid-color] pt-2">
                    <span class="text-xs font-bold text-[--text-secondary] uppercase">Reference Point 1</span>
                    <div class="grid grid-cols-3 gap-2 mt-2">
                        <div><label class="label">X</label><input type="number" id="dc-x1" class="w-full text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.x1, 0)}" step="0.1"></div>
                        <div><label class="label">Y</label><input type="number" id="dc-y1" class="w-full text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.y1, 0)}" step="0.1"></div>
                        <div><label class="label">Z</label><input type="number" id="dc-z1" class="w-full text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.z1, 0.8)}" step="0.1"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-4 mt-2">
                        <div>
                            ${renderLabel('Setpoint [lux]', 'illuminanceSetpoint1')}
                            <input type="number" id="dc-setpoint1" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.illuminanceSetpoint1, 500)}">
                        </div>
                        <div>
                            ${renderLabel('Fraction Controlled', 'fractionZoneControlled1')}
                            <input type="number" id="dc-frac1" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.fractionZoneControlled1, 1.0)}" step="0.1" min="0" max="1">
                        </div>
                    </div>
                </div>

                <div id="dc-ref2-container" class="${zoneControl.totalDaylightingReferencePoints === 2 ? '' : 'hidden'} border-t border-[--grid-color] pt-2">
                    <span class="text-xs font-bold text-[--text-secondary] uppercase">Reference Point 2</span>
                    <div class="grid grid-cols-3 gap-2 mt-2">
                        <div><label class="label">X</label><input type="number" id="dc-x2" class="w-full text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.x2, 0)}" step="0.1"></div>
                        <div><label class="label">Y</label><input type="number" id="dc-y2" class="w-full text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.y2, 0)}" step="0.1"></div>
                        <div><label class="label">Z</label><input type="number" id="dc-z2" class="w-full text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.z2, 0.8)}" step="0.1"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-4 mt-2">
                        <div>
                            ${renderLabel('Setpoint [lux]', 'illuminanceSetpoint2')}
                            <input type="number" id="dc-setpoint2" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.illuminanceSetpoint2, 500)}">
                        </div>
                        <div>
                            ${renderLabel('Fraction Controlled', 'fractionZoneControlled2')}
                            <input type="number" id="dc-frac2" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(zoneControl.fractionZoneControlled2, 0)}" step="0.1" min="0" max="1">
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                <button class="btn btn-sm btn-primary" id="dc-save-btn">Save Changes</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Toggle visibility
    const enabledCheck = container.querySelector('#dc-enabled');
    const settingsDiv = container.querySelector('#dc-settings');
    enabledCheck.addEventListener('change', () => {
        settingsDiv.classList.toggle('hidden', !enabledCheck.checked);
        settingsDiv.classList.toggle('opacity-50', !enabledCheck.checked);
        settingsDiv.classList.toggle('pointer-events-none', !enabledCheck.checked);
    });

    // Toggle Ref Point 2
    const refCountSel = container.querySelector('#dc-ref-count');
    const ref2Div = container.querySelector('#dc-ref2-container');
    refCountSel.addEventListener('change', () => {
        ref2Div.classList.toggle('hidden', refCountSel.value !== '2');
    });

    // Toggle Stepped Settings
    const typeSel = container.querySelector('#dc-type');
    const steppedDiv = container.querySelector('#dc-stepped-settings');
    typeSel.addEventListener('change', () => {
        steppedDiv.classList.toggle('hidden', typeSel.value !== 'Stepped');
    });

    // Save
    container.querySelector('#dc-save-btn').addEventListener('click', () => {
        const enabled = enabledCheck.checked;
        let newControls = [...controls];

        if (enabled) {
            const newControl = {
                zoneName: zoneName,
                availabilityScheduleName: container.querySelector('#dc-avail-sched').value,
                deLightGriddingResolution: parseFloat(container.querySelector('#dc-delight-res').value) || undefined,
                controlType: container.querySelector('#dc-type').value,
                minInputPowerFraction: parseFloat(container.querySelector('#dc-min-power').value),
                minLightOutputFraction: parseFloat(container.querySelector('#dc-min-light').value),
                numberSteppedControlSteps: parseInt(container.querySelector('#dc-steps').value),
                probabilityLightingWillBeResetWhenNeeded: parseFloat(container.querySelector('#dc-prob').value),

                // Glare
                glareCalculationDaylightingReferencePointName: container.querySelector('#dc-glare-ref').value === '1' ? 'ReferencePoint1' : (container.querySelector('#dc-glare-ref').value === '2' ? 'ReferencePoint2' : ''),
                glareCalculationAzimuthAngleOfViewDirection: parseFloat(container.querySelector('#dc-glare-az').value),
                maximumAllowableDiscomfortGlareIndex: parseFloat(container.querySelector('#dc-glare-max').value),

                // Ref 1
                totalDaylightingReferencePoints: parseInt(refCountSel.value),
                x1: parseFloat(container.querySelector('#dc-x1').value),
                y1: parseFloat(container.querySelector('#dc-y1').value),
                z1: parseFloat(container.querySelector('#dc-z1').value),
                illuminanceSetpoint1: parseFloat(container.querySelector('#dc-setpoint1').value),
                fractionZoneControlled1: parseFloat(container.querySelector('#dc-frac1').value),
            };

            if (newControl.totalDaylightingReferencePoints === 2) {
                newControl.x2 = parseFloat(container.querySelector('#dc-x2').value);
                newControl.y2 = parseFloat(container.querySelector('#dc-y2').value);
                newControl.z2 = parseFloat(container.querySelector('#dc-z2').value);
                newControl.illuminanceSetpoint2 = parseFloat(container.querySelector('#dc-setpoint2').value);
                newControl.fractionZoneControlled2 = parseFloat(container.querySelector('#dc-frac2').value);
            }

            // Update or Add
            const idx = newControls.findIndex(c => c.zoneName === zoneName);
            if (idx >= 0) {
                newControls[idx] = newControl;
            } else {
                newControls.push(newControl);
            }
        } else {
            // Remove
            newControls = newControls.filter(c => c.zoneName !== zoneName);
        }

        const newConfig = { ...config.daylighting, controls: newControls };
        setDaylighting(project, newConfig);
        alert(`Daylighting controls for ${zoneName} saved.`);
    });
}

function renderMapEditor(panel, data, isNew) {
    const container = panel.querySelector('#daylighting-editor');
    const zones = getZones();
    const name = data?.name || '';

    const zoneOpts = (sel) => {
        let html = '';
        zones.forEach(z => {
            const s = z.name === sel ? ' selected' : '';
            html += `<option value="${z.name}"${s}>${z.name}</option>`;
        });
        return html;
    };

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
                ${isNew ? 'New Illuminance Map' : 'Edit Illuminance Map'}
            </h3>

            <div>
                ${renderLabel('Map Name', 'mapName')}
                <input type="text" id="map-name" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${name}">
            </div>

            <div>
                ${renderLabel('Zone', 'mapZone')}
                <select id="map-zone" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">${zoneOpts(data?.zoneName)}</select>
            </div>

            <div class="grid grid-cols-3 gap-2">
                <div>${renderLabel('Z Height', 'mapOrigin')}<input type="number" id="map-z" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data?.zHeight || 0.8}" step="0.1"></div>
                <div>${renderLabel('X Min', 'mapOrigin')}<input type="number" id="map-xmin" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data?.xMin || 0}" step="0.1"></div>
                <div>${renderLabel('X Max', 'mapOrigin')}<input type="number" id="map-xmax" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data?.xMax || 10}" step="0.1"></div>
            </div>
            <div class="grid grid-cols-3 gap-2">
                <div>${renderLabel('Num X Points', 'mapGrid')}<input type="number" id="map-nx" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data?.numberXPoints || 10}" step="1"></div>
                <div>${renderLabel('Y Min', 'mapOrigin')}<input type="number" id="map-ymin" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data?.yMin || 0}" step="0.1"></div>
                <div>${renderLabel('Y Max', 'mapOrigin')}<input type="number" id="map-ymax" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data?.yMax || 10}" step="0.1"></div>
            </div>
            <div>
                ${renderLabel('Num Y Points', 'mapGrid')}
                <input type="number" id="map-ny" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data?.numberYPoints || 10}" step="1">
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                ${!isNew ? '<button class="btn btn-sm btn-danger" id="map-delete-btn">Delete</button>' : ''}
                <button class="btn btn-sm btn-primary" id="map-save-btn">Save Map</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Save
    container.querySelector('#map-save-btn').addEventListener('click', () => {
        const newName = container.querySelector('#map-name').value.trim();
        if (!newName) return alert('Name is required');

        const newMap = {
            name: newName,
            zoneName: container.querySelector('#map-zone').value,
            zHeight: parseFloat(container.querySelector('#map-z').value),
            xMin: parseFloat(container.querySelector('#map-xmin').value),
            xMax: parseFloat(container.querySelector('#map-xmax').value),
            numberXPoints: parseInt(container.querySelector('#map-nx').value),
            yMin: parseFloat(container.querySelector('#map-ymin').value),
            yMax: parseFloat(container.querySelector('#map-ymax').value),
            numberYPoints: parseInt(container.querySelector('#map-ny').value),
        };

        const { config } = getConfig(project);
        let maps = [...(config.daylighting?.illuminanceMaps || [])];

        if (!isNew) maps = maps.filter(m => m.name !== name);
        maps = maps.filter(m => m.name !== newName); // No dupes
        maps.push(newMap);

        const newConfig = { ...config.daylighting, illuminanceMaps: maps };
        setDaylighting(project, newConfig);
        renderSidebarList(panel);
        renderMapEditor(panel, newMap, false);
    });

    // Delete
    if (!isNew) {
        container.querySelector('#map-delete-btn').addEventListener('click', () => {
            if (confirm(`Delete map "${name}"?`)) {
                const { config } = getConfig(project);
                const maps = (config.daylighting?.illuminanceMaps || []).filter(m => m.name !== name);
                const newConfig = { ...config.daylighting, illuminanceMaps: maps };
                setDaylighting(project, newConfig);
                renderSidebarList(panel);
                container.innerHTML = '<div class="text-[--text-secondary] text-sm text-center mt-10">Select an item to edit.</div>';
            }
        });
    }
}

function renderComplexFenestrationEditor(panel, data, isNew) {
    const container = panel.querySelector('#daylighting-editor');
    const name = data?.name || '';
    const { config } = getConfig(project);

    // Helper to get value safely
    const val = (v, def) => (v !== undefined && v !== null ? v : def);

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
                ${isNew ? 'New Complex Fenestration' : 'Edit Complex Fenestration'}
            </h3>

            <div>
                ${renderLabel('Name', 'cfsName')}
                <input type="text" id="cfs-name" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${name}">
            </div>

            <div>
                ${renderLabel('Type', 'cfsType')}
                <input type="text" id="cfs-type" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.complexFenestrationType, '')}" placeholder="e.g. BTDF^GEN^WINDOW^1.0^20.0">
                <p class="text-xs text-[--text-secondary] mt-1">Format: BTDF^GEN^Type^Trans^Dispersion or BTDF^FILE^Filename</p>
            </div>

            <div>
                ${renderLabel('Host Surface', 'cfsHostSurface')}
                <input type="text" id="cfs-host" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.buildingSurfaceName, '')}">
            </div>

            <div>
                ${renderLabel('Window Name', 'cfsWindowName')}
                <input type="text" id="cfs-window" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.windowName, '')}">
            </div>

            <div>
                ${renderLabel('Rotation [deg]', 'cfsRotation')}
                <input type="number" id="cfs-rot" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.fenestrationRotation, 0)}" step="1">
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                ${!isNew ? '<button class="btn btn-sm btn-danger" id="cfs-delete-btn">Delete</button>' : ''}
                <button class="btn btn-sm btn-primary" id="cfs-save-btn">Save CFS</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Save
    container.querySelector('#cfs-save-btn').addEventListener('click', () => {
        const newName = container.querySelector('#cfs-name').value.trim();
        if (!newName) return alert('Name is required');

        const newCFS = {
            name: newName,
            complexFenestrationType: container.querySelector('#cfs-type').value,
            buildingSurfaceName: container.querySelector('#cfs-host').value,
            windowName: container.querySelector('#cfs-window').value,
            fenestrationRotation: parseFloat(container.querySelector('#cfs-rot').value),
        };

        let list = [...(config.daylighting?.complexFenestrations || [])];
        if (!isNew) list = list.filter(x => x.name !== name);
        list = list.filter(x => x.name !== newName);
        list.push(newCFS);

        const newConfig = { ...config.daylighting, complexFenestrations: list };
        setDaylighting(project, newConfig);
        renderSidebarList(panel);
        renderComplexFenestrationEditor(panel, newCFS, false);
    });

    // Delete
    if (!isNew) {
        container.querySelector('#cfs-delete-btn').addEventListener('click', () => {
            if (confirm(`Delete CFS "${name}"?`)) {
                const list = (config.daylighting?.complexFenestrations || []).filter(x => x.name !== name);
                const newConfig = { ...config.daylighting, complexFenestrations: list };
                setDaylighting(project, newConfig);
                renderSidebarList(panel);
                container.innerHTML = '<div class="text-[--text-secondary] text-sm text-center mt-10">Select an item to edit.</div>';
            }
        });
    }
}

function renderDaylightingDeviceEditor(panel, data, isNew) {
    const container = panel.querySelector('#daylighting-editor');
    const name = data?.name || '';
    const { config } = getConfig(project);

    // Helper to get value safely
    const val = (v, def) => (v !== undefined && v !== null ? v : def);
    const type = data?.type || 'Tubular';

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
                ${isNew ? 'New Daylighting Device' : 'Edit Daylighting Device'}
            </h3>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Name', 'deviceName')}
                    <input type="text" id="dev-name" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${name}">
                </div>
                <div>
                    ${renderLabel('Type', 'deviceType')}
                    <select id="dev-type" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                        <option value="Tubular" ${type === 'Tubular' ? 'selected' : ''}>Tubular</option>
                        <option value="Shelf" ${type === 'Shelf' ? 'selected' : ''}>Shelf</option>
                        <option value="LightWell" ${type === 'LightWell' ? 'selected' : ''}>LightWell</option>
                    </select>
                </div>
            </div>

            <!-- Tubular Fields -->
            <div id="dev-tubular" class="${type === 'Tubular' ? '' : 'hidden'} space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>${renderLabel('Dome Name', 'tubularDome')}<input type="text" id="tub-dome" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.domeName, '')}"></div>
                    <div>${renderLabel('Diffuser Name', 'tubularDiffuser')}<input type="text" id="tub-diff" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.diffuserName, '')}"></div>
                </div>
                <div>${renderLabel('Construction', 'tubularConstruction')}<input type="text" id="tub-cons" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.constructionName, '')}"></div>
                <div class="grid grid-cols-3 gap-2">
                    <div>${renderLabel('Diameter [m]', 'tubularDiameter')}<input type="number" id="tub-dia" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.diameter, 0.35)}" step="0.01"></div>
                    <div>${renderLabel('Length [m]', 'tubularLength')}<input type="number" id="tub-len" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.totalLength, 1.0)}" step="0.1"></div>
                    <div>${renderLabel('R-Value', 'tubularRValue')}<input type="number" id="tub-r" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.effectiveThermalResistance, 0.28)}" step="0.01"></div>
                </div>
            </div>

            <!-- Shelf Fields -->
            <div id="dev-shelf" class="${type === 'Shelf' ? '' : 'hidden'} space-y-4">
                <div>${renderLabel('Window Name', 'shelfWindow')}<input type="text" id="shelf-win" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.windowName, '')}"></div>
                <div class="grid grid-cols-2 gap-4">
                    <div>${renderLabel('Inside Shelf', 'shelfInside')}<input type="text" id="shelf-in" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.insideShelfName, '')}"></div>
                    <div>${renderLabel('Outside Shelf', 'shelfOutside')}<input type="text" id="shelf-out" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.outsideShelfName, '')}"></div>
                </div>
                <div>${renderLabel('Outside Shelf Const.', 'shelfConstruction')}<input type="text" id="shelf-cons" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.outsideShelfConstructionName, '')}"></div>
                <div>${renderLabel('View Factor', 'shelfViewFactor')}<input type="number" id="shelf-vf" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.viewFactorToOutsideShelf, '')}" step="0.01" placeholder="Auto"></div>
            </div>

            <!-- LightWell Fields -->
            <div id="dev-well" class="${type === 'LightWell' ? '' : 'hidden'} space-y-4">
                <div>${renderLabel('Exterior Window', 'wellWindow')}<input type="text" id="well-win" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.exteriorWindowName, '')}"></div>
                <div class="grid grid-cols-2 gap-4">
                    <div>${renderLabel('Height [m]', 'wellHeight')}<input type="number" id="well-h" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.heightOfWell, 1.0)}" step="0.1"></div>
                    <div>${renderLabel('Perimeter [m]', 'wellPerimeter')}<input type="number" id="well-p" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.perimeterOfBottomOfWell, 10.0)}" step="0.1"></div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>${renderLabel('Area [m2]', 'wellArea')}<input type="number" id="well-a" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.areaOfBottomOfWell, 5.0)}" step="0.1"></div>
                    <div>${renderLabel('Reflectance', 'wellReflectance')}<input type="number" id="well-vis" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${val(data?.visibleReflectanceOfWellWalls, 0.7)}" step="0.05" min="0" max="1"></div>
                </div>
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                ${!isNew ? '<button class="btn btn-sm btn-danger" id="dev-delete-btn">Delete</button>' : ''}
                <button class="btn btn-sm btn-primary" id="dev-save-btn">Save Device</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Type toggle
    const typeSel = container.querySelector('#dev-type');
    typeSel.addEventListener('change', () => {
        const t = typeSel.value;
        container.querySelector('#dev-tubular').classList.toggle('hidden', t !== 'Tubular');
        container.querySelector('#dev-shelf').classList.toggle('hidden', t !== 'Shelf');
        container.querySelector('#dev-well').classList.toggle('hidden', t !== 'LightWell');
    });

    // Save
    container.querySelector('#dev-save-btn').addEventListener('click', () => {
        const newName = container.querySelector('#dev-name').value.trim();
        if (!newName) return alert('Name is required');
        const t = typeSel.value;

        const newDev = {
            name: newName,
            type: t,
        };

        if (t === 'Tubular') {
            newDev.domeName = container.querySelector('#tub-dome').value;
            newDev.diffuserName = container.querySelector('#tub-diff').value;
            newDev.constructionName = container.querySelector('#tub-cons').value;
            newDev.diameter = parseFloat(container.querySelector('#tub-dia').value);
            newDev.totalLength = parseFloat(container.querySelector('#tub-len').value);
            newDev.effectiveThermalResistance = parseFloat(container.querySelector('#tub-r').value);
        } else if (t === 'Shelf') {
            newDev.windowName = container.querySelector('#shelf-win').value;
            newDev.insideShelfName = container.querySelector('#shelf-in').value;
            newDev.outsideShelfName = container.querySelector('#shelf-out').value;
            newDev.outsideShelfConstructionName = container.querySelector('#shelf-cons').value;
            newDev.viewFactorToOutsideShelf = parseFloat(container.querySelector('#shelf-vf').value) || undefined;
        } else if (t === 'LightWell') {
            newDev.exteriorWindowName = container.querySelector('#well-win').value;
            newDev.heightOfWell = parseFloat(container.querySelector('#well-h').value);
            newDev.perimeterOfBottomOfWell = parseFloat(container.querySelector('#well-p').value);
            newDev.areaOfBottomOfWell = parseFloat(container.querySelector('#well-a').value);
            newDev.visibleReflectanceOfWellWalls = parseFloat(container.querySelector('#well-vis').value);
        }

        let list = [...(config.daylighting?.devices || [])];
        if (!isNew) list = list.filter(x => x.name !== name);
        list = list.filter(x => x.name !== newName);
        list.push(newDev);

        const newConfig = { ...config.daylighting, devices: list };
        setDaylighting(project, newConfig);
        renderSidebarList(panel);
        renderDaylightingDeviceEditor(panel, newDev, false);
    });

    // Delete
    if (!isNew) {
        container.querySelector('#dev-delete-btn').addEventListener('click', () => {
            if (confirm(`Delete device "${name}"?`)) {
                const list = (config.daylighting?.devices || []).filter(x => x.name !== name);
                const newConfig = { ...config.daylighting, devices: list };
                setDaylighting(project, newConfig);
                renderSidebarList(panel);
                container.innerHTML = '<div class="text-[--text-secondary] text-sm text-center mt-10">Select an item to edit.</div>';
            }
        });
    }
}

function renderVariablesEditor(panel) {
    const container = panel.querySelector('#daylighting-editor');
    const { config } = getConfig(project);
    const vars = config.daylighting?.outputVariables || [];
    const mapStyle = config.daylighting?.illuminanceMapStyle || {};

    const availableVars = [
        'Zone Lights Electric Power',
        'Zone Lights Electric Energy',
        'Daylighting Reference Point 1 Illuminance',
        'Daylighting Reference Point 2 Illuminance',
        'Daylighting Lighting Power Multiplier',
        'Zone Application Lighting Reduction Factor'
    ];

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
                Output Variables & Settings
            </h3>
            
            <!-- Map Style -->
            <div class="bg-black/20 p-4 rounded border border-gray-700/50 mb-4">
                <h4 class="text-xs font-bold text-[--text-secondary] uppercase mb-2">Illuminance Map Style</h4>
                <div>
                    <label class="label">Column Separator</label>
                    <select id="map-style-sep" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                        <option value="Comma" ${mapStyle.columnSeparator === 'Comma' ? 'selected' : ''}>Comma (CSV)</option>
                        <option value="Tab" ${mapStyle.columnSeparator === 'Tab' ? 'selected' : ''}>Tab</option>
                        <option value="Fixed" ${mapStyle.columnSeparator === 'Fixed' ? 'selected' : ''}>Fixed Space</option>
                    </select>
                </div>
            </div>

            <p class="text-xs text-[--text-secondary]">Select variables to include in the simulation output.</p>
            
            <div class="space-y-2 bg-black/20 p-4 rounded border border-gray-700/50">
    `;

    availableVars.forEach(v => {
        const checked = vars.some(x => x.variableName === v) ? 'checked' : '';
        html += `
            <div class="flex items-center gap-2">
                <input type="checkbox" id="var-${v.replace(/\s+/g, '-')}" value="${v}" ${checked}>
                <label for="var-${v.replace(/\s+/g, '-')}" class="text-sm">${v}</label>
            </div>
        `;
    });

    html += `
            </div>
            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                <button class="btn btn-sm btn-primary" id="vars-save-btn">Save Settings</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    container.querySelector('#vars-save-btn').addEventListener('click', () => {
        const newVars = [];
        availableVars.forEach(v => {
            const cb = container.querySelector(`#var-${v.replace(/\s+/g, '-')}`);
            if (cb.checked) {
                newVars.push({
                    keyValue: '*',
                    variableName: v,
                    reportingFrequency: 'Hourly'
                });
            }
        });

        const newMapStyle = {
            columnSeparator: container.querySelector('#map-style-sep').value
        };

        const newConfig = {
            ...config.daylighting,
            outputVariables: newVars,
            illuminanceMapStyle: newMapStyle
        };
        setDaylighting(project, newConfig);
        alert('Settings saved.');
    });
}
