
import { getDom } from './dom.js';
import { project } from './project.js';
import {
    getConfig,
    setThermostatsAndIdealLoads,
    setSizingZones,
    setSizingSystems,
    setSizingPlants
} from './energyplusConfigService.js';

let dom;

// Helper to get zones and schedules (mocked or from project)
function getZones() {
    if (project && typeof project.getZones === 'function') {
        return project.getZones() || [];
    }
    return [];
}

function getScheduleNames() {
    const { config } = getConfig(project);
    const schedules = config.schedules || {};
    const names = [];
    if (schedules.dayHourly) names.push(...schedules.dayHourly.map(s => s.name));
    if (schedules.compact) names.push(...schedules.compact.map(s => s.name));
    if (schedules.constant) names.push(...schedules.constant.map(s => s.name));
    if (schedules.file) names.push(...schedules.file.map(s => s.name));
    if (schedules.year) names.push(...schedules.year.map(s => s.name));
    return [...new Set(names)].sort();
}

export function openThermostatsPanel() {
    dom = getDom();
    const panelId = 'panel-energyplus-thermostats';
    const btnId = 'toggle-panel-thermostats-btn';
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
        panel = createThermostatsPanel();
        const container = document.getElementById('window-container');
        container.appendChild(panel);
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

    // Default view
    if (!panel.dataset.currentView) {
        panel.dataset.currentView = 'thermostats';
    }

    renderSidebarList(panel);
}

function createThermostatsPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-thermostats';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.style.width = '850px';
    panel.style.height = '600px';

    panel.innerHTML = `
        <div class="window-header">
            <span>Thermostats & Ideal Loads</span>
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
                        <button class="btn btn-xs btn-secondary" id="add-item-btn" title="Add New Thermostat" style="display: none;">+</button>
                    </div>
                    <div id="tstat-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                        <!-- List items injected here -->
                    </div>
                </div>

                <!-- Right Content: Editor -->
                <div id="tstat-editor" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
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
            closeButton.onclick = () => panel.classList.add('hidden');
        }
    }

    // No more toggle setup, just render list
    renderSidebarList(panel);

    // Add button logic
    const addBtn = panel.querySelector('#add-item-btn');
    addBtn.addEventListener('click', () => {
        renderThermostatEditor(panel, null, true);
    });

    return panel;
}

// Removed setupViewToggles as it's no longer needed

function renderSidebarList(panel) {
    const listContainer = panel.querySelector('#tstat-list');
    const { config } = getConfig(project);
    const addBtn = panel.querySelector('#add-item-btn');

    listContainer.innerHTML = '';

    const createHeader = (label) => {
        const header = document.createElement('div');
        // Match the "Configuration" label style but slightly smaller/distinct for sections if needed
        // Or just use the exact same style as the top label
        header.style.cssText = 'padding: 0.5rem 0.75rem; margin-top: 0.5rem;';
        header.innerHTML = `<span class="label" style="font-size: 0.75rem; color: var(--text-secondary);">${label}</span>`;
        return header;
    };

    const createItem = (label, dataAttributes) => {
        const item = document.createElement('div');
        item.className = 'tstat-item';
        // Match Project Setup styling exactly
        item.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';

        // Add data attributes
        Object.entries(dataAttributes).forEach(([key, value]) => {
            item.dataset[key] = value;
        });

        // Use standard text-xs, no bold for special items
        item.innerHTML = `<div class="text-xs">${label}</div>`;

        // Hover effects (mimicking Project Setup)
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
            listContainer.querySelectorAll('.tstat-item').forEach(el => {
                el.classList.remove('active');
                el.style.backgroundColor = '';
                el.style.color = '';
            });

            // Set active state
            item.classList.add('active');
            item.style.backgroundColor = 'var(--accent-color)';
            item.style.color = 'white';

            // Show/Hide Add Button based on context
            if (dataAttributes.context === 'thermostats') {
                addBtn.style.display = 'block';
            } else {
                addBtn.style.display = 'none';
            }

            // Trigger action
            if (dataAttributes.special === 'assignments') {
                renderZoneAssignments(panel);
            } else if (dataAttributes.special === 'global') {
                renderIdealLoadsGlobal(panel);
            } else if (dataAttributes.zone) {
                renderIdealLoadsZone(panel, dataAttributes.zone);
            } else if (dataAttributes.sizing) {
                renderSizingView(panel, dataAttributes.sizing);
            } else if (dataAttributes.name) {
                const t = (config.thermostats || []).find(x => x.name === dataAttributes.name && x.scope === 'setpoint');
                renderThermostatEditor(panel, t, false);
            }
        });

        return item;
    };

    // --- THERMOSTATS SECTION ---
    listContainer.appendChild(createHeader('Thermostats'));
    listContainer.appendChild(createItem('Zone Assignments', { special: 'assignments', context: 'thermostats' }));

    const thermostats = (config.thermostats || []).filter(t => t.scope === 'setpoint');
    if (thermostats.length > 0) {
        thermostats.forEach(t => {
            listContainer.appendChild(createItem(t.name, { name: t.name, context: 'thermostats' }));
        });
    }

    // --- IDEAL LOADS SECTION ---
    listContainer.appendChild(createHeader('Ideal Loads'));
    listContainer.appendChild(createItem('Global Settings', { special: 'global', context: 'idealloads' }));

    const zones = getZones();
    // Limit displayed zones to avoid massive lists, or maybe just list them all?
    // Project Setup lists all categories. Schedules lists all schedules.
    // We will list all zones.
    zones.forEach(z => {
        listContainer.appendChild(createItem(z.name, { zone: z.name, context: 'idealloads' }));
    });

    // --- HVAC SIZING SECTION ---
    listContainer.appendChild(createHeader('HVAC Sizing'));
    const sizingItems = [
        { id: 'zone-sizing', label: 'Zone Sizing' },
        { id: 'system-sizing', label: 'System Sizing' },
        { id: 'plant-sizing', label: 'Plant Sizing' }
    ];

    sizingItems.forEach(item => {
        listContainer.appendChild(createItem(item.label, { sizing: item.id, context: 'sizing' }));
    });
}

// ==========================================
// THERMOSTATS EDITORS
// ==========================================

function renderThermostatEditor(panel, data, isNew) {
    const container = panel.querySelector('#tstat-editor');
    const schedNames = getScheduleNames();
    const name = data?.name || '';
    const type = data?.type || 'DualSetpoint';

    const schedOptions = (selected) => {
        let html = '<option value="">(none)</option>';
        schedNames.forEach((nm) => {
            const sel = nm === selected ? ' selected' : '';
            html += `<option value="${nm}"${sel}>${nm}</option>`;
        });
        return html;
    };

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
                ${isNew ? 'New Thermostat Setpoint' : 'Edit Thermostat Setpoint'}
            </h3>

            <div>
                <label class="label">Name</label>
                <input type="text" id="ts-name" class="w-full mt-1" value="${name}">
            </div>

            <div>
                <label class="label">Control Type</label>
                <select id="ts-type" class="w-full mt-1">
                    <option value="DualSetpoint" ${type === 'DualSetpoint' ? 'selected' : ''}>DualSetpoint</option>
                    <option value="SingleHeating" ${type === 'SingleHeating' ? 'selected' : ''}>SingleHeating</option>
                    <option value="SingleCooling" ${type === 'SingleCooling' ? 'selected' : ''}>SingleCooling</option>
                    <option value="SingleHeatingOrCooling" ${type === 'SingleHeatingOrCooling' ? 'selected' : ''}>SingleHeatingOrCooling</option>
                </select>
            </div>

            <div id="ts-scheds-container" class="space-y-4">
                <!-- Injected based on type -->
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                ${!isNew ? '<button class="btn btn-sm btn-danger" id="ts-delete-btn">Delete</button>' : ''}
                <button class="btn btn-sm btn-primary" id="ts-save-btn">Save</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    const updateSchedInputs = (t) => {
        const div = container.querySelector('#ts-scheds-container');
        if (t === 'DualSetpoint') {
            div.innerHTML = `
                <div>
                    <label class="label">Heating Schedule</label>
                    <select id="ts-heat-sched" class="w-full mt-1">${schedOptions(data?.heatingScheduleName)}</select>
                </div>
                <div>
                    <label class="label">Cooling Schedule</label>
                    <select id="ts-cool-sched" class="w-full mt-1">${schedOptions(data?.coolingScheduleName)}</select>
                </div>
            `;
        } else {
            div.innerHTML = `
                <div>
                    <label class="label">Setpoint Schedule</label>
                    <select id="ts-single-sched" class="w-full mt-1">${schedOptions(data?.singleScheduleName || data?.heatingScheduleName || data?.coolingScheduleName)}</select>
                </div>
            `;
        }
    };

    updateSchedInputs(type);
    container.querySelector('#ts-type').addEventListener('change', (e) => updateSchedInputs(e.target.value));

    container.querySelector('#ts-save-btn').addEventListener('click', () => {
        const newName = container.querySelector('#ts-name').value.trim();
        if (!newName) return alert('Name is required');

        const newType = container.querySelector('#ts-type').value;
        const newItem = { name: newName, type: newType, scope: 'setpoint' };

        if (newType === 'DualSetpoint') {
            newItem.heatingScheduleName = container.querySelector('#ts-heat-sched').value;
            newItem.coolingScheduleName = container.querySelector('#ts-cool-sched').value;
        } else {
            newItem.singleScheduleName = container.querySelector('#ts-single-sched').value;
            // Map to specific props for compatibility if needed, but singleScheduleName is clear
            if (newType === 'SingleHeating') newItem.heatingScheduleName = newItem.singleScheduleName;
            if (newType === 'SingleCooling') newItem.coolingScheduleName = newItem.singleScheduleName;
        }

        const { config } = getConfig(project);
        let list = [...(config.thermostats || [])];

        // Remove old if editing
        if (!isNew) list = list.filter(x => !(x.name === name && x.scope === 'setpoint'));
        // Remove duplicates
        list = list.filter(x => !(x.name === newName && x.scope === 'setpoint'));

        list.push(newItem);

        // Save
        setThermostatsAndIdealLoads(project, list, config.idealLoads);
        renderSidebarList(panel);
        renderThermostatEditor(panel, newItem, false);
    });

    if (!isNew) {
        container.querySelector('#ts-delete-btn').addEventListener('click', () => {
            if (confirm(`Delete thermostat setpoint "${name}"?`)) {
                const { config } = getConfig(project);
                const list = (config.thermostats || []).filter(x => !(x.name === name && x.scope === 'setpoint'));
                setThermostatsAndIdealLoads(project, list, config.idealLoads);
                renderSidebarList(panel);
                container.innerHTML = '<div class="text-[--text-secondary] text-sm text-center mt-10">Select an item to edit.</div>';
            }
        });
    }
}

function renderZoneAssignments(panel) {
    const container = panel.querySelector('#tstat-editor');
    const { config } = getConfig(project);
    const zones = getZones();
    const schedNames = getScheduleNames();
    const setpoints = (config.thermostats || []).filter(t => t.scope === 'setpoint');

    // Build map of existing assignments
    const assignments = new Map();
    (config.thermostats || []).forEach(t => {
        if (t.scope !== 'setpoint' && t.zoneName) {
            assignments.set(t.zoneName, t);
        }
    });

    const setpointOptions = (selected, filterType) => {
        let html = '<option value="">(none)</option>';
        setpoints.forEach(sp => {
            if (!filterType || sp.type === filterType) {
                const sel = sp.name === selected ? ' selected' : '';
                html += `<option value="${sp.name}"${sel}>${sp.name}</option>`;
            }
        });
        return html;
    };

    const schedOptions = (selected) => {
        let html = '<option value="">(none)</option>';
        schedNames.forEach(nm => {
            const sel = nm === selected ? ' selected' : '';
            html += `<option value="${nm}"${sel}>${nm}</option>`;
        });
        return html;
    };

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Zone Thermostat Assignments</h3>
            <p class="text-xs text-[--text-secondary]">Assign thermostat setpoints and control schedules to each zone.</p>
            
            <div class="border border-gray-700/50 rounded bg-black/20 overflow-hidden">
                <table class="w-full text-xs">
                    <thead class="bg-black/40 text-[--text-secondary]">
                        <tr>
                            <th class="px-2 py-2 text-left font-medium">Zone</th>
                            <th class="px-2 py-2 text-left font-medium">Control Type Sched</th>
                            <th class="px-2 py-2 text-left font-medium">Dual Setpoint</th>
                            <th class="px-2 py-2 text-left font-medium">Single Heat</th>
                            <th class="px-2 py-2 text-left font-medium">Single Cool</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700/30">
    `;

    zones.forEach(z => {
        const a = assignments.get(z.name) || {};
        html += `
            <tr data-zone="${z.name}">
                <td class="px-2 py-2 text-[--accent-color]">${z.name}</td>
                <td class="px-2 py-2"><select class="w-full bg-black/40 border border-gray-600 rounded px-1 py-0.5" data-field="controlTypeSchedule">${schedOptions(a.controlTypeSchedule)}</select></td>
                <td class="px-2 py-2"><select class="w-full bg-black/40 border border-gray-600 rounded px-1 py-0.5" data-field="dualSetpoint">${setpointOptions(a.dualSetpoint, 'DualSetpoint')}</select></td>
                <td class="px-2 py-2"><select class="w-full bg-black/40 border border-gray-600 rounded px-1 py-0.5" data-field="singleHeatingSetpoint">${setpointOptions(a.singleHeatingSetpoint, 'SingleHeating')}</select></td>
                <td class="px-2 py-2"><select class="w-full bg-black/40 border border-gray-600 rounded px-1 py-0.5" data-field="singleCoolingSetpoint">${setpointOptions(a.singleCoolingSetpoint, 'SingleCooling')}</select></td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                <button class="btn btn-sm btn-primary" id="assign-save-btn">Save Assignments</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    container.querySelector('#assign-save-btn').addEventListener('click', () => {
        const newAssignments = [];
        container.querySelectorAll('tbody tr').forEach(tr => {
            const zoneName = tr.dataset.zone;
            const controlTypeSchedule = tr.querySelector('[data-field="controlTypeSchedule"]').value;
            const dualSetpoint = tr.querySelector('[data-field="dualSetpoint"]').value;
            const singleHeatingSetpoint = tr.querySelector('[data-field="singleHeatingSetpoint"]').value;
            const singleCoolingSetpoint = tr.querySelector('[data-field="singleCoolingSetpoint"]').value;

            if (controlTypeSchedule || dualSetpoint || singleHeatingSetpoint || singleCoolingSetpoint) {
                newAssignments.push({
                    zoneName,
                    controlTypeSchedule,
                    dualSetpoint,
                    singleHeatingSetpoint,
                    singleCoolingSetpoint,
                    // Implicitly not 'setpoint' scope
                });
            }
        });

        // Merge with setpoints
        const setpointsOnly = (config.thermostats || []).filter(t => t.scope === 'setpoint');
        const finalList = [...setpointsOnly, ...newAssignments];

        setThermostatsAndIdealLoads(project, finalList, config.idealLoads);
        alert('Zone assignments saved.');
    });
}

// ==========================================
// IDEAL LOADS EDITORS
// ==========================================

function renderIdealLoadsGlobal(panel) {
    const container = panel.querySelector('#tstat-editor');
    const { config } = getConfig(project);
    const global = config.idealLoads?.global || {};
    const schedNames = getScheduleNames();

    const limitOpts = (sel) => `
        <option value="">NoLimit</option>
        <option value="LimitFlowRate" ${sel === 'LimitFlowRate' ? 'selected' : ''}>LimitFlowRate</option>
        <option value="LimitCapacity" ${sel === 'LimitCapacity' ? 'selected' : ''}>LimitCapacity</option>
        <option value="LimitFlowRateAndCapacity" ${sel === 'LimitFlowRateAndCapacity' ? 'selected' : ''}>LimitFlowRateAndCapacity</option>
    `;

    const schedOpts = (sel) => {
        let html = '<option value="">(none)</option>';
        schedNames.forEach(n => html += `<option value="${n}" ${n === sel ? 'selected' : ''}>${n}</option>`);
        return html;
    };

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Ideal Loads Global Defaults</h3>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="label">Availability Schedule</label>
                    <select id="il-avail" class="w-full mt-1">${schedOpts(global.availabilitySchedule)}</select>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="label">Heating Limit Type</label>
                    <select id="il-heat-limit" class="w-full mt-1">${limitOpts(global.heatingLimitType)}</select>
                </div>
                <div>
                    <label class="label">Max Heating Supply Temp [°C]</label>
                    <input type="number" id="il-max-heat" class="w-full mt-1" value="${global.maxHeatingSupplyAirTemperature || 50}">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="label">Cooling Limit Type</label>
                    <select id="il-cool-limit" class="w-full mt-1">${limitOpts(global.coolingLimitType)}</select>
                </div>
                <div>
                    <label class="label">Min Cooling Supply Temp [°C]</label>
                    <input type="number" id="il-min-cool" class="w-full mt-1" value="${global.minCoolingSupplyAirTemperature || 13}">
                </div>
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                <button class="btn btn-sm btn-primary" id="il-global-save">Save Global Settings</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    container.querySelector('#il-global-save').addEventListener('click', () => {
        const newGlobal = {
            availabilitySchedule: container.querySelector('#il-avail').value,
            heatingLimitType: container.querySelector('#il-heat-limit').value,
            maxHeatingSupplyAirTemperature: parseFloat(container.querySelector('#il-max-heat').value),
            coolingLimitType: container.querySelector('#il-cool-limit').value,
            minCoolingSupplyAirTemperature: parseFloat(container.querySelector('#il-min-cool').value),
        };

        const newIdealLoads = { ...config.idealLoads, global: newGlobal };
        setThermostatsAndIdealLoads(project, config.thermostats, newIdealLoads);
        alert('Global Ideal Loads settings saved.');
    });
}

function renderIdealLoadsZone(panel, zoneName) {
    const container = panel.querySelector('#tstat-editor');
    const { config } = getConfig(project);
    const perZone = config.idealLoads?.perZone || [];
    const zoneData = perZone.find(z => z.zoneName === zoneName) || { zoneName };

    const limitOpts = (sel) => `
        <option value="">(inherit/global)</option>
        <option value="NoLimit" ${sel === 'NoLimit' ? 'selected' : ''}>NoLimit</option>
        <option value="LimitFlowRate" ${sel === 'LimitFlowRate' ? 'selected' : ''}>LimitFlowRate</option>
        <option value="LimitCapacity" ${sel === 'LimitCapacity' ? 'selected' : ''}>LimitCapacity</option>
        <option value="LimitFlowRateAndCapacity" ${sel === 'LimitFlowRateAndCapacity' ? 'selected' : ''}>LimitFlowRateAndCapacity</option>
    `;

    const oaMethodOpts = (sel) => `
        <option value="">(inherit/global)</option>
        <option value="None" ${sel === 'None' ? 'selected' : ''}>None</option>
        <option value="Sum" ${sel === 'Sum' ? 'selected' : ''}>Sum</option>
        <option value="Flow/Person" ${sel === 'Flow/Person' ? 'selected' : ''}>Flow/Person</option>
        <option value="Flow/Area" ${sel === 'Flow/Area' ? 'selected' : ''}>Flow/Area</option>
    `;

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Ideal Loads: ${zoneName}</h3>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="label">Outdoor Air Method</label>
                    <select id="il-oa-method" class="w-full mt-1">${oaMethodOpts(zoneData.outdoorAirMethod)}</select>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="label">Flow per Person [m³/s]</label>
                    <input type="number" step="0.001" id="il-oa-person" class="w-full mt-1" value="${zoneData.outdoorAirFlowPerPerson || ''}">
                </div>
                <div>
                    <label class="label">Flow per Area [m³/s-m²]</label>
                    <input type="number" step="0.001" id="il-oa-area" class="w-full mt-1" value="${zoneData.outdoorAirFlowPerArea || ''}">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="label">Heating Limit Override</label>
                    <select id="il-heat-limit" class="w-full mt-1">${limitOpts(zoneData.heatingLimitType)}</select>
                </div>
                <div>
                    <label class="label">Cooling Limit Override</label>
                    <select id="il-cool-limit" class="w-full mt-1">${limitOpts(zoneData.coolingLimitType)}</select>
                </div>
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                <button class="btn btn-sm btn-primary" id="il-zone-save">Save Override</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    container.querySelector('#il-zone-save').addEventListener('click', () => {
        const newData = {
            zoneName,
            outdoorAirMethod: container.querySelector('#il-oa-method').value,
            outdoorAirFlowPerPerson: parseFloat(container.querySelector('#il-oa-person').value) || null,
            outdoorAirFlowPerArea: parseFloat(container.querySelector('#il-oa-area').value) || null,
            heatingLimitType: container.querySelector('#il-heat-limit').value,
            coolingLimitType: container.querySelector('#il-cool-limit').value,
        };

        let newPerZone = [...perZone];
        // Remove existing
        newPerZone = newPerZone.filter(z => z.zoneName !== zoneName);
        // Add new if it has any data
        if (Object.values(newData).some(v => v !== null && v !== '' && v !== zoneName)) {
            newPerZone.push(newData);
        }

        const newIdealLoads = { ...config.idealLoads, perZone: newPerZone };
        setThermostatsAndIdealLoads(project, config.thermostats, newIdealLoads);
        alert(`Ideal Loads settings for ${zoneName} saved.`);
    });
}

// ==========================================
// HVAC SIZING EDITORS
// ==========================================

function renderSizingView(panel, sizingType) {
    const container = panel.querySelector('#tstat-editor');
    const { config } = getConfig(project);
    const sizing = config.sizing || {};

    if (sizingType === 'zone-sizing') {
        const zones = getZones();
        const sizingZones = sizing.zones || [];
        const outdoorAir = config.outdoorAir || {};
        const dsoaNames = Array.isArray(outdoorAir.designSpecs) ? outdoorAir.designSpecs.map(d => d.name) : [];

        let html = `
            <div class="space-y-4">
                <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Zone Sizing Configuration</h3>
                <div class="border border-gray-700/50 rounded bg-black/20 overflow-hidden">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40 text-[--text-secondary]">
                            <tr>
                                <th class="px-2 py-2 text-left">Zone</th>
                                <th class="px-2 py-2 text-left">Cool SAT/ΔT</th>
                                <th class="px-2 py-2 text-left">Heat SAT/ΔT</th>
                                <th class="px-2 py-2 text-left">Factors (H/C)</th>
                                <th class="px-2 py-2 text-left">DSOA</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-700/30">
        `;

        zones.forEach(z => {
            const sz = sizingZones.find(x => x.zoneName === z.name) || {};
            html += `
                <tr data-zone="${z.name}">
                    <td class="px-2 py-2 text-[--accent-color]">${z.name}</td>
                    <td class="px-2 py-2">
                        <div class="flex gap-1">
                            <input type="number" class="w-12 bg-black/40 border border-gray-600 rounded px-1" placeholder="SAT" data-f="coolSAT" value="${sz.zoneCoolingDesignSupplyAirTemperature || ''}">
                            <input type="number" class="w-12 bg-black/40 border border-gray-600 rounded px-1" placeholder="ΔT" data-f="coolDT" value="${sz.zoneCoolingDesignSupplyAirTemperatureDifference || ''}">
                        </div>
                    </td>
                    <td class="px-2 py-2">
                        <div class="flex gap-1">
                            <input type="number" class="w-12 bg-black/40 border border-gray-600 rounded px-1" placeholder="SAT" data-f="heatSAT" value="${sz.zoneHeatingDesignSupplyAirTemperature || ''}">
                            <input type="number" class="w-12 bg-black/40 border border-gray-600 rounded px-1" placeholder="ΔT" data-f="heatDT" value="${sz.zoneHeatingDesignSupplyAirTemperatureDifference || ''}">
                        </div>
                    </td>
                    <td class="px-2 py-2">
                        <div class="flex gap-1">
                            <input type="number" class="w-10 bg-black/40 border border-gray-600 rounded px-1" placeholder="H" data-f="sfHeat" value="${sz.zoneHeatingSizingFactor || ''}">
                            <input type="number" class="w-10 bg-black/40 border border-gray-600 rounded px-1" placeholder="C" data-f="sfCool" value="${sz.zoneCoolingSizingFactor || ''}">
                        </div>
                    </td>
                    <td class="px-2 py-2">
                        <select class="w-24 bg-black/40 border border-gray-600 rounded px-1" data-f="dsoa">
                            <option value="">(none)</option>
                            ${dsoaNames.map(n => `<option value="${n}" ${n === sz.designSpecOutdoorAirName ? 'selected' : ''}>${n}</option>`).join('')}
                        </select>
                    </td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>
                <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                    <button class="btn btn-sm btn-primary" id="save-zone-sizing">Save Zone Sizing</button>
                </div>
            </div>
        `;
        container.innerHTML = html;

        container.querySelector('#save-zone-sizing').addEventListener('click', () => {
            const newZones = [];
            container.querySelectorAll('tbody tr').forEach(tr => {
                const zoneName = tr.dataset.zone;
                const coolSAT = parseFloat(tr.querySelector('[data-f="coolSAT"]').value);
                const coolDT = parseFloat(tr.querySelector('[data-f="coolDT"]').value);
                const heatSAT = parseFloat(tr.querySelector('[data-f="heatSAT"]').value);
                const heatDT = parseFloat(tr.querySelector('[data-f="heatDT"]').value);
                const sfHeat = parseFloat(tr.querySelector('[data-f="sfHeat"]').value);
                const sfCool = parseFloat(tr.querySelector('[data-f="sfCool"]').value);
                const dsoa = tr.querySelector('[data-f="dsoa"]').value;

                if (!isNaN(coolSAT) || !isNaN(coolDT) || !isNaN(heatSAT) || !isNaN(heatDT) || !isNaN(sfHeat) || !isNaN(sfCool) || dsoa) {
                    newZones.push({
                        zoneName,
                        zoneCoolingDesignSupplyAirTemperature: isNaN(coolSAT) ? undefined : coolSAT,
                        zoneCoolingDesignSupplyAirTemperatureDifference: isNaN(coolDT) ? undefined : coolDT,
                        zoneHeatingDesignSupplyAirTemperature: isNaN(heatSAT) ? undefined : heatSAT,
                        zoneHeatingDesignSupplyAirTemperatureDifference: isNaN(heatDT) ? undefined : heatDT,
                        zoneHeatingSizingFactor: isNaN(sfHeat) ? undefined : sfHeat,
                        zoneCoolingSizingFactor: isNaN(sfCool) ? undefined : sfCool,
                        designSpecOutdoorAirName: dsoa || undefined
                    });
                }
            });
            setSizingZones(project, newZones);
            alert('Zone sizing saved.');
        });

    } else if (sizingType === 'system-sizing') {
        // Placeholder for System Sizing (similar logic)
        container.innerHTML = `<div class="p-4 text-center text-[--text-secondary]">System Sizing configuration is not yet implemented in this view.</div>`;
    } else if (sizingType === 'plant-sizing') {
        // Placeholder for Plant Sizing
        container.innerHTML = `<div class="p-4 text-center text-[--text-secondary]">Plant Sizing configuration is not yet implemented in this view.</div>`;
    }
}
